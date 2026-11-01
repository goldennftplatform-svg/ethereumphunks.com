const { ethers } = require('ethers')
const { approval } = require('./approval.cjs')

// Production boundary: the signer is trusted to attest Ethscriptions ownership.
// Do not call approval() directly from a public handler. Never accept an item
// manifest, RPC URL, signer key or indexer URL from the requesting browser.
async function verifiedApproval({ market, signer, indexer, expectedChainId, expectedMarket, minter, manifest }, request) {
 const { id, seller, buyer, kind, amount, duration } = request
 if (!/^0x[0-9a-f]{64}$/i.test(id || '') || !ethers.utils.isAddress(seller)) throw new Error('Invalid asset or seller')
 if (![0, 1].includes(kind)) throw new Error('Invalid sale type')
 if (kind === 0 && (!ethers.utils.isAddress(buyer) || buyer.toLowerCase() === seller.toLowerCase())) throw new Error('Invalid buyer')
 if ((await market.provider.getNetwork()).chainId !== expectedChainId || market.address.toLowerCase() !== expectedMarket.toLowerCase()) throw new Error('Deployment mismatch')
 if ((await market.verifier()).toLowerCase() !== signer.address.toLowerCase()) throw new Error('Verifier mismatch')
 const committed = await manifest(id)
 if (!committed || !/^0x[0-9a-f]{64}$/i.test(committed.contentSha)) throw new Error('Asset not registered in this collection')
 const [asset, status, head, received] = await Promise.all([
  indexer('/ethscriptions/' + id), indexer('/status'), market.provider.getBlock('latest'), market.depositBlock(seller, id)
 ])
 if (received.isZero() || head.number - received.toNumber() < 5) throw new Error('Deposit cooldown not complete')
 const imported = Number(status.last_imported_block)
 if (!Number.isSafeInteger(imported) || imported < head.number - 2) throw new Error('Indexer is behind; no authorization issued')
 const eq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
 if (!eq(asset.transaction_hash, id) || !eq(asset.creator, minter) || !eq(asset.content_sha, committed.contentSha)) throw new Error('Collection provenance mismatch')
 if (!eq(asset.current_owner, market.address) || !eq(asset.previous_owner, seller)) throw new Error('Indexer does not confirm seller custody')
 const deposits = (asset.ethscription_transfers || []).filter(t => eq(t.from_address, seller) && eq(t.to_address, market.address) && Number(t.block_number) === received.toNumber())
 if (deposits.length !== 1) throw new Error('Deposit proof missing or ambiguous')
 const deposit = deposits[0]
 const [tx, receipt] = await Promise.all([market.provider.getTransaction(deposit.transaction_hash), market.provider.getTransactionReceipt(deposit.transaction_hash)])
 if (!tx || !receipt || receipt.status !== 1 || receipt.blockNumber !== received.toNumber() || !eq(tx.from, seller) || !eq(tx.to, market.address) || !eq(tx.data, id) || !tx.value.isZero()) throw new Error('Deposit transaction mismatch')
 if (kind === 1) {
  if (!Number.isInteger(duration) || duration < 3600 || duration > 604800 || !ethers.BigNumber.from(amount).gt(0)) throw new Error('Invalid auction terms')
  const current = await market.auctions(seller, id)
  if (!current.end.isZero() && !current.settled) throw new Error('Auction already active')
 }
 return approval(market, signer, { id, seller, buyer: kind === 0 ? buyer : ethers.constants.AddressZero, kind, amount: kind === 0 ? undefined : amount, duration: kind === 0 ? 0 : duration })
}
module.exports = { verifiedApproval }
