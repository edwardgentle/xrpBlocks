/**
 * XRP Blocks — MicroPython compatibility fixes
 *
 * Blockly's Python generator targets CPython. A few standard blocks emit
 * `from numbers import Number`, and MicroPython has no `numbers` module, so
 * the very first line of the program raises ImportError and NOTHING runs.
 * The most common offender is the "change <var> by <n>" block.
 *
 * Two fixes:
 *   1. Regenerate "change <var> by <n>" as plain `x = x + n`.
 *   2. Anything else that still asks for `numbers` gets a one-line shim.
 *      `isinstance()` accepts a tuple, so `Number = (int, float)` behaves
 *      correctly for the generated checks.
 *
 * While here, both "change <var> by" and "set <var> to" also grow a call to
 * maybeWatchPrint() (see blockly/watch-vars.js) — a no-op unless that plain
 * variable is being watched, in which case it appends one extra debug print
 * line so the right-click "Watch this value" feature works for plain
 * variables exactly the same way it does for lists. "set <var> to" is
 * re-registered here (Blockly's stock version is otherwise unchanged:
 * `name = value`) purely to hang that extra line off it.
 */

import { maybeWatchPrint } from '../watch-vars.js';

export function registerMicroPythonCompat(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  python.forBlock['math_change'] = function (block, generator) {
    const delta = generator.valueToCode(block, 'DELTA', Order.ADDITIVE) || '0';
    const varName = generator.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = ${varName} + ${delta}\n` + maybeWatchPrint(block, generator);
  };

  python.forBlock['variables_set'] = function (block, generator) {
    const value = generator.valueToCode(block, 'VALUE', Order.NONE) || '0';
    const varName = generator.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = ${value}\n` + maybeWatchPrint(block, generator);
  };
}

/**
 * Replace CPython-only imports in generated code with MicroPython-safe
 * equivalents. Safe to call on every generation pass.
 *
 * @param {string} code - Generated Python code
 * @returns {string}
 */
export function patchMicroPythonImports(code) {
  if (!code) return code;
  return code.replace(
    /^from numbers import Number$/gm,
    'Number = (int, float)  # MicroPython has no "numbers" module'
  );
}
