const ganache = require('ganache')
const { ethers } = require('ethers')
const { compile } = require('../build.cjs')
const { approval } = require('./approval.cjs')

async function sandbox() {
 const engine = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' },
   wallet: { totalAccounts: 7, defaultBalance: 100 }, miner: { instamine: 'eager' } })
 const provider = new ethers.providers.Web3Provider(engine)
 provider.pollingInterval = 20
 const accounts = Object.entries(engine.getInitialAccounts()).map(([, account]) => new ethers.Wallet(account.secretKey, provider))
 const [deployer, seller, buyer, bidder, verifier, creator, friend] = accounts
 const artifact = compile()
 const market = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer).deploy(verifier.address, creator.address)
 await market.deployed()
 async function mine(n = 5) { for (let i = 0; i < n; i++) await provider.send('evm_mine', []) }
 async function advance(seconds) { await provider.send('evm_increaseTime', [seconds]); await mine(1) }
 async function deposit(id, who = seller) {
  const receipt = await (await who.sendTransaction({ to: market.address, data: id })).wait()
  await mine()
  return receipt
 }
 return { engine, provider, market, accounts, deployer, seller, buyer, bidder, verifier, creator, friend, mine, advance, deposit,
  approval: options => approval(market, verifier, options), close: () => engine.disconnect() }
}
module.exports = { sandbox }
