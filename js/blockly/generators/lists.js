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

  // ── Change 46: maths on a list, sort, part of a list ──

  // Items added from a text slot arrive as strings ('5'), so every helper
  // turns numeric text into a number first. Non-numbers are skipped by the
  // maths block and sorted after the numbers by the sort block.
  function provideNumberOf(generator) {
    return generator.provideFunction_('xrp_list_number', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(item):',
      '  # A number, a number stored as text, or None for anything else.',
      '  if isinstance(item, bool):',
      '    return None',
      '  if isinstance(item, (int, float)):',
      '    return item',
      '  try:',
      '    return int(str(item).strip())',
      '  except ValueError:',
      '    pass',
      '  try:',
      '    return float(str(item).strip())',
      '  except ValueError:',
      '    return None',
    ]);
  }

  python.forBlock['xrp_list_stat'] = function (block, generator) {
    const numberOf = provideNumberOf(generator);
    const stat = generator.provideFunction_('xrp_list_stat', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(items, op):',
      '  # Only the items that are numbers count. An empty list reports 0.',
      `  values = [v for v in (${numberOf}(i) for i in items) if v is not None]`,
      '  if not values:',
      '    return 0',
      "  if op == 'SUM':",
      '    return sum(values)',
      "  if op == 'AVERAGE':",
      '    return sum(values) / len(values)',
      "  if op == 'MIN':",
      '    return min(values)',
      "  if op == 'MAX':",
      '    return max(values)',
      '  values = sorted(values)',
      '  middle = len(values) // 2',
      '  if len(values) % 2 == 1:',
      '    return values[middle]',
      '  return (values[middle - 1] + values[middle]) / 2',
    ]);
    const op = block.getFieldValue('OP') || 'SUM';
    return [`${stat}(${varName(block, generator)}, '${op}')`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_list_sort'] = function (block, generator) {
    const numberOf = provideNumberOf(generator);
    const sortList = generator.provideFunction_('xrp_list_sort', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(items, largest_first):',
      '  # Numbers (also numbers stored as text) come first, in order of size.',
      '  # Words always come after the numbers, A to Z (Z to A for largest first).',
      '  numbers = []',
      '  words = []',
      '  for item in items:',
      `    if ${numberOf}(item) is None:`,
      '      words.append(item)',
      '    else:',
      '      numbers.append(item)',
      `  numbers.sort(key=${numberOf}, reverse=largest_first)`,
      '  words.sort(key=str, reverse=largest_first)',
      '  items.clear()',
      '  items.extend(numbers)',
      '  items.extend(words)',
    ]);
    const largestFirst = block.getFieldValue('ORDER') === 'DOWN' ? 'True' : 'False';
    return `${sortList}(${varName(block, generator)}, ${largestFirst})\n` +
      maybeWatchPrint(block, generator);
  };

  python.forBlock['xrp_list_sublist'] = function (block, generator) {
    const from = generator.valueToCode(block, 'FROM', Order.NONE) || '1';
    const to = generator.valueToCode(block, 'TO', Order.NONE) || '1';
    const list = varName(block, generator);
    // 1-based and inclusive on the block face; a new list, the original is
    // left as it was. Positions below 1 are treated as 1.
    return [`${list}[max(int(${from}) - 1, 0):max(int(${to}), 0)]`, Order.MEMBER];
  };

  python.forBlock['xrp_list_to_text'] = function (block, generator) {
    const delim = generator.valueToCode(block, 'DELIM', Order.MEMBER) || "','";
    const list = varName(block, generator);
    return [`${delim}.join([str(_i) for _i in ${list}])`, Order.FUNCTION_CALL];
  };
}
