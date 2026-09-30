/**
 * XRP Blocks — List block definitions
 *
 * Adds Scratch-style lists to the Variables submenu: a typed variable
 * ('List') created via its own "Make a List" button, a bound reporter block
 * per list (like the stock variable "get" block), and a full set of
 * operation blocks (add/delete/insert/replace/item/contains/length/…) plus
 * two CSV-style text<->list conversion blocks.
 *
 * Everything lives under the `xrp_list_*` prefix so it can never collide
 * with Blockly's own stock `lists_*` blocks (unused here, but vendored).
 * Index fields are 1-based on the block face; generators convert to 0-based
 * Python indices.
 *
 * Styled with 'variable_blocks' (not 'list_blocks') so lists read as part of
 * the same Variables submenu they live in, rather than a different category
 * in disguise — same red/orange as "Make a Variable", get, set and change.
 *
 * The "get" reporter below also carries a live hover tooltip (see
 * blockly/watch-vars.js): right-click it → "Watch this value" and, while
 * the program is running (Run, not Deploy), hovering shows the list's
 * current contents as last reported by the robot.
 */

import { attachWatchTooltip } from '../watch-vars.js';

export function registerListBlocks() {
  // ── Reporter: the list itself (bound "get", one per list variable) ──
  Blockly.Blocks['xrp_list_get'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_get',
        message0: '%1',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        output: 'Array',
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_GET_TOOLTIP}',
        helpUrl: '',
      });
      attachWatchTooltip(this, 'XRP_LIST_GET_TOOLTIP');
    },
  };

  // ── set [list] to [value] ──
  Blockly.Blocks['xrp_list_set'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_set',
        message0: '%{BKY_XRP_LIST_SET}',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
          { type: 'input_value', name: 'VALUE' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_SET_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── add [item] to [list] ──
  Blockly.Blocks['xrp_list_add_item'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_add_item',
        message0: '%{BKY_XRP_LIST_ADD_ITEM}',
        args0: [
          { type: 'input_value', name: 'ITEM' },
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_ADD_ITEM_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── delete item [#] of [list] ──
  Blockly.Blocks['xrp_list_delete_item'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_delete_item',
        message0: '%{BKY_XRP_LIST_DELETE_ITEM}',
        args0: [
          { type: 'input_value', name: 'INDEX' },
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_DELETE_ITEM_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── delete all of [list] ──
  Blockly.Blocks['xrp_list_delete_all'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_delete_all',
        message0: '%{BKY_XRP_LIST_DELETE_ALL}',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_DELETE_ALL_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── insert [item] at [#] of [list] ──
  Blockly.Blocks['xrp_list_insert_item'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_insert_item',
        message0: '%{BKY_XRP_LIST_INSERT_ITEM}',
        args0: [
          { type: 'input_value', name: 'ITEM' },
          { type: 'input_value', name: 'INDEX' },
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_INSERT_ITEM_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── replace item [#] of [list] with [item] ──
  Blockly.Blocks['xrp_list_replace_item'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_replace_item',
        message0: '%{BKY_XRP_LIST_REPLACE_ITEM}',
        args0: [
          { type: 'input_value', name: 'INDEX' },
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
          { type: 'input_value', name: 'ITEM' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_REPLACE_ITEM_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── item [#] of [list] (reporter) ──
  Blockly.Blocks['xrp_list_item'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_item',
        message0: '%{BKY_XRP_LIST_ITEM}',
        args0: [
          { type: 'input_value', name: 'INDEX' },
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        output: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_ITEM_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── last item of [list] (reporter) ──
  Blockly.Blocks['xrp_list_last_item'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_last_item',
        message0: '%{BKY_XRP_LIST_LAST_ITEM}',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        output: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_LAST_ITEM_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── random item of [list] (reporter) ──
  Blockly.Blocks['xrp_list_random_item'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_random_item',
        message0: '%{BKY_XRP_LIST_RANDOM_ITEM}',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        output: null,
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_RANDOM_ITEM_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── item # of [item] in [list] (reporter, Number) ──
  Blockly.Blocks['xrp_list_item_num'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_item_num',
        message0: '%{BKY_XRP_LIST_ITEM_NUM}',
        args0: [
          { type: 'input_value', name: 'ITEM' },
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        output: 'Number',
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_ITEM_NUM_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── length of [list] (reporter, Number) ──
  Blockly.Blocks['xrp_list_length'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_length',
        message0: '%{BKY_XRP_LIST_LENGTH}',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        output: 'Number',
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_LENGTH_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── [list] contains [item]? (reporter, Boolean) ──
  Blockly.Blocks['xrp_list_contains'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_contains',
        message0: '%{BKY_XRP_LIST_CONTAINS}',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
          { type: 'input_value', name: 'ITEM' },
        ],
        output: 'Boolean',
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_CONTAINS_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── is [list] empty? (reporter, Boolean) ──
  Blockly.Blocks['xrp_list_is_empty'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_is_empty',
        message0: '%{BKY_XRP_LIST_IS_EMPTY}',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
        ],
        output: 'Boolean',
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_IS_EMPTY_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── make list from [text] split by [delimiter] (reporter, Array) ──
  Blockly.Blocks['xrp_list_from_text'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_from_text',
        message0: '%{BKY_XRP_LIST_FROM_TEXT}',
        args0: [
          { type: 'input_value', name: 'TEXT' },
          { type: 'input_value', name: 'DELIM' },
        ],
        output: 'Array',
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_FROM_TEXT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // ── join [list] with [delimiter] (reporter, String) ──
  Blockly.Blocks['xrp_list_to_text'] = {
    init() {
      this.jsonInit({
        type: 'xrp_list_to_text',
        message0: '%{BKY_XRP_LIST_TO_TEXT}',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'list',
            variableTypes: ['List'],
            defaultType: 'List',
          },
          { type: 'input_value', name: 'DELIM' },
        ],
        output: 'String',
        style: 'variable_blocks',
        tooltip: '%{BKY_XRP_LIST_TO_TEXT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}

/**
 * Opens Blockly's own "create typed variable" prompt, forced to type
 * 'List' — this is what makes "Make a List" behave exactly like Blockly's
 * built-in "Make a Variable", including the name-collision checks, except
 * the created variable is typed so it only ever offers itself in a List
 * dropdown, never a plain-variable one.
 *
 * Temporarily swaps in a list-flavoured prompt title, since
 * createVariableButtonHandler always uses Blockly.Msg['NEW_VARIABLE_TITLE'].
 *
 * @param {!Blockly.WorkspaceSvg} workspace
 */
export function createListButtonHandler(workspace) {
  const previousTitle = Blockly.Msg['NEW_VARIABLE_TITLE'];
  Blockly.Msg['NEW_VARIABLE_TITLE'] = Blockly.Msg['XRP_LIST_NEW_PROMPT'] || previousTitle;
  const restore = () => {
    Blockly.Msg['NEW_VARIABLE_TITLE'] = previousTitle;
  };
  try {
    Blockly.Variables.createVariableButtonHandler(workspace, restore, 'List');
  } catch (err) {
    restore();
    throw err;
  }
}

/**
 * Builds the flyout items for the list half of the Variables category:
 * the "Make a List" button, one full set of operation/reporter blocks bound
 * to the most recently created list (mirroring how Blockly's own "set" and
 * "change" templates bind to the last plain variable), and one bound
 * reporter block per existing list (mirroring Blockly's own "get" blocks).
 *
 * Returns [] beyond the button when there are no list variables yet, same
 * as Blockly does for plain variables.
 *
 * @param {!Blockly.WorkspaceSvg} workspace
 * @returns {!Array<!Object>} flyout JSON items
 */
export function getListFlyoutItems(workspace) {
  const items = [
    { kind: 'button', text: '%{BKY_XRP_NEW_LIST}', callbackkey: 'CREATE_LIST' },
  ];
  workspace.registerButtonCallback('CREATE_LIST', (button) => {
    createListButtonHandler(button.getTargetWorkspace());
  });

  const listVars = workspace
    .getVariableMap()
    .getVariablesOfType('List')
    .slice()
    .sort((a, b) => a.getName().localeCompare(b.getName()));

  if (listVars.length === 0) return items;

  const last = listVars[listVars.length - 1];
  const fieldsFor = (variable) => ({ VAR: { name: variable.getName(), type: variable.getType() } });
  const textShadow = (text) => ({ shadow: { type: 'text', fields: { TEXT: text } } });
  const numberShadow = (num) => ({ shadow: { type: 'math_number', fields: { NUM: num } } });

  items.push(
    {
      kind: 'block', type: 'xrp_list_add_item', gap: 8, fields: fieldsFor(last),
      inputs: { ITEM: textShadow('thing') },
    },
    {
      kind: 'block', type: 'xrp_list_delete_item', gap: 8, fields: fieldsFor(last),
      inputs: { INDEX: numberShadow(1) },
    },
    { kind: 'block', type: 'xrp_list_delete_all', gap: 8, fields: fieldsFor(last) },
    {
      kind: 'block', type: 'xrp_list_insert_item', gap: 8, fields: fieldsFor(last),
      inputs: { ITEM: textShadow('thing'), INDEX: numberShadow(1) },
    },
    {
      kind: 'block', type: 'xrp_list_replace_item', gap: 24, fields: fieldsFor(last),
      inputs: { INDEX: numberShadow(1), ITEM: textShadow('thing') },
    },
    {
      kind: 'block', type: 'xrp_list_set', gap: 8, fields: fieldsFor(last),
      inputs: { VALUE: { shadow: { type: 'lists_create_with', extraState: { itemCount: 0 } } } },
    },
    {
      kind: 'block', type: 'xrp_list_item', gap: 8, fields: fieldsFor(last),
      inputs: { INDEX: numberShadow(1) },
    },
    { kind: 'block', type: 'xrp_list_last_item', gap: 8, fields: fieldsFor(last) },
    { kind: 'block', type: 'xrp_list_random_item', gap: 8, fields: fieldsFor(last) },
    {
      kind: 'block', type: 'xrp_list_item_num', gap: 8, fields: fieldsFor(last),
      inputs: { ITEM: textShadow('thing') },
    },
    { kind: 'block', type: 'xrp_list_length', gap: 8, fields: fieldsFor(last) },
    {
      kind: 'block', type: 'xrp_list_contains', gap: 8, fields: fieldsFor(last),
      inputs: { ITEM: textShadow('thing') },
    },
    { kind: 'block', type: 'xrp_list_is_empty', gap: 24, fields: fieldsFor(last) },
    {
      kind: 'block', type: 'xrp_list_to_text', gap: 8, fields: fieldsFor(last),
      inputs: { DELIM: textShadow(',') },
    },
    {
      kind: 'block', type: 'xrp_list_from_text', gap: 24,
      inputs: { TEXT: textShadow('a,b,c'), DELIM: textShadow(',') },
    },
  );

  // One bound "get" reporter per list, sorted — exactly like Blockly's own
  // per-variable "get" blocks at the bottom of the Variables flyout.
  for (const variable of listVars) {
    items.push({ kind: 'block', type: 'xrp_list_get', gap: 8, fields: fieldsFor(variable) });
  }

  return items;
}
