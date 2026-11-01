'use strict'
// LOCAL TEST ONLY: generated accounts, fake ETH, in-memory chain 31337.
// No mainnet RPC or wallet key is loaded, and no wallet extension is requested.
const http = require('http')
const fs = require('fs')
const path = require('path')
const { ethers } = require('ethers')
const { sandbox } = require('./lib/sandbox-chain.cjs')
const PORT = 8895
const ORIGIN = 'http://127.0.0.1:' + PORT
async function main() {
 const s = await sandbox()
 const personas = { seller: s.seller, buyer: s.buyer, bidder: s.bidder }
 const initialItems = () => Array.from({ length: 10 }, (_, number) => ({ number, id: ethers.utils.id('LOCAL-DEMO-PHUNK-' + number),
  owner: number < 6 ? s.seller.address : number < 8 ? s.buyer.address : s.bidder.address, depositor: '' }))
 let items = initialItems()
 let snapshot = await s.provider.send('evm_snapshot', [])
 const events = []
 let queue = Promise.resolve()
 function serial(fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result }
 async function state() {
  const head = await s.provider.getBlock('latest')
  const accounts = {}
  for (const [name, wallet] of Object.entries(personas)) accounts[name] = { address: wallet.address, balance: ethers.utils.formatEther(await wallet.getBalance()), credit: ethers.utils.formatEther(await s.market.credits(wallet.address)) }
  accounts.creator = { address: s.creator.address, credit: ethers.utils.formatEther(await s.market.credits(s.creator.address)) }
  const rows = []
  for (const item of items) {
   const seller = item.depositor || s.seller.address
   const offer = await s.market.listings(seller, item.id), auction = await s.market.auctions(seller, item.id)
   rows.push({ ...item, price: ethers.utils.formatEther(offer.price), nonce: offer.nonce.toString(),
    auction: { reserve: ethers.utils.formatEther(auction.reserve), amount: ethers.utils.formatEther(auction.amount), end: auction.end.toNumber(), bidder: auction.bidder, nonce: auction.nonce.toString(), settled: auction.settled },
    cooldown: item.depositor ? (await s.market.blocksRemainingUntilValidTransfer(seller, item.id)).toNumber() : 0 })
  }
  return { mode: 'LOCAL EVM SANDBOX — FAKE ETH', chainId: 31337, contract: s.market.address, block: head.number, timestamp: head.timestamp, accounts, total: items.length, items: rows, events: events.slice(-20).reverse() }
 }
 function consume(receipt) {
  for (const event of receipt.events || []) {
   if (event.event !== 'ethscriptions_protocol_TransferEthscriptionForPreviousOwner') continue
   const item = items.find(i => i.id === event.args.id)
   if (item && item.owner.toLowerCase() === s.market.address.toLowerCase() && item.depositor.toLowerCase() === event.args.previousOwner.toLowerCase()) {
    item.owner = event.args.recipient; item.depositor = ''
   }
  }
 }
 async function action(body) {
  const wallet = personas[body.persona]
  if (!wallet) throw new Error('Choose a test persona')
  if (body.action === 'reset') {
   if (body.confirm !== 'RESET LOCAL DEMO') throw new Error('Reset confirmation required')
   if (!await s.provider.send('evm_revert', [snapshot])) throw new Error('Reset failed; restart the local server')
   snapshot = await s.provider.send('evm_snapshot', [])
   items = initialItems(); events.length = 0
   return { message: 'Local demo reset. Seller has 6 pieces; Buyer and Bidder each have 2. Fake balances and credits restored.' }
  }
  if (body.action === 'advance') { await s.advance(3700); return { message: 'Advanced local-chain time by 3,700 seconds.' } }
  if (body.action === 'mine') { await s.mine(5); return { message: 'Mined five local blocks.' } }
  const item = items.find(i => i.number === Number(body.number))
  const market = s.market.connect(wallet)
  let tx
  if (body.action === 'withdraw') tx = await market.withdraw(wallet.address)
  else {
   if (!item) throw new Error('Unknown demo asset')
   const isOwner = item.owner.toLowerCase() === wallet.address.toLowerCase()
   const isDepositor = item.depositor.toLowerCase() === wallet.address.toLowerCase()
   const amount = () => {
    const value = String(body.price || '')
    if (!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error('Enter a positive ETH price')
    const wei = ethers.utils.parseEther(value)
    if (wei.lte(0) || wei.gt(ethers.utils.parseEther('10'))) throw new Error('Sandbox price must be greater than zero and at most 10 ETH')
    return wei
   }
   if (body.action === 'deposit') {
    if (!isOwner) throw new Error('Only the simulated current owner can deposit')
    tx = await wallet.sendTransaction({ to: s.market.address, data: item.id })
   } else if (body.action === 'list') {
    if (!isDepositor) throw new Error('Deposit this piece first')
    tx = await market.list(item.id, amount())
   } else if (body.action === 'cancel') {
    if (!isDepositor) throw new Error('Only the depositor can withdraw this piece')
    tx = await market.cancel(item.id)
   } else if (body.action === 'buy') {
    if (!item.depositor || item.owner !== s.market.address) throw new Error('Verified custody required')
    const offer = await market.listings(item.depositor, item.id)
    if (offer.price.isZero()) throw new Error('Not listed')
    const auth = await s.approval({ id: item.id, seller: item.depositor, buyer: wallet.address })
    tx = await market.buy(auth.approval, auth.signature, { value: offer.price })
   } else if (body.action === 'auction') {
    if (!isDepositor || item.owner !== s.market.address) throw new Error('Verified custody required')
    const auth = await s.approval({ id: item.id, seller: wallet.address, kind: 1, amount: amount(), duration: 3600 })
    tx = await market.startAuction(auth.approval, auth.signature)
   } else if (body.action === 'bid' || body.action === 'settle') {
    if (!item.depositor) throw new Error('No auction')
    const a = await market.auctions(item.depositor, item.id)
    tx = body.action === 'bid' ? await market.bid(item.depositor, item.id, a.nonce, { value: amount() }) : await market.settle(item.depositor, item.id, a.nonce)
   } else throw new Error('Unknown action')
  }
  const receipt = await tx.wait()
  if (body.action === 'deposit') {
   item.owner = s.market.address; item.depositor = wallet.address
   if (body.autoMine !== false) await s.mine(5)
  }
  consume(receipt)
  events.push({ action: body.action, number: item && item.number, persona: body.persona, hash: receipt.transactionHash, gas: receipt.gasUsed.toString() })
  return { message: body.action === 'deposit' && body.autoMine !== false ? 'Piece moved to MY ESCROW. Five local cooldown blocks mined automatically.' : body.action + ' confirmed on LOCAL chain', hash: receipt.transactionHash }
 }
 const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  function json(status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
  try {
   if (req.headers.host !== '127.0.0.1:' + PORT && req.headers.host !== 'localhost:' + PORT) return json(403, { error: 'Loopback host required' })
   const url = new URL(req.url, ORIGIN)
   if (url.pathname === '/api/state' && req.method === 'GET') return json(200, await serial(state))
   if (url.pathname === '/api/action' && req.method === 'POST') {
    if (![ORIGIN, 'http://localhost:' + PORT].includes(req.headers.origin) || req.headers['x-sandbox'] !== '1' || !String(req.headers['content-type']).startsWith('application/json')) return json(403, { error: 'Local sandbox origin required' })
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return json(413, { error: 'Request too large' }) }
    const body = JSON.parse(raw)
    return json(200, await serial(async () => ({ ok: true, ...await action(body), state: await state() })))
   }
   if (req.method !== 'GET') return json(405, { error: 'Method not allowed' })
   if (url.pathname === '/' || url.pathname === '/app.js' || url.pathname === '/style.css') {
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    const data = fs.readFileSync(path.join(__dirname, 'web', filename))
    res.writeHead(200, { 'Content-Type': filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html' }); return res.end(data)
   }
   const image = /^\/art\/([0-9])\.png$/.exec(url.pathname)
   if (image) {
    const file = path.resolve(__dirname, '../../DOSWAPZ/assets/ethscriptions/phunks/img', image[1] + '.png')
    if (fs.existsSync(file)) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(fs.readFileSync(file)) }
    res.writeHead(302, { Location: 'https://trixmoji.netlify.app/assets/ethscriptions/phunks/img/' + image[1] + '.png' }); return res.end()
   }
   json(404, { error: 'Not found' })
  } catch (e) { json(400, { ok: false, error: e.reason || e.message }) }
 })
 server.listen(PORT, '127.0.0.1', () => console.log('LOCAL MARKET SANDBOX: ' + ORIGIN + ' — fake ETH, no real wallets.'))
 process.on('SIGINT', async () => { server.close(); await s.close(); process.exit(0) })
}
main().catch(e => { console.error(e); process.exitCode = 1 })
