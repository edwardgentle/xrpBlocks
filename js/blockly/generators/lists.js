/**
 * XRP Blocks — Python generators for the List blocks (see blocks/lists.js)
 *
 * Lists generate as plain native Python lists — a created list is just a
 * variable holding `[]`, and every block below is a thin, idiomatic
 * wrapper over ordinary list operations. Index fields are 1-based on the
 * block face (Scratch-style) and converted to 0-based here.
 *
 * Every block that can change a list's contents also calls
 * maybeWatchPrint() right after — a no-op unless that specific list is
 * being watched (see blockly/watch-vars.js), in which case it appends one
 * extra debug print line so the Console/tooltip can show the new value.
 * Only touches Run's generated code; Deploy never sees these lines.
 */

import { maybeWatchPrint } from '../watch-vars.js';

/**
 * Blockly's Python generator auto-declares EVERY workspace variable as
 * `name = None` at the top of the program (its own init(), not something
 * XRPBlocks controls) — fine for a plain variable, which always gets a
 * "set" block before use, but wrong for a list: it's entirely normal in
 * Scratch-style list programming to only ever `add`/`insert` into a list
 * and never explicitly "set" it first, exactly like an empty list needs no
 * setup in Scratch. Left as `None`, the very first `add`/`insert`/`replace`
 * crashes with "'NoneType' object has no attribute 'append'".
 *
 * Call this right after `pythonGenerator.init(workspace)` and before code
 * generation: it rewrites each List-typed variable's auto-declaration from
 * `name = None` to `name = []` in the generator's own definitions_ buffer,
 * so every list starts life properly empty with no block required for it.
 *
 * @param {!Blockly.Workspace} workspace
 * @param {!Object} generator - the Python generator instance, already init()'d
 */
export function fixListVariableDefaults(workspace, generator) {
  const declarations = generator.definitions_ && generator.definitions_['variables'];
  if (!declarations) return;

  const listVars = workspace.getVariableMap().getVariablesOfType('List');
  if (!listVars.length) return;

  let patched = declarations;
  for (const variable of listVars) {
    const pyName = generator.getVariableName(variable.getId());
    // Matches the exact line Blockly's own init() emits for this variable.
    const linePattern = new RegExp(`(^|\\n)${pyName} = None(?=\\n|$)`);
    patched = patched.replace(linePattern, `$1${pyName} = []`);
  }
  generator.definitions_['variables'] = patched;
}

export function registerListGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  const varName = (block, generator) => generator.getVariableName(block.getFieldValue('VAR'));
  const indexExpr = (block, generator, name = 'INDEX') => {
    const raw = generator.valueToCode(block, name, Order.NONE) || '1';
    return `int(${raw}) - 1`;
  };

  python.forBlock['xrp_list_get'] = function (block, generator) {
    return [varName(block, generator), Order.ATOMIC];
  };

  python.forBlock['xrp_list_set'] = function (block, generator) {
    const value = generator.valueToCode(block, 'VALUE', Order.NONE) || '[]';
    return `${varName(block, generator)} = ${value}\n` + maybeWatchPrint(block, generator);
  };

  python.forBlock['xrp_list_add_item'] = function (block, generator) {
    const item = generator.valueToCode(block, 'ITEM', Order.NONE) || "''";
    return `${varName(block, generator)}.append(${item})\n` + maybeWatchPrint(block, generator);
  };

  python.forBlock['xrp_list_delete_item'] = function (block, generator) {
    const idx = indexExpr(block, generator);
    return `del ${varName(block, generator)}[${idx}]\n` + maybeWatchPrint(block, generator);
  };

  python.forBlock['xrp_list_delete_all'] = function (block, generator) {
    return `${varName(block, generator)}.clear()\n` + maybeWatchPrint(block, generator);
  };

  python.forBlock['xrp_list_insert_item'] = function (block, generator) {
    const item = generator.valueToCode(block, 'ITEM', Order.NONE) || "''";
    const idx = indexExpr(block, generator);
    return `${varName(block, generator)}.insert(${idx}, ${item})\n` + maybeWatchPrint(block, generator);
  };

  python.forBlock['xrp_list_replace_item'] = function (block, generator) {
    const idx = indexExpr(block, generator);
    const item = generator.valueToCode(block, 'ITEM', Order.NONE) || "''";
    return `${varName(block, generator)}[${idx}] = ${item}\n` + maybeWatchPrint(block, generator);
  };

  python.forBlock['xrp_list_item'] = function (block, generator) {
    const idx = indexExpr(block, generator);
    return [`${varName(block, generator)}[${idx}]`, Order.MEMBER];
  };

  python.forBlock['xrp_list_last_item'] = function (block, generator) {
    return [`${varName(block, generator)}[-1]`, Order.MEMBER];
  };

  python.forBlock['xrp_list_random_item'] = function (block, generator) {
    generator.definitions_['import_random'] = 'import random';
    return [`random.choice(${varName(block, generator)})`, Order.FUNCTION_CALL];
  };

  // Scratch semantics: 1-based index of the first match, or 0 if absent.
  python.forBlock['xrp_list_item_num'] = function (block, generator) {
    const item = generator.valueToCode(block, 'ITEM', Order.NONE) || "''";
    const list = varName(block, generator);
    return [`(${list}.index(${item}) + 1 if ${item} in ${list} else 0)`, Order.CONDITIONAL];
  };

  python.forBlock['xrp_list_length'] = function (block, generator) {
    return [`len(${varName(block, generator)})`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_list_contains'] = function (block, generator) {
    const item = generator.valueToCode(block, 'ITEM', Order.NONE) || "''";
    return [`(${item} in ${varName(block, generator)})`, Order.ATOMIC];
  };

  python.forBlock['xrp_list_is_empty'] = function (block, generator) {
    return [`(len(${varName(block, generator)}) == 0)`, Order.ATOMIC];
  };

  python.forBlock['xrp_list_from_text'] = function (block, generator) {
    const text = generator.valueToCode(block, 'TEXT', Order.MEMBER) || "''";
    const delim = generator.valueToCode(block, 'DELIM', Order.NONE) || "','";
    return [`${text}.split(${delim})`, Order.MEMBER];
  };

  python.forBlock['xrp_list_to_text'] = function (block, generator) {
    const delim = generator.valueToCode(block, 'DELIM', Order.MEMBER) || "','";
    const list = varName(block, generator);
    return [`${delim}.join([str(_i) for _i in ${list}])`, Order.FUNCTION_CALL];
  };
}
