# TRIXMOJI secondary-market lab

This is the new, isolated integration for DOSWAPZ's existing Ethereum Ethscriptions. The upstream Angular/Nest/Supabase application is preserved. You do not need to boot that entire application to test this lab.

## Test now (no funds or wallet extension)

```sh
cd trixmoji
npm ci --ignore-scripts
npm test
npm run sandbox
```

Open **http://127.0.0.1:8895**. This is a disposable local EVM (chain 31337), not a publicly hosted mainnet marketplace. It generates fresh test accounts on startup, gives them fake ETH, deploys the contract locally, and simulates Ethscriptions ownership from the contract's ESIP-2 events. Real minted assets are never deposited or moved. The catalogue contains **1,000 artwork previews (#0–999)** with 40 items per page and a jump-to-number control. All start as simulated Seller assets; this does not assert ownership or mint status on Ethereum mainnet.

Windows shortcut: double-click `START-MARKET-LAB.cmd` (requires Node.js/npm). If the lab is already running on port 8895, use that instance instead of starting another.

1. As **Seller**, DEPOSIT a piece, then MINE 5 BLOCKS.
2. LIST FOR SALE. Switch to **Buyer** and BUY. Check ownership, seller credit, and creator royalty credit.
3. Switch back to Seller and WITHDRAW MY CREDIT. Withdrawal is a separate transaction.
4. Deposit another piece and START AUCTION. Bid as Buyer, then outbid as Bidder by at least 5%.
5. ADVANCE 1 HOUR +, SETTLE AUCTION. The winner receives the simulated asset. The previous bidder withdraws their refund.
6. A no-bid auction returns the piece to its seller after settlement. An active auction cannot be cancelled or relisted.

Restarting resets everything. The server binds only to 127.0.0.1, checks the Host/Origin/header on mutations, and does not expose JSON-RPC or private keys. **Do not deploy sandbox.cjs to a public host.** It is an intentionally auto-signing local test harness.

## What is implemented

- Fixed-price listing, price update, cancellation/return, buyer-specific short-lived authorization, purchase and withdrawal.
- Multiple concurrent auctions keyed by seller and creation transaction hash, reserve price, 5% minimum increment, 5-minute anti-sniping extension, outbid refunds, permissionless settlement, and no-bid returns.
- Exact-value purchase and price/nonce/deposit-block checks to reject stale quotes and replay.
- Immutable **2.5% creator royalty deducted from the sale price**, seller credited 97.5%; no separate site fee. ETH is credited for pull withdrawal, not automatically pushed to seller wallets.
- ESIP-2 `ethscriptions_protocol_TransferEthscriptionForPreviousOwner` events and five-block deposit cooldown from the upstream MIT-licensed EthscriptionsEscrower.
- Local EVM tests and a production verification boundary in `lib/verified-approval.cjs`.

## Verification completed

Ten automated tests pass against local EVM settlement and the verifier boundary. Browser testing completed a fixed-price sale with 97.5/2.5 credit split and seller withdrawal, followed by a two-bidder auction, settlement, and outbid refund withdrawal. A 390px viewport had no horizontal overflow. These tests do not prove mainnet indexer behavior or constitute a security audit.

## Critical trust boundary

Ethscriptions ownership is indexed off-chain; ordinary Solidity storage cannot prove that a calldata deposit actually transferred a valid Ethscription. Merely emitting an event is insufficient.

This contract **requires an EIP-712 approval from an immutable verifier address** for each fixed-price purchase and each auction creation. The verifier checks chain/market identity, collection manifest, creator minter, content hash, current and previous indexed owners, latest indexed height, matching deposit transaction, successful receipt, and the five-block cooldown. Quotes bind buyer (for purchases), seller, asset, price, nonce, deposit block, deadline, action type, and duration. They expire after two minutes.

This is an explicit **trusted indexer/signer design**, not trustless ownership verification. Compromise of the verifier can authorize invalid sales. Loss of the signer prevents new authorized sales/auctions, but sellers can still withdraw inactive deposits and existing auctions can still settle. Deploy the signer behind a protected server-side signing service. Never use the creator's treasury private key in the app; use a separate minimal-purpose verifier. The server must never sign based solely on browser-submitted ownership claims.

`lib/verified-approval.cjs` is the production authorization validator, **not a deployed HTTP signing endpoint**. It needs an authenticated/protected service integration, bounded rate limits, a trusted collection registry, and a configured Ethereum RPC + protocol indexer before production use.

## Production work remaining

1. Independent security review of the adapted contract and signing service. The upstream repository itself states that its contracts are unaudited.
2. Choose and securely provision the verifier address; confirm the existing creator payout wallet.
3. Wire verifiedApproval to a backend service using the existing authoritative mint registry. Populate the registry for transfers/resales as well as primary buyers. Do not issue sandbox approvals in production.
4. Build the live EIP-1193 wallet transaction adapter and persistent listing discovery/indexing. This sandbox's generated personas and modeled owners must not be used as production data.
5. Deploy **a separate resale contract**, verify source/bytecode, and configure its address/start block. The existing minter is unchanged. No mainnet deployment script auto-runs and no deployment has been submitted.
6. Verify a real Ethscription deposit, listing, purchase, current-owner indexing, and payout withdrawal on the target protocol before opening public sales. Local EVM tests cannot prove mainnet indexer behavior.
7. Integrate the live interface with DOSWAPZ, keeping one authoritative market backend and the existing mint registry. Auction settlement needs a transaction from any caller after expiry (or an explicitly funded keeper); passage of time alone sends no transaction.

## Build and dependency notes

`npm run build` emits ABI/bytecode to ignored `artifacts/TrixmojiMarket.json`; it does not deploy. Solidity is pinned to 0.8.20, optimizer 200 runs, Shanghai target, OpenZeppelin 5.0.2. Ganache is a development-only local EVM. On Node 22 Windows it may fall back from its native websocket module to JavaScript; tests still run.

The isolated development dependency tree currently reports npm advisories including high/critical advisories. This is another reason the auto-signing sandbox must remain local and not be shipped as a public service. Review/update the production dependency set before deploying a real verifier.

## Upstream attribution and compatibility

- Fork: https://github.com/goldennftplatform-svg/ethereumphunks.com
- Source: https://github.com/Ethereum-Phunks/ethereumphunks.com (branch `market`). Escrower file retains its MIT header.
- Auction design reference: https://github.com/Crypto-Phunks/auction-house (fork https://github.com/goldennftplatform-svg/auction-house). Its Solidity files carry GPL-3.0 despite the top-level CC0 license. This adaptation is GPL-3.0 and preserves that licensing expectation.
- The Crypto-Phunks contract uses ERC-721 balanceOf/tokenOfOwnerByIndex/transferFrom and cannot transfer these existing Ethscriptions. No ERC-721 mint or wrapper is introduced here.
- The older Ethereum-Phunks V1 auction reads a per-owner auction but updates a different global auction in bidding and settlement. This integration uses one consistent per-seller/per-id storage record and includes tests covering settlement and double settlement.

The primary mint and its contract remain independent of this lab.
