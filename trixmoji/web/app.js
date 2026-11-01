(() => {
 'use strict'
 let state, busy = false, page = 0
 const el = id => document.getElementById(id)
 const persona = () => el('persona').value
 const short = address => address.slice(0, 7) + '…' + address.slice(-5)
 const eq = (a, b) => a && b && a.toLowerCase() === b.toLowerCase()
 const label = address => Object.entries(state.accounts).find(([, a]) => eq(a.address, address))?.[0] || (eq(address, state.contract) ? 'MARKET ESCROW' : short(address))
 function status(text, error = false) { el('status').textContent = text; el('status').className = error ? 'error' : '' }
 async function refresh() {
  if (busy) return
  busy = true; draw()
  try { const r = await fetch('/api/state?page=' + page); const data = await r.json(); if (!r.ok) throw new Error(data.error); state = data } catch (e) { status(e.message, true) }
  finally { busy = false; draw() }
 }
 async function action(kind, number, price) {
  if (busy) return
  busy = true; draw(); status('Executing ' + kind + ' on local chain…')
  try {
   const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sandbox': '1' }, body: JSON.stringify({ action: kind, number, price, persona: persona(), page }) })
   const data = await r.json(); if (!r.ok || !data.ok) throw new Error(data.error || 'Action failed')
   state = data.state; status(data.message + (data.hash ? ' · ' + short(data.hash) : ''))
  } catch (e) { status(e.message, true) }
  finally { busy = false; draw() }
 }
 function draw() {
  if (!state) return
  const account = state.accounts[persona()]
  el('block').textContent = 'BLOCK ' + state.block + ' · ' + new Date(state.timestamp * 1000).toISOString().slice(11, 19)
  el('wallet').textContent = short(account.address) + ' · ' + Number(account.balance).toFixed(4) + ' test ETH · CREDIT ' + account.credit + ' ETH'
  el('withdraw').disabled = busy || Number(account.credit) === 0
  el('persona').disabled = busy
  el('previous').disabled = busy || state.page === 0
  el('next').disabled = busy || (state.page + 1) * state.pageSize >= state.total
  el('go').disabled = busy
  el('pageInfo').textContent = (state.page * state.pageSize + 1) + '–' + Math.min((state.page + 1) * state.pageSize, state.total) + ' / ' + state.total + ' ARTWORKS'
  for (const id of ['refresh', 'mine', 'advance']) el(id).disabled = busy
  el('contract').textContent = 'LOCAL CONTRACT: ' + state.contract + ' · test assets reset when the server restarts'
  el('creator').textContent = 'Creator royalty credit: ' + state.accounts.creator.credit + ' test ETH'
  el('cards').innerHTML = ''
  for (const item of state.items) {
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
   const info = document.createElement('p'); info.textContent = 'Owner: ' + label(item.owner) + (item.depositor ? ' · Depositor: ' + label(item.depositor) : ''); body.appendChild(info)
   const terms = document.createElement('p')
   terms.textContent = auction ? 'Reserve ' + item.auction.reserve + ' ETH · Top bid ' + item.auction.amount + ' ETH · ' + Math.max(0, item.auction.end - state.timestamp) + 's left' : listed ? 'Ask ' + item.price + ' ETH · 2.5% creator royalty included' : item.depositor ? 'Cooldown: ' + item.cooldown + ' blocks remaining' : 'Deposit to list or auction this test piece.'
   body.appendChild(terms)
   const price = document.createElement('input'); price.type = 'text'; price.inputMode = 'decimal'; price.value = auction ? String(Math.max(Number(item.auction.reserve), Number(item.auction.amount) * 1.05 + 0.000001).toFixed(6)) : '0.01'; price.setAttribute('aria-label', 'Price in test ETH for Phunk ' + item.number)
   if ((depositor && !auction) || (auction && !ended && !depositor)) body.appendChild(price)
   const actions = document.createElement('div'); actions.className = 'actions'
   function button(text, kind, enabled = true) { const b = document.createElement('button'); b.textContent = text; b.disabled = busy || !enabled; b.onclick = () => action(kind, item.number, price.value); actions.appendChild(b) }
   if (owner) button('DEPOSIT', 'deposit')
   if (depositor && !auction) { button(listed ? 'UPDATE PRICE' : 'LIST FOR SALE', 'list', item.cooldown === 0); button('START AUCTION', 'auction', item.cooldown === 0); button('RETURN TO WALLET', 'cancel', item.cooldown === 0) }
   if (listed && !depositor) button('BUY · ' + item.price + ' ETH', 'buy')
   if (auction && !ended && !depositor) button('PLACE BID', 'bid')
   if (ended) button('SETTLE AUCTION', 'settle')
   body.appendChild(actions); card.appendChild(body); el('cards').appendChild(card)
  }
  el('events').innerHTML = ''
  for (const event of state.events) {
   const row = document.createElement('div'); row.className = 'event'
   const description = document.createElement('span'); description.textContent = event.persona.toUpperCase() + ' · ' + event.action.toUpperCase() + (event.number === undefined ? '' : ' · #' + event.number)
   const receipt = document.createElement('span'); receipt.textContent = short(event.hash) + ' · ' + event.gas + ' gas'; row.append(description, receipt); el('events').appendChild(row)
  }
 }
 el('persona').onchange = draw
 el('refresh').onclick = refresh
 el('mine').onclick = () => action('mine')
 el('advance').onclick = () => action('advance')
 el('withdraw').onclick = () => action('withdraw')
 el('previous').onclick = () => { if (busy) return; page = Math.max(0, page - 1); refresh() }
 el('next').onclick = () => { if (busy) return; page = Math.min(24, page + 1); refresh() }
 el('go').onclick = () => {
  if (busy) return
  const number = Number(el('jump').value)
  if (!Number.isInteger(number) || number < 0 || number > 999) { status('Enter a Phunk number from 0 to 999.', true); return }
  page = Math.floor(number / 40); refresh()
 }
 refresh().then(() => { if (state) status('Ready. Start as Seller: deposit a test piece, then mine five blocks.') })
})()
