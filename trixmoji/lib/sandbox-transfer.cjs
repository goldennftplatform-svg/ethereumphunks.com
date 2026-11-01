'use strict'

// Only for the local ownership model. A production transfer must verify actual
// Ethscriptions ownership and require the user's wallet signature.
function recipientFor(item, sender, recipientName, personas) {
 if (!item || item.depositor || item.owner.toLowerCase() !== sender.toLowerCase()) throw new Error('Return the piece from escrow first. Only its current wallet owner can send it.')
 if (!Object.prototype.hasOwnProperty.call(personas, recipientName)) throw new Error('Choose a test recipient')
 const recipient = personas[recipientName]
 if (recipient.address.toLowerCase() === sender.toLowerCase()) throw new Error('Choose a different test wallet')
 return recipient
}

module.exports = { recipientFor }
