const { test } = require('node:test')
const assert = require('node:assert/strict')
const { recipientFor } = require('../lib/sandbox-transfer.cjs')
const seller = '0x1111111111111111111111111111111111111111'
const friend = '0x2222222222222222222222222222222222222222'
const personas = { seller: { address: seller }, friend: { address: friend } }
test('gift recipient is a different known local test wallet', () => {
 assert.equal(recipientFor({ owner: seller, depositor: '' }, seller, 'friend', personas).address, friend)
 assert.throws(() => recipientFor({ owner: seller, depositor: '' }, seller, 'seller', personas), /different/)
 assert.throws(() => recipientFor({ owner: seller, depositor: '' }, seller, '__proto__', personas), /recipient/)
 assert.throws(() => recipientFor({ owner: seller, depositor: '' }, seller, 'real-wallet', personas), /recipient/)
})
test('gifts cannot move escrowed assets or another owner’s piece', () => {
 assert.throws(() => recipientFor({ owner: seller, depositor: seller }, seller, 'friend', personas), /escrow/)
 assert.throws(() => recipientFor({ owner: friend, depositor: '' }, seller, 'friend', personas), /current wallet owner/)
})
