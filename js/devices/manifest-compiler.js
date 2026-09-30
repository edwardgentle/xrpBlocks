/**
 * XRP Blocks — Device manifest compiler
 *
 * Turns a device library manifest (plain JSON, see devices/README.md) into
 * Blockly block definitions, Python generators and a toolbox category.
 *
 * Nothing in a manifest is executed. Every field is data: strings, numbers,
 * lists. That is the whole point — a manifest can be emailed, dropped into a
 * folder or fetched from a URL without running someone else's JavaScript.
 *
 * Manifest version supported: 1
 */

export const MANIFEST_VERSION = 1;

/** Blockly value-connection orders a manifest may name. */
const ORDERS = [
  'ATOMIC', 'COLLECTION', 'STRING_CONVERSION', 'MEMBER', 'FUNCTION_CALL',
  'EXPONENTIATION', 'UNARY_SIGN', 'BITWISE_NOT', 'MULTIPLICATIVE', 'ADDITIVE',
  'BITWISE_SHIFT', 'BITWISE_AND', 'BITWISE_XOR', 'BITWISE_OR', 'RELATIONAL',
  'LOGICAL_NOT', 'LOGICAL_AND', 'LOGICAL_OR', 'CONDITIONAL', 'LAMBDA', 'NONE',
];

/** Argument kinds a manifest may use, mapped to Blockly arg types. */
const FIELD_ARGS = {
  dropdown: 'field_dropdown',
  number_field: 'field_number',
  text_field: 'field_input',
  checkbox: 'field_checkbox',
  angle: 'field_angle',
  colour_field: 'field_colour',
};

const INPUT_ARGS = {
  number: 'Number',
  text: 'String',
  boolean: 'Boolean',
  value: null,   // `check` comes from the arg itself, or no check at all
};

// ── Language helpers ─────────────────────────────────────────────────────

/**
 * Read a translatable field. A manifest may give either a plain string or an
 * object keyed by language code. English is the fallback, then the first key
 * present, so a manifest written in one language still works everywhere.
 *
 * @param {string|Object|undefined} field
 * @param {string} lang - two-letter language code, e.g. 'en'
 * @param {string} [fallback='']
 * @returns {string}
 */
export function text(field, lang, fallback = '') {
  if (field === undefined || field === null) return fallback;
  if (typeof field === 'string') return field;
  if (typeof field !== 'object') return String(field);
  if (field[lang]) return field[lang];
  if (field.en) return field.en;
  const first = Object.values(field).find((v) => typeof v === 'string');
  return first !== undefined ? first : fallback;
}

