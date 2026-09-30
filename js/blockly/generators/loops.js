/**
 * XRP Blocks — Python generators for Loop blocks
 */

export function registerLoopGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;

  python.forBlock['xrp_forever'] = function (block, generator) {
    let branch = generator.statementToCode(block, 'DO');
    if (typeof generator.addLoopTrap === 'function') {
      branch = generator.addLoopTrap(branch, block);
    }
    if (!branch.trim()) {
      branch = generator.INDENT + 'pass\n';
    }
    if (!branch.endsWith('\n')) {
      branch += '\n';
    }
    return 'while True:\n' + branch;
  };
}
