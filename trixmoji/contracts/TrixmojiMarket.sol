// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

// Ethscriptions transfer/cooldown implementation from Ethereum-Phunks (MIT).
import "../../contracts/contracts/V2_1/EthscriptionsEscrower.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Fixed-price and timed-auction settlement for indexed Ethscriptions.
/// @dev The EVM cannot determine Ethscription ownership. A trusted indexer signer
/// attests eligible deposits. Its signature is REQUIRED, not an optional UI check.
contract TrixmojiMarket is EthscriptionsEscrower, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;
    address public immutable verifier;
    address public immutable creator;
    uint256 public constant ROYALTY_BPS = 250;
    uint256 public constant TIME_BUFFER = 5 minutes;
    uint256 public constant MIN_INCREMENT_BPS = 500;
    bytes32 private constant APPROVAL_TYPEHASH = keccak256(
        "Approval(bytes32 id,address seller,address buyer,uint256 amount,uint256 nonce,uint256 depositBlock,uint256 deadline,uint8 kind,uint256 duration)"
    );
    struct Listing { uint256 price; uint256 nonce; }
    struct Auction { uint256 reserve; uint256 amount; uint256 end; address bidder; uint256 nonce; bool settled; }
    struct Approval {
        bytes32 id; address seller; address buyer; uint256 amount; uint256 nonce;
        uint256 depositBlock; uint256 deadline; uint8 kind; uint256 duration;
    }
    mapping(address => mapping(bytes32 => Listing)) public listings;
    mapping(address => mapping(bytes32 => Auction)) public auctions;
    mapping(address => mapping(bytes32 => uint256)) public nonces;
    mapping(address => uint256) public credits;

    event Deposited(address indexed seller, bytes32 indexed id, uint256 blockNumber);
    event Listed(address indexed seller, bytes32 indexed id, uint256 price, uint256 nonce);
    event Cancelled(address indexed seller, bytes32 indexed id);
    event Sold(address indexed seller, address indexed buyer, bytes32 indexed id, uint256 price, uint256 royalty);
    event AuctionStarted(address indexed seller, bytes32 indexed id, uint256 reserve, uint256 end, uint256 nonce);
    event Bid(address indexed seller, bytes32 indexed id, address bidder, uint256 amount, uint256 end);
    event AuctionSettled(address indexed seller, bytes32 indexed id, address buyer, uint256 amount);
    event CreditWithdrawn(address indexed account, address indexed recipient, uint256 amount);

    constructor(address verifier_, address creator_) EIP712("TrixmojiMarket", "1") {
        require(verifier_ != address(0) && creator_ != address(0), "zero address");
        verifier = verifier_; creator = creator_;
    }

    // ESIP-compatible deposit: 0 ETH, raw creation transaction hash as calldata.
    fallback() external {
        require(msg.sender == tx.origin, "EOA deposit required");
        _onPotentialEthscriptionDeposit(msg.sender, msg.data);
        emit Deposited(msg.sender, abi.decode(msg.data, (bytes32)), block.number);
    }

    function depositBlock(address seller, bytes32 id) public view returns (uint256) {
        return EthscriptionsEscrowerStorage.s().ethscriptionReceivedOnBlockNumber[seller][id];
    }
    function _activeAuction(address seller, bytes32 id) private view returns (bool) {
        Auction memory a = auctions[seller][id];
        return a.end != 0 && !a.settled;
    }
    function _approve(Approval calldata a, bytes calldata signature) private view {
        require(a.deadline >= block.timestamp && a.deadline <= block.timestamp + 5 minutes, "approval expired");
        require(a.depositBlock != 0 && a.depositBlock == depositBlock(a.seller, a.id), "deposit changed");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(APPROVAL_TYPEHASH,
            a.id, a.seller, a.buyer, a.amount, a.nonce, a.depositBlock, a.deadline, a.kind, a.duration)));
        require(digest.recover(signature) == verifier, "invalid verifier");
    }
    function list(bytes32 id, uint256 price) external nonReentrant {
        require(price > 0, "zero price");
        require(!_activeAuction(msg.sender, id), "auction active");
        _validateTransferEthscription(msg.sender, msg.sender, id);
        uint256 nonce = ++nonces[msg.sender][id];
        listings[msg.sender][id] = Listing(price, nonce);
        emit Listed(msg.sender, id, price, nonce);
    }
    function cancel(bytes32 id) external nonReentrant {
        require(!_activeAuction(msg.sender, id), "auction active");
        delete listings[msg.sender][id]; ++nonces[msg.sender][id];
        _transferEthscription(msg.sender, msg.sender, id);
        emit Cancelled(msg.sender, id);
    }
    function buy(Approval calldata a, bytes calldata signature) external payable nonReentrant {
        require(a.kind == 0 && a.duration == 0 && a.buyer == msg.sender && msg.sender != a.seller, "invalid purchase");
        Listing memory offer = listings[a.seller][a.id];
        require(offer.price > 0 && offer.price == a.amount && offer.nonce == a.nonce && msg.value == a.amount, "listing changed");
        _approve(a, signature);
        delete listings[a.seller][a.id]; ++nonces[a.seller][a.id];
        _transferEthscription(a.seller, msg.sender, a.id);
        uint256 royalty = _credit(a.seller, msg.value);
        emit Sold(a.seller, msg.sender, a.id, msg.value, royalty);
    }
    function startAuction(Approval calldata a, bytes calldata signature) external nonReentrant {
        require(a.kind == 1 && a.seller == msg.sender && a.buyer == address(0), "invalid auction");
        require(a.amount > 0 && a.duration >= 1 hours && a.duration <= 7 days, "auction bounds");
        require(!_activeAuction(msg.sender, a.id) && a.nonce == nonces[msg.sender][a.id] + 1, "auction changed");
        _validateTransferEthscription(msg.sender, msg.sender, a.id); _approve(a, signature);
        delete listings[msg.sender][a.id]; nonces[msg.sender][a.id] = a.nonce;
        auctions[msg.sender][a.id] = Auction(a.amount, 0, block.timestamp + a.duration, address(0), a.nonce, false);
        emit AuctionStarted(msg.sender, a.id, a.amount, block.timestamp + a.duration, a.nonce);
    }
    function bid(address seller, bytes32 id, uint256 expectedNonce) external payable nonReentrant {
        Auction storage a = auctions[seller][id];
        require(a.end > block.timestamp && !a.settled && a.nonce == expectedNonce && msg.sender != seller, "auction unavailable");
        uint256 increment = (a.amount * MIN_INCREMENT_BPS + 9999) / 10000;
        require(msg.value >= a.reserve && (a.bidder == address(0) || msg.value >= a.amount + increment), "bid too low");
        if (a.bidder != address(0)) credits[a.bidder] += a.amount;
        a.bidder = msg.sender; a.amount = msg.value;
        if (a.end - block.timestamp < TIME_BUFFER) a.end = block.timestamp + TIME_BUFFER;
        emit Bid(seller, id, msg.sender, msg.value, a.end);
    }
    function settle(address seller, bytes32 id, uint256 expectedNonce) external nonReentrant {
        Auction storage a = auctions[seller][id];
        require(a.end != 0 && block.timestamp >= a.end && !a.settled && a.nonce == expectedNonce, "not settleable");
        a.settled = true; ++nonces[seller][id];
        address recipient = a.bidder == address(0) ? seller : a.bidder;
        _transferEthscription(seller, recipient, id);
        if (a.amount > 0) _credit(seller, a.amount);
        emit AuctionSettled(seller, id, recipient, a.amount);
    }
    function _credit(address seller, uint256 amount) private returns (uint256 royalty) {
        royalty = amount * ROYALTY_BPS / 10000;
        credits[seller] += amount - royalty; credits[creator] += royalty;
    }
    function withdraw(address payable recipient) external nonReentrant {
        require(recipient != address(0), "zero recipient");
        uint256 amount = credits[msg.sender]; require(amount > 0, "no credit");
        credits[msg.sender] = 0;
        (bool ok,) = recipient.call{value: amount}(""); require(ok, "withdraw failed");
        emit CreditWithdrawn(msg.sender, recipient, amount);
    }
}
