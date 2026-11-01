(() => {
 'use strict'
 let state, busy = false, view = 'wallet'
 const drafts = new Map()
 const el = id => document.getElementById(id)
 const persona = () => el('persona').value
 const short = address => address.slice(0, 7) + '…' + address.slice(-5)
 const eq = (a, b) => a && b && a.toLowerCase() === b.toLowerCase()
 const label = address => Object.entries(state.accounts).find(([, a]) => eq(a.address, address))?.[0] || (eq(address, state.contract) ? 'MARKET ESCROW' : short(address))
 function status(text, error = false) { el('status').textContent = text; el('status').className = error ? 'error' : '' }
 async function refresh() {
  if (busy) return
  busy = true; draw()
   try { const r = await fetch('/api/state'); const data = await r.json(); if (!r.ok) throw new Error(data.error); state = data } catch (e) { status(e.message, true) }
  finally { busy = false; draw() }
 }
 async function action(kind, number, price) {
  if (busy) return
  busy = true; draw(); status('Executing ' + kind + ' on local chain…')
  try {
   const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sandbox': '1' }, body: JSON.stringify({ action: kind, number, price, persona: persona(), autoMine: el('autoMine').checked, confirm: kind === 'reset' ? 'RESET LOCAL DEMO' : undefined }) })
   const data = await r.json(); if (!r.ok || !data.ok) throw new Error(data.error || 'Action failed')
   state = data.state
   if (kind === 'deposit') view = 'escrow'
   if (kind === 'list') view = 'sale'
   if (kind === 'auction') view = 'auction'
   if (kind === 'buy' || kind === 'cancel') view = 'wallet'
   if (kind === 'reset') { view = 'wallet'; drafts.clear() }
   status(data.message + (data.hash ? ' · ' + short(data.hash) : ''))
  } catch (e) { status(e.message, true) }
  finally { busy = false; draw() }
 }
 function draw() {
  if (!state) return
  const account = state.accounts[persona()]
  const activeAuction = item => item.auction.end > 0 && !item.auction.settled
  const filters = {
   wallet: item => eq(account.address, item.owner),
   escrow: item => eq(account.address, item.depositor),
   sale: item => Number(item.price) > 0,
   auction: activeAuction,
   all: () => true
  }
  const names = { wallet: 'MY WALLET', escrow: 'MY ESCROW', sale: 'FOR SALE', auction: 'AUCTIONS', all: 'ALL PIECES' }
  const help = {
   wallet: 'Pieces held by ' + persona() + '. Move one to escrow to list it or start an auction.',
   escrow: 'Your deposited pieces. The market holds them until sold, auctioned, or returned. An active auction must finish before return.',
   sale: 'Listings from every test account. Switch to another account to buy; you cannot buy your own listing.',
   auction: 'Active and ended auctions awaiting settlement. Any test account can settle after the timer ends.',
   all: 'All 10 test pieces and their current location. These are simulated assets, not mainnet holdings.'
  }
  el('viewHelp').textContent = help[view]
  document.querySelectorAll('#views button').forEach(button => {
   const key = button.dataset.view
   button.textContent = names[key] + ' (' + state.items.filter(filters[key]).length + ')'
   button.classList.toggle('selected', view === key)
   button.setAttribute('aria-pressed', String(view === key)); button.disabled = busy
  })
  el('block').textContent = 'BLOCK ' + state.block + ' · ' + new Date(state.timestamp * 1000).toISOString().slice(11, 19)
  el('wallet').textContent = short(account.address) + ' · ' + Number(account.balance).toFixed(4) + ' test ETH · CREDIT ' + account.credit + ' ETH'
  el('withdraw').disabled = busy || Number(account.credit) === 0
  el('persona').disabled = busy
  el('autoMine').disabled = busy
  for (const id of ['refresh', 'mine', 'advance', 'reset']) el(id).disabled = busy
  el('contract').textContent = 'LOCAL CONTRACT: ' + state.contract + ' · test assets reset when the server restarts'
  el('creator').textContent = 'Creator royalty credit: ' + state.accounts.creator.credit + ' test ETH'
  el('cards').innerHTML = ''
  const visible = state.items.filter(filters[view])
  if (!visible.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = view === 'escrow' ? 'Nothing in escrow yet. Open My Wallet and move a piece into escrow.' : 'No pieces in this view yet. Switch tabs or test accounts to continue.'; el('cards').appendChild(empty) }
  for (const item of visible) {
   const owner = eq(account.address, item.owner), depositor = eq(account.address, item.depositor)
   const auction = item.auction.end > 0 && !item.auction.settled, ended = auction && item.auction.end <= state.timestamp
   const listed = Number(item.price) > 0
   const card = document.createElement('article'); card.className = 'card'
   const art = document.createElement('div'); art.className = 'art'
   const img = document.createElement('img'); img.src = '/art/' + item.number + '.png'; img.alt = 'Demo Phunk ' + item.number; img.loading = 'lazy'; img.decoding = 'async'; art.appendChild(img)
   const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = auction ? ended ? 'READY TO SETTLE' : 'AUCTION' : listed ? 'FOR SALE' : item.depositor ? 'DEPOSITED' : 'IN WALLET'; art.appendChild(badge)
   card.appendChild(art)
   const body = document.createElement('div'); body.className = 'body'
   const heading = document.createElement('h2'); heading.textContent = 'PHUNK #' + item.number; body.appendChild(heading)
   const info = document.createElement('p'); info.textContent = item.depositor ? 'Location: MARKET ESCROW · Deposited by: ' + label(item.depositor) : 'Location: ' + label(item.owner).toUpperCase() + ' WALLET'; body.appendChild(info)
   const terms = document.createElement('p')
   terms.textContent = auction ? 'Reserve ' + item.auction.reserve + ' ETH · Top bid ' + item.auction.amount + ' ETH · ' + Math.max(0, item.auction.end - state.timestamp) + 's left' : listed ? 'Ask ' + item.price + ' ETH · Seller receives ' + (Number(item.price) * .975).toFixed(6) + ' ETH credit' : item.depositor ? item.cooldown ? 'Wait ' + item.cooldown + ' more blocks or use MINE 5 BLOCKS in advanced controls.' : 'Ready to list, auction, or return. The deposit alone does not list it for sale.' : owner ? 'This is yours. Move to escrow to sell it.' : 'This piece belongs to another test account.'
   body.appendChild(terms)
   const draftKey = persona() + ':' + item.number + ':' + (auction ? 'bid' : 'price')
   const price = document.createElement('input'); price.type = 'text'; price.inputMode = 'decimal'; price.value = drafts.get(draftKey) || (auction ? String(Math.max(Number(item.auction.reserve), Number(item.auction.amount) * 1.05 + 0.000001).toFixed(6)) : listed ? item.price : '0.01'); price.setAttribute('aria-label', 'Price in test ETH for Phunk ' + item.number)
   price.disabled = busy; price.oninput = () => drafts.set(draftKey, price.value)
   if ((depositor && !auction) || (auction && !ended && !depositor)) { const field = document.createElement('label'); field.textContent = auction ? 'YOUR BID · TEST ETH' : 'SALE PRICE / AUCTION RESERVE · TEST ETH'; field.appendChild(price); body.appendChild(field) }
   const actions = document.createElement('div'); actions.className = 'actions'
   function button(text, kind, enabled = true) { const b = document.createElement('button'); b.textContent = text; b.disabled = busy || !enabled; b.onclick = () => action(kind, item.number, price.value); actions.appendChild(b) }
   if (owner) button('MOVE TO ESCROW', 'deposit')
   if (depositor && !auction) { button(listed ? 'UPDATE PRICE' : 'LIST FOR SALE', 'list', item.cooldown === 0); button('START AUCTION', 'auction', item.cooldown === 0); button(listed ? 'CANCEL SALE · RETURN TO WALLET' : 'RETURN TO MY WALLET', 'cancel', item.cooldown === 0) }
   if (listed && !depositor) button('BUY · ' + item.price + ' ETH', 'buy')
   if (auction && !ended && !depositor) button('PLACE BID', 'bid')
   if (ended) button('SETTLE AUCTION', 'settle')
   body.appendChild(actions); card.appendChild(body); el('cards').appendChild(card)
  }
  el('events').innerHTML = ''
  if (!state.events.length) el('events').textContent = 'No transactions yet. Try moving a piece into escrow.'
  for (const event of state.events) {
   const row = document.createElement('div'); row.className = 'event'
   const description = document.createElement('span'); description.textContent = event.persona.toUpperCase() + ' · ' + event.action.toUpperCase() + (event.number === undefined ? '' : ' · #' + event.number)
   const receipt = document.createElement('span'); receipt.textContent = short(event.hash) + ' · ' + event.gas + ' gas'; row.append(description, receipt); el('events').appendChild(row)
  }
 }
 el('persona').onchange = () => { status('Viewing ' + persona() + ' · ' + view + '.'); draw() }
 el('refresh').onclick = refresh
 el('mine').onclick = () => action('mine')
 el('advance').onclick = () => action('advance')
 el('withdraw').onclick = () => action('withdraw')
 el('views').onclick = event => { const button = event.target.closest('button[data-view]'); if (button && !busy) { view = button.dataset.view; draw() } }
 el('reset').onclick = () => { if (!busy && window.confirm('Reset ONLY this local demo? All 10 pieces, fake balances, credits and test activity will return to their starting state.')) action('reset') }
 refresh().then(() => { if (state) status('Ready. You have 6 test pieces as Seller. Choose MOVE TO ESCROW to start.') })
})()
