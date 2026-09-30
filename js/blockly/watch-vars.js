/**
 * XRP Blocks — Live variable/list watching ("mostly for development")
 *
 * The IDE cannot see inside the robot while a program runs — there is no
 * in-browser emulator (see the XRP project notes for why that is a
 * deliberately separate, bigger, not-yet-started project). What this module
 * gives instead is a live *hardware* watch: right-click a variable or list
 * "get" block and choose "Watch this value"; while the program is running
 * over USB/Bluetooth (Run, not Deploy — see below), the generated code
 * prints the watched value after every place it changes, this module
 * intercepts and hides those debug print lines from the visible Console,
 * and hovering the watched block shows the last value and how long ago it
 * updated, via Blockly's own built-in hover tooltip.
 *
 * Deliberately NOT built this session (documented in the project notes as
 * future work): a full in-browser block-stepper/emulator with highlighting
 * and a permanent watch panel. This is the smaller, self-contained half of
 * that ask — real values from the real robot, opt-in per variable.
 */

const STORAGE_KEY = 'xrp_blocks_watched_vars';

/** Watched variable IDs, persisted like pinned-blocks.js's pin list. */
let watchedIds = new Set(loadWatchedIds());

/** Last known value per watched variable ID: { text, ts }. */
const lastValues = new Map();

/**
 * Turned on/off by app.js around code generation: true only while
 * generating code for Run, so Deploy's main.py never carries debug prints.
 */
export const watchRuntime = { enabled: false };

function loadWatchedIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchedIds() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...watchedIds]));
  } catch {
    // Best-effort; watching still works for this session without persistence.
  }
}

export function isWatched(variableId) {
  return watchedIds.has(variableId);
}

export function setWatchEnabled(enabled) {
  watchRuntime.enabled = enabled;
}

/**
 * Toggle whether a variable is watched, and refresh the glow badge on every
 * block in the workspace that references it.
 */
export function toggleWatch(workspace, variableId) {
  if (watchedIds.has(variableId)) {
    watchedIds.delete(variableId);
  } else {
    watchedIds.add(variableId);
  }
  saveWatchedIds();
  refreshWatchVisuals(workspace);
}

/**
 * Block types the glow badge applies to: the reporters you'd actually hover
 * to check a value (they're also the ones attachWatchTooltip() is wired
 * into). Deliberately NOT every block that merely references a watched
 * variable — a list is typically touched by many add/insert/delete blocks
 * at once, and glowing all of them turned into one solid yellow blob
 * swallowing the whole stack instead of pointing at anything useful.
 */
const GLOW_BLOCK_TYPES = new Set(['xrp_list_get', 'variables_get']);

/**
 * Adds/removes the 'xrp-watched' CSS class (a soft gold glow, see
 * css/index.css) on the reporter block(s) for a watched variable — not on
 * every block that merely references it (see GLOW_BLOCK_TYPES above). Safe
 * to call often — e.g. after any workspace change, variable rename, or
 * delete.
 */
export function refreshWatchVisuals(workspace) {
  if (!workspace || typeof workspace.getAllBlocks !== 'function') return;
  for (const block of workspace.getAllBlocks(false)) {
    const svgRoot = typeof block.getSvgRoot === 'function' ? block.getSvgRoot() : null;
    if (!svgRoot) continue;
    const variable = GLOW_BLOCK_TYPES.has(block.type) ? getBlockVariable(block) : null;
    const watched = !!variable && isWatched(variable.getId());
    svgRoot.classList.toggle('xrp-watched', watched);
  }
}

/** @returns {?Blockly.VariableModel} the variable a block's VAR field points at, if any. */
function getBlockVariable(block) {
  const field = typeof block.getField === 'function' ? block.getField('VAR') : null;
  if (!field || typeof field.getVariable !== 'function') return null;
  return field.getVariable();
}

/**
 * Registers the right-click "Watch this value" / "Stop watching" item.
 * Appears on any block with a VAR field (list blocks, get/set, change-by).
 * Safe to call once at startup; Blockly.registry rejects a second
 * registration under the same id, so this guards against that itself.
 */
export function registerWatchContextMenu() {
  const ID = 'xrp_toggle_watch';
  if (Blockly.ContextMenuRegistry.registry.getItem(ID)) return;

  Blockly.ContextMenuRegistry.registry.register({
    id: ID,
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    weight: 3,
    displayText(scope) {
      const variable = getBlockVariable(scope.block);
      if (!variable) return '';
      return isWatched(variable.getId())
        ? (Blockly.Msg['XRP_WATCH_REMOVE'] || 'Stop watching')
        : (Blockly.Msg['XRP_WATCH_ADD'] || 'Watch this value');
    },
    preconditionFn(scope) {
      const variable = getBlockVariable(scope.block);
      return variable ? 'enabled' : 'hidden';
    },
    callback(scope) {
      const variable = getBlockVariable(scope.block);
      if (!variable) return;
      toggleWatch(scope.block.workspace, variable.getId());
    },
  });
}

