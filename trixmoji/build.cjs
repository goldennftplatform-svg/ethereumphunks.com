const fs = require('fs')
const path = require('path')
const solc = require('solc')
function compile() {
 const name = 'trixmoji/contracts/TrixmojiMarket.sol'
 const input = { language: 'Solidity', sources: { [name]: { content: fs.readFileSync(path.join(__dirname, 'contracts/TrixmojiMarket.sol'), 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } }
 const output = JSON.parse(solc.compile(JSON.stringify(input), { import: file => {
  const resolved = file.startsWith('@') ? path.join(__dirname, 'node_modules', file) : path.resolve(__dirname, '..', file)
  try { return { contents: fs.readFileSync(resolved, 'utf8') } } catch(e) { return { error: e.message } }
 } }))
 const errors = (output.errors || []).filter(e => e.severity === 'error')
 if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'))
 const c = output.contracts[name].TrixmojiMarket
 return { contractName: 'TrixmojiMarket', compiler: solc.version(), abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, deployedBytecode: '0x' + c.evm.deployedBytecode.object }
}
if (require.main === module) {
 fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true })
 fs.writeFileSync(path.join(__dirname, 'artifacts/TrixmojiMarket.json'), JSON.stringify(compile(), null, 2))
 console.log('Built TrixmojiMarket. No deployment or transaction submitted.')
}
module.exports = { compile }