// ── Validation ───────────────────────────────────────────────────────────

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const BLOCK_TYPE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Check a manifest hard enough that a bad file is rejected at the door rather
 * than half-registering and leaving the toolbox in pieces.
 *
 * @param {*} manifest
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateManifest(manifest) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['The file is not a JSON object.'] };
  }

  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    fail(`manifestVersion must be ${MANIFEST_VERSION}, found ${JSON.stringify(manifest.manifestVersion)}.`);
  }
  if (typeof manifest.id !== 'string' || !ID_PATTERN.test(manifest.id)) {
    fail('id must be lowercase letters, digits, hyphen or underscore, e.g. "pcf8575".');
  }
  if (!manifest.name) fail('name is missing.');

  const cat = manifest.category;
  if (!cat || typeof cat !== 'object') {
    fail('category is missing.');
  } else {
    if (cat.colour && !/^#[0-9a-fA-F]{6}$/.test(cat.colour)) {
      fail('category.colour must be a six-digit hex colour like "#7E9BD8".');
    }
    if (cat.colourDark && !/^#[0-9a-fA-F]{6}$/.test(cat.colourDark)) {
      fail('category.colourDark must be a six-digit hex colour like "#3D71DF".');
    }
  }

  if (!Array.isArray(manifest.blocks) || manifest.blocks.length === 0) {
    fail('blocks must be a non-empty array.');
    return { ok: errors.length === 0, errors };
  }

  const lists = manifest.lists || {};
  const seen = new Set();

  manifest.blocks.forEach((block, i) => {
    const where = `blocks[${i}]`;
    if (!block || typeof block !== 'object') {
      fail(`${where} is not an object.`);
      return;
    }
    if (typeof block.type !== 'string' || !BLOCK_TYPE_PATTERN.test(block.type)) {
      fail(`${where}.type must be a plain identifier, e.g. "xrp_pcf_led".`);
      return;
    }
    if (seen.has(block.type)) fail(`${where}.type "${block.type}" appears twice.`);
    seen.add(block.type);

    if (!block.text) fail(`${where} ("${block.type}") has no text.`);

    const shape = block.shape || 'statement';
    if (shape !== 'statement' && shape !== 'value') {
      fail(`${where}.shape must be "statement" or "value".`);
    }
    if (shape === 'value' && block.order && !ORDERS.includes(block.order)) {
      fail(`${where}.order "${block.order}" is not a Blockly order name.`);
    }

    const args = block.args || [];
    if (!Array.isArray(args)) {
      fail(`${where}.args must be an array.`);
      return;
    }
    args.forEach((arg, j) => {
      const argWhere = `${where}.args[${j}]`;
      if (!arg || typeof arg !== 'object') {
        fail(`${argWhere} is not an object.`);
        return;
      }
      if (typeof arg.name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(arg.name)) {
        fail(`${argWhere}.name must be UPPER_CASE, e.g. "PIN".`);
      }
      const kind = arg.type;
      if (!(kind in FIELD_ARGS) && !(kind in INPUT_ARGS)) {
        fail(`${argWhere}.type "${kind}" is not one of: ${[...Object.keys(FIELD_ARGS), ...Object.keys(INPUT_ARGS)].join(', ')}.`);
        return;
      }
      if (kind === 'dropdown') {
        const options = resolveOptions(arg.options, lists);
        if (!Array.isArray(options) || options.length === 0) {
          fail(`${argWhere}.options is empty, or names a list that is not in "lists".`);
        }
      }
    });

    // Every %n in the text must have an argument behind it.
    const label = text(block.text, 'en', '');
    const highest = highestPlaceholder(label);
    if (highest > args.length) {
      fail(`${where} ("${block.type}") uses %${highest} but only has ${args.length} argument(s).`);
    }

    if (block.code !== undefined && typeof block.code !== 'string') {
      fail(`${where}.code must be a string.`);
    }
    const unknown = unknownPlaceholders(block.code || '', args.map((a) => a && a.name));
    if (unknown.length) {
      fail(`${where}.code refers to {${unknown.join('}, {')}}, which is not an argument of this block.`);
    }
  });

  const inst = manifest.instance;
  if (inst) {
    if (typeof inst.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(inst.name)) {
      fail('instance.name must be a Python identifier, e.g. "expander".');
    }
    if (typeof inst.import !== 'string') fail('instance.import must be a string.');
    if (typeof inst.create !== 'string') fail('instance.create must be a string, e.g. "PCF8575()".');
  }

  const driver = manifest.driver;
  if (driver) {
    if (typeof driver.filename !== 'string' || !/^[\w.-]+\.py$/.test(driver.filename)) {
      fail('driver.filename must be a plain .py file name, e.g. "PCF8575.py".');
    }
    if (typeof driver.source !== 'string' || !driver.source.trim()) {
      fail('driver.source must contain the MicroPython source.');
    }
    if (driver.marker !== undefined && typeof driver.marker !== 'string') {
      fail('driver.marker must be a string.');
    }
  }

  if (manifest.toolbox !== undefined && !Array.isArray(manifest.toolbox)) {
    fail('toolbox must be an array.');
  }
  if (Array.isArray(manifest.toolbox)) {
    manifest.toolbox.forEach((entry, i) => {
      if (entry && typeof entry === 'object' && entry.block && !seen.has(entry.block)) {
        fail(`toolbox[${i}] names block "${entry.block}", which this manifest does not define.`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/** Highest %n used in a block's label text. */
function highestPlaceholder(label) {
  let highest = 0;
  const re = /%(\d+)/g;
  let m;
  while ((m = re.exec(label)) !== null) {
    highest = Math.max(highest, Number(m[1]));
  }
  return highest;
}

/** {NAMES} used in a code template that are not argument names. */
function unknownPlaceholders(template, argNames) {
  const known = new Set(argNames.filter(Boolean));
  const found = new Set();
  // Skip doubled braces, which mean a literal brace.
  const re = /\{\{|\}\}|\{([A-Z][A-Z0-9_]*)\}/g;
  let m;
  while ((m = re.exec(template)) !== null) {
    if (m[1] && !known.has(m[1])) found.add(m[1]);
  }
  return [...found];
}

// ── Options ──────────────────────────────────────────────────────────────

/**
 * Dropdown options are either an inline array, or "$listName" naming an entry
 * in the manifest's shared `lists` object so long pin lists are written once.
 */
function resolveOptions(options, lists) {
  if (typeof options === 'string' && options.startsWith('$')) {
    return lists[options.slice(1)];
  }
  return options;
}

/**
 * Normalise one option into {label, value, code}.
 * Accepts {label, value, code}, or the Blockly pair form ["Label", "VALUE"].
 */
function normaliseOption(option, lang) {
  if (Array.isArray(option)) {
    return { label: String(option[0]), value: String(option[1]), code: String(option[1]) };
  }
  const value = String(option.value);
  return {
    label: text(option.label, lang, value),
    value,
    code: option.code !== undefined ? String(option.code) : value,
  };
}

// ── Block definitions ────────────────────────────────────────────────────

/**
 * Register every block in a manifest with Blockly.
 *
 * Labels are resolved to the current language here rather than going through
 * Blockly.Msg: a manifest carries its own strings, and switching language
 * reloads the page anyway, so there is nothing to keep in step.
 *
 * @param {!Object} manifest - already validated
 * @param {string} lang
 * @returns {string[]} the block types that were registered
 */
export function registerManifestBlocks(manifest, lang) {
  const lists = manifest.lists || {};
  const styleName = blockStyleName(manifest.id);
  const registered = [];

  for (const block of manifest.blocks) {
    const shape = block.shape || 'statement';
    const args0 = (block.args || []).map((arg) => buildArg(arg, lists, lang));

    const json = {
      type: block.type,
      message0: text(block.text, lang, block.type),
      args0,
      style: styleName,
      tooltip: text(block.tooltip, lang, ''),
      helpUrl: block.helpUrl || '',
    };

    if (block.inline !== undefined) json.inputsInline = Boolean(block.inline);

    if (shape === 'value') {
      json.output = block.returns || null;
    } else {
      json.previousStatement = null;
      json.nextStatement = null;
    }

    Blockly.Blocks[block.type] = {
      init() {
        this.jsonInit(json);
      },
    };
    registered.push(block.type);
  }

  return registered;
}

/** One manifest argument → one Blockly args0 entry. */
function buildArg(arg, lists, lang) {
  if (arg.type in FIELD_ARGS) {
    const out = { type: FIELD_ARGS[arg.type], name: arg.name };
    if (arg.type === 'dropdown') {
      const options = resolveOptions(arg.options, lists) || [];
      out.options = options.map((o) => {
        const n = normaliseOption(o, lang);
        return [n.label, n.value];
      });
    } else {
      if (arg.default !== undefined) out.value = arg.default;
      if (arg.min !== undefined) out.min = arg.min;
      if (arg.max !== undefined) out.max = arg.max;
      if (arg.precision !== undefined) out.precision = arg.precision;
      if (arg.type === 'text_field' && arg.default !== undefined) out.text = String(arg.default);
    }
    return out;
  }

  // Value input
  const out = { type: 'input_value', name: arg.name };
  const check = arg.check !== undefined ? arg.check : INPUT_ARGS[arg.type];
  if (check) out.check = check;
  return out;
}

// ── Generators ───────────────────────────────────────────────────────────

/**
 * Register the Python generator for every block in a manifest.
 *
 * @param {!Object} manifest - already validated
 * @param {!Object} pythonModule - the Blockly Python module (window.python)
 * @param {string} lang
 */
export function registerManifestGenerators(manifest, pythonModule, lang) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;
  const lists = manifest.lists || {};

  for (const block of manifest.blocks) {
    const shape = block.shape || 'statement';
    const template = block.code || '';
    const args = block.args || [];
    const order = Order[block.order] !== undefined
      ? Order[block.order]
      : (shape === 'value' ? Order.FUNCTION_CALL : Order.NONE);

    python.forBlock[block.type] = function (blk, generator) {
      const values = readArgs(blk, generator, args, lists, Order);

      if (manifest.instance) {
        const configured = block.configuresInstance
          ? fill(manifest.instance.createConfigured || manifest.instance.create, values)
          : null;
        ensureInstance(generator, manifest, configured);
      }

      const code = fill(template, values);
      return shape === 'value' ? [code, order] : code;
    };
  }
}

/**
 * Collect the substitution values for one block: a field's dropdown code (or
 * raw value), or the generated code plugged into a value socket, falling back
 * to the argument's declared default when the socket is empty.
 */
function readArgs(blk, generator, args, lists, Order) {
  const values = {};

  for (const arg of args) {
    if (arg.type === 'dropdown') {
      const raw = blk.getFieldValue(arg.name);
      const options = resolveOptions(arg.options, lists) || [];
      const match = options
        .map((o) => normaliseOption(o, 'en'))
        .find((o) => o.value === raw);
      values[arg.name] = match ? match.code : raw;
    } else if (arg.type in FIELD_ARGS) {
      values[arg.name] = String(blk.getFieldValue(arg.name));
    } else {
      const code = generator.valueToCode(blk, arg.name, Order.NONE);
      values[arg.name] = (code === '' || code === null || code === undefined)
        ? String(arg.default !== undefined ? arg.default : '0')
        : code;
    }
  }

  return values;
}

/**
 * Substitute {NAME} placeholders. `{{` and `}}` stand for literal braces, so a
 * driver call that needs a Python dict or an f-string can still be written.
 */
function fill(template, values) {
  if (!template) return '';
  return String(template).replace(
    /\{\{|\}\}|\{([A-Z][A-Z0-9_]*)\}/g,
    (match, name) => {
      if (match === '{{') return '{';
      if (match === '}}') return '}';
      return values[name] !== undefined ? values[name] : match;
    }
  );
}

/**
 * Add the driver import and the shared object to the generated program.
 *
 * Any block of the library creates the object lazily, so a program still works
 * if the learner forgets the setup block; the setup block simply pins down the
 * address, pin or pixel count.
 */
function ensureInstance(generator, manifest, configuredCall) {
  const inst = manifest.instance;
  const importKey = `xrplib_import_${manifest.id}`;
  const instanceKey = `xrplib_instance_${manifest.id}`;

  if (inst.import) generator.definitions_[importKey] = inst.import;

  if (configuredCall) {
    generator.definitions_[instanceKey] = `${inst.name} = ${configuredCall}`;
  } else if (!generator.definitions_[instanceKey]) {
    generator.definitions_[instanceKey] = `${inst.name} = ${inst.create}`;
  }
}

// ── Toolbox ──────────────────────────────────────────────────────────────

/**
 * Build the toolbox category for a manifest.
 *
 * If the manifest has no `toolbox` array, every block is listed in the order
 * it was defined — enough for a simple device, and one less thing to get wrong.
 *
 * @param {!Object} manifest
 * @param {string} lang
 * @returns {!Object} a Blockly toolbox category definition
 */
export function buildToolboxCategory(manifest, lang) {
  const cat = manifest.category || {};
  const entries = Array.isArray(manifest.toolbox) && manifest.toolbox.length
    ? manifest.toolbox
    : manifest.blocks.map((b) => ({ block: b.type }));

  const contents = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.gap !== undefined) {
      contents.push({ kind: 'sep', gap: String(entry.gap) });
      continue;
    }
    if (!entry.block) continue;

    const item = { kind: 'block', type: entry.block };
    const shadows = entry.shadows || {};
    const inputs = {};
    for (const [name, spec] of Object.entries(shadows)) {
      const shadow = buildShadow(spec);
      if (shadow) inputs[name] = { shadow };
    }
    if (Object.keys(inputs).length) item.inputs = inputs;
    contents.push(item);
  }

  return {
    kind: 'category',
    categoryKey: cat.key || manifest.id,
    name: text(cat.label, lang, text(manifest.name, lang, manifest.id)),
    categorystyle: categoryStyleName(manifest.id),
    cssConfig: { icon: `cat-icon cat-icon-lib-${cssSafe(manifest.id)}` },
    libraryId: manifest.id,
    contents,
  };
}

/**
 * A shadow may be written as a bare number, a bare string, or the long form
 * {type, fields} for a block from this library (a colour picker, say).
 */
function buildShadow(spec) {
  if (spec === null || spec === undefined) return null;
  if (typeof spec === 'number') {
    return { type: 'math_number', fields: { NUM: spec } };
  }
  if (typeof spec === 'string') {
    return { type: 'text', fields: { TEXT: spec } };
  }
  if (typeof spec === 'object' && spec.type) {
    const shadow = { type: spec.type };
    if (spec.fields) shadow.fields = spec.fields;
    return shadow;
  }
  return null;
}

// ── Naming ───────────────────────────────────────────────────────────────

export function cssSafe(id) {
  return String(id).replace(/[^a-z0-9_-]/gi, '-');
}

export function blockStyleName(id) {
  return `lib_${cssSafe(id)}_blocks`;
}

export function categoryStyleName(id) {
  return `lib_${cssSafe(id)}_category`;
}