/**
 * Wraps a reporter block's `init()` so its tooltip becomes dynamic: the
 * ordinary static tooltip, plus (once watched) the live value and when it
 * last updated. Blockly re-calls this function fresh every time it is about
 * to show the tooltip, so no manual refresh wiring is needed — hovering the
 * block after Blockly's own hover delay is enough.
 *
 * @param {!Blockly.Block} block
 * @param {string} staticMsgKey - the block's normal %{BKY_...} tooltip key
 */
export function attachWatchTooltip(block, staticMsgKey) {
  block.setTooltip(() => {
    const staticText = Blockly.Msg[staticMsgKey] || '';
    const variable = getBlockVariable(block);
    if (!variable) return staticText;
    if (!isWatched(variable.getId())) {
      return staticText + '\n\n👁 ' + (Blockly.Msg['XRP_WATCH_HINT']
        || 'Right-click → "Watch this value" to see it live here while the program runs.');
    }
    const seen = lastValues.get(variable.getId());
    if (!seen) {
      return staticText + '\n\n👁 ' + (Blockly.Msg['XRP_WATCH_PENDING']
        || 'Watching — click Run to see its value here.');
    }
    const ageSeconds = Math.max(0, (Date.now() - seen.ts) / 1000);
    const ago = ageSeconds < 1 ? '<1s' : `${ageSeconds.toFixed(1)}s`;
    return staticText + `\n\n👁 ${variable.getName()} = ${seen.text}\n`
      + `(${Blockly.Msg['XRP_WATCH_UPDATED'] || 'updated'} ${ago} ${Blockly.Msg['XRP_WATCH_AGO'] || 'ago'})`;
  });
}

/**
 * Called from a list/variable generator right after it emits code that may
 * change a watched value. Returns '' (no-op) unless watching is currently
 * enabled for code generation (Run, not Deploy) AND this specific block's
 * variable is one the user chose to watch — so an un-watched program is
 * generated exactly as before, with zero overhead.
 *
 * @param {!Blockly.Block} block - must carry a VAR field
 * @param {!Object} generator - the Python generator instance (for getVariableName)
 * @returns {string} an extra `print(...)` line, or ''
 */
export function maybeWatchPrint(block, generator) {
  if (!watchRuntime.enabled) return '';
  const variable = getBlockVariable(block);
  if (!variable || !isWatched(variable.getId())) return '';
  const pyName = generator.getVariableName(block.getFieldValue('VAR'));
  const id = JSON.stringify(variable.getId());
  // \x02 (STX) brackets the payload so it can never be confused with a
  // program's own print() output; stripWatchLines() below removes it from
  // what the Console displays before the user ever sees it.
  return `print('\\x02W\\x02' + ${id} + '\\x02' + repr(${pyName}) + '\\x02')\n`;
}

const WATCH_LINE_RE = /\x02W\x02([^\x02]*)\x02([\s\S]*?)\x02\r?\n?/g;

/**
 * Strips watch-debug lines out of raw serial text and records the values
 * they carried. Call this on every chunk of incoming serial data BEFORE
 * handing it to the Console panel, so the debug instrumentation never
 * clutters what the user sees.
 *
 * Known limitation: a watch line split across two separate serial chunks
 * (rare — print() lines are normally flushed whole) will not be recognised
 * and will show up as visible, slightly odd Console text instead of being
 * silently applied. Not yet handled by buffering partial lines.
 *
 * @param {string} text
 * @returns {string} text with any watch lines removed
 */
// Status lines the Phone control (Bluetooth) library prints for the phone
// page ("#xrp ok", "#xrp cfg ...", "#xrp m ..."). They also reach a USB
// Console, where they are only noise, so whole lines are hidden here. A line
// split across two chunks slips through, as with watch lines.
const PHONE_LINE_RE = /(?<=^|\n)#xrp (?:ok|cfg |m )[^\r\n]*\r?\n/g;

export function stripWatchLines(text) {
  if (text && text.indexOf('#xrp ') !== -1) {
    text = text.replace(PHONE_LINE_RE, '');
  }
  if (!text || text.indexOf('\x02') === -1) return text;
  return text.replace(WATCH_LINE_RE, (match, id, valueRepr) => {
    lastValues.set(id, { text: valueRepr, ts: Date.now() });
    return '';
  });
}
