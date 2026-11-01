const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ethers } = require('ethers')
const { verifiedApproval } = require('../lib/verified-approval.cjs')
const { domain, types } = require('../lib/approval.cjs')

function fixture() {
 const signer = ethers.Wallet.createRandom(), seller = ethers.Wallet.createRandom().address, buyer = ethers.Wallet.createRandom().address
 const address = ethers.Wallet.createRandom().address, minter = ethers.Wallet.createRandom().address
 const id = ethers.utils.id('mint'), sha = ethers.utils.id('content'), hash = ethers.utils.id('deposit')
 const asset = { transaction_hash: id, creator: minter, content_sha: sha, current_owner: address, previous_owner: seller,
  ethscription_transfers: [{ from_address: seller, to_address: address, block_number: 100, transaction_hash: hash }] }
 const status = { last_imported_block: 110 }
 const tx = { from: seller, to: address, data: id, value: ethers.BigNumber.from(0) }
 const receipt = { status: 1, blockNumber: 100 }
 const market = { address, provider: { getNetwork: async () => ({ chainId: 1 }), getBlock: async () => ({ number: 110, timestamp: 1000 }),
  getTransaction: async () => tx, getTransactionReceipt: async () => receipt }, verifier: async () => signer.address,
  depositBlock: async () => ethers.BigNumber.from(100), listings: async () => ({ price: ethers.BigNumber.from(100), nonce: ethers.BigNumber.from(1) }),
  nonces: async () => ethers.BigNumber.from(1), auctions: async () => ({ end: ethers.BigNumber.from(0), settled: false }) }
 const config = { market, signer, minter, expectedMarket: address, expectedChainId: 1, indexer: async url => url === '/status' ? status : asset, manifest: async () => ({ contentSha: sha }) }
 return { signer, seller, buyer, address, asset, status, tx, receipt, market, config, request: { id, seller, buyer, kind: 0 } }
}
test('production verifier signs only an indexed, confirmed, manifest-bound custody record', async () => {
 const f = fixture(), result = await verifiedApproval(f.config, f.request)
 assert.equal(ethers.utils.verifyTypedData(await domain(f.market), types, result.approval, result.signature), f.signer.address)
 assert.equal(result.approval.amount, '100')
 assert.equal(result.approval.deadline, 1120)
})
test('forged seller, stale index, mismatched art, absent manifest, and reverted deposits fail closed', async () => {
 const mutations = [
  f => { f.asset.previous_owner = f.buyer },
  f => { f.asset.current_owner = f.buyer },
  f => { f.asset.content_sha = ethers.utils.id('wrong') },
  f => { f.asset.creator = f.buyer },
  f => { f.status.last_imported_block = 80 },
  f => { f.config.manifest = async () => null },
  f => { f.receipt.status = 0 },
  f => { f.tx.data = '0x1234' },
  f => { f.tx.from = f.buyer },
  f => { f.asset.ethscription_transfers = [] },
  f => { f.config.expectedChainId = 31337 }
 ]
 for (const mutate of mutations) { const f = fixture(); mutate(f); await assert.rejects(verifiedApproval(f.config, f.request)) }
})
