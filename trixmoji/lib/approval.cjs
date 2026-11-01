const { ethers } = require('ethers')
const types = { Approval: [
 { name: 'id', type: 'bytes32' }, { name: 'seller', type: 'address' }, { name: 'buyer', type: 'address' },
 { name: 'amount', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'depositBlock', type: 'uint256' },
 { name: 'deadline', type: 'uint256' }, { name: 'kind', type: 'uint8' }, { name: 'duration', type: 'uint256' }
] }
async function domain(market) {
 return { name: 'TrixmojiMarket', version: '1', chainId: (await market.provider.getNetwork()).chainId, verifyingContract: market.address }
}
async function approval(market, signer, { id, seller, buyer = ethers.constants.AddressZero, kind = 0, amount, duration = 0 }) {
 const block = await market.provider.getBlock('latest')
 const offer = await market.listings(seller, id)
 const nonce = kind === 0 ? offer.nonce : (await market.nonces(seller, id)).add(1)
 const value = { id, seller, buyer, kind, amount: String(amount === undefined ? offer.price : amount),
  duration, nonce: nonce.toString(), depositBlock: (await market.depositBlock(seller, id)).toString(), deadline: block.timestamp + 120 }
 return { approval: value, signature: await signer._signTypedData(await domain(market), types, value) }
}
module.exports = { approval, types, domain }
