/**
 * XRP Blocks: keyboard shortcuts and the shortcut help panel.
 *
 * Self-contained on purpose. It drives the app by clicking the existing
 * toolbar and panel buttons (so disabled states, the Deploy confirmation and
 * any local Run/Stop/Save logic are all respected), and it drives Blockly
 * through Blockly's own context-menu items (blockCollapseExpand, blockDisable,
 * blockDuplicate, collapseWorkspace, expandWorkspace), so the same rules and
 * the same Undo grouping apply as when a learner uses the right-click menu.
 *
 * Wiring (js/app.js), after the workspace and toolbar exist:
 *   import { initKeyboardShortcuts } from './ui/keyboard-shortcuts.js';
 *   initKeyboardShortcuts({
 *     workspace: this.workspace,
 *     showToast: (msg, type) => this._showToast(msg, type),
 *   });
 *
 * Strings: English and Dutch live below and are merged into Blockly.Msg only
 * where a key is not already defined, so translations.js can override any of
 * them later without touching this file.
 */

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(
  (navigator.userAgentData && navigator.userAgentData.platform) ||
  navigator.platform || navigator.userAgent || ''
);

// Pointer modifiers are only trusted for this long before a Blockly click event.
const CLICK_MODIFIER_WINDOW_MS = 1500;

const STRINGS = {
  en: {
    KBD_TITLE: 'Keyboard shortcuts',
    KBD_BUTTON_TIP: 'Keyboard shortcuts',
    KBD_CLOSE: 'Close',
    KBD_GROUP_PROGRAM: 'Program and robot',
    KBD_GROUP_BLOCKS: 'Blocks',
    KBD_GROUP_WORKSPACE: 'Workspace and panels',
    KBD_RUN: 'Run the program on the robot',
    KBD_STOP: 'Stop the running program',
    KBD_DEPLOY: 'Deploy (save as main.py on the robot)',
    KBD_SAVE: 'Save the project to a file',
    KBD_COLLAPSE_ONE: 'Collapse or expand a block',
    KBD_DISABLE_ONE: 'Disable or enable a block',
    KBD_DUPLICATE: 'Duplicate the selected block',
    KBD_WATCH: 'Watch or stop watching the selected variable',
    KBD_COLLAPSE_ALL: 'Collapse all blocks',
    KBD_EXPAND_ALL: 'Expand all blocks',
    KBD_COPY_PASTE: 'Copy, cut, paste',
    KBD_DELETE: 'Delete the selected block',
    KBD_UNDO: 'Undo',
    KBD_REDO: 'Redo',
    KBD_FIT: 'Show all blocks (fit to screen)',
    KBD_PANEL: 'Show or hide the Python/Console panel',
    KBD_MENU: 'Open the context menu of the selected block',
    KBD_ESCAPE: 'Close menus, flyouts and this panel',
    KBD_HELP: 'Show this list',
    KBD_CLICK: 'click',
    KBD_NOTE_TYPING: 'Single-key shortcuts only work while you are not typing in a field.',
    KBD_NEED_CONNECT: 'Connect the robot first.',
    KBD_NOTHING_RUNNING: 'No program is running.',
    KBD_SELECT_BLOCK: 'Select a block first.',
    KBD_NO_WATCH: 'This block has no variable or list to watch.',
    KBD_CANT_DO: 'That is not possible for this block.',
  },
  nl: {
    KBD_TITLE: 'Sneltoetsen',
    KBD_BUTTON_TIP: 'Sneltoetsen',
    KBD_CLOSE: 'Sluiten',
    KBD_GROUP_PROGRAM: 'Programma en robot',
    KBD_GROUP_BLOCKS: 'Blokken',
    KBD_GROUP_WORKSPACE: 'Werkruimte en panelen',
    KBD_RUN: 'Programma op de robot starten',
    KBD_STOP: 'Het lopende programma stoppen',
    KBD_DEPLOY: 'Opslaan op robot (als main.py)',
    KBD_SAVE: 'Project opslaan als bestand',
    KBD_COLLAPSE_ONE: 'Blok in- of uitklappen',
    KBD_DISABLE_ONE: 'Blok uit- of inschakelen',
    KBD_DUPLICATE: 'Geselecteerd blok dupliceren',
    KBD_WATCH: 'Geselecteerde variabele wel of niet volgen',
    KBD_COLLAPSE_ALL: 'Alle blokken inklappen',
    KBD_EXPAND_ALL: 'Alle blokken uitklappen',
    KBD_COPY_PASTE: 'Kopi\u00ebren, knippen, plakken',
    KBD_DELETE: 'Geselecteerd blok verwijderen',
    KBD_UNDO: 'Ongedaan maken',
    KBD_REDO: 'Opnieuw',
    KBD_FIT: 'Alle blokken tonen (passend maken)',
    KBD_PANEL: 'Python/Console-paneel tonen of verbergen',
    KBD_MENU: 'Contextmenu van het geselecteerde blok openen',
    KBD_ESCAPE: 'Menu\'s, lades en dit venster sluiten',
    KBD_HELP: 'Deze lijst tonen',
    KBD_CLICK: 'klik',
    KBD_NOTE_TYPING: 'Sneltoetsen met \u00e9\u00e9n toets werken alleen als je niet in een veld typt.',
    KBD_NEED_CONNECT: 'Verbind eerst de robot.',
    KBD_NOTHING_RUNNING: 'Er loopt geen programma.',
    KBD_SELECT_BLOCK: 'Selecteer eerst een blok.',
    KBD_NO_WATCH: 'Dit blok heeft geen variabele of lijst om te volgen.',
    KBD_CANT_DO: 'Dat kan niet bij dit blok.',
  },
};

function mergeStrings() {
  const lang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2);
  const table = STRINGS[lang] || STRINGS.en;
  for (const [key, value] of Object.entries(table)) {
    if (Blockly.Msg[key] === undefined) Blockly.Msg[key] = value;
  }
}

const t = (key) => Blockly.Msg[key] || STRINGS.en[key] || key;

// ── Key labels (Ctrl on Windows/Linux, the Mac symbols on a Mac) ──

const MOD = IS_MAC ? '\u2318' : 'Ctrl';
const ALT = IS_MAC ? '\u2325' : 'Alt';
const SHIFT = IS_MAC ? '\u21e7' : 'Shift';

/** The shortcut list: one source for both the help panel and the docs. */
function shortcutGroups() {
  return [
    {
      title: t('KBD_GROUP_PROGRAM'),
      items: [
        { keys: [[MOD, 'Enter']], label: t('KBD_RUN') },
        { keys: [[MOD, '.']], label: t('KBD_STOP') },
        { keys: [[MOD, SHIFT, 'Enter']], label: t('KBD_DEPLOY') },
        { keys: [[MOD, 'S']], label: t('KBD_SAVE') },
      ],
    },
    {
      title: t('KBD_GROUP_WORKSPACE'),
      items: [
        { keys: [['Home']], label: t('KBD_FIT') },
        // Ctrl, not Cmd, on a Mac too: Cmd+` switches windows in macOS.
        { keys: [[IS_MAC ? '\u2303' : 'Ctrl', '`']], label: t('KBD_PANEL') },
        { keys: [[SHIFT, 'F10']], label: t('KBD_MENU') },
        { keys: [['Esc']], label: t('KBD_ESCAPE') },
        { keys: [[MOD, '/'], ['?']], label: t('KBD_HELP') },
      ],
    },
    {
      title: t('KBD_GROUP_BLOCKS'),
      items: [
        { keys: [[MOD, t('KBD_CLICK')]], label: t('KBD_COLLAPSE_ONE') },
        { keys: [[ALT, t('KBD_CLICK')]], label: t('KBD_DISABLE_ONE') },
        { keys: [['D']], label: t('KBD_DUPLICATE') },
        { keys: [['W']], label: t('KBD_WATCH') },
        { keys: [[MOD, '[']], label: t('KBD_COLLAPSE_ALL') },
        { keys: [[MOD, ']']], label: t('KBD_EXPAND_ALL') },
        { keys: [[MOD, 'C'], ['X'], ['V']], label: t('KBD_COPY_PASTE') },
        { keys: [['Delete']], label: t('KBD_DELETE') },
        { keys: [[MOD, 'Z']], label: t('KBD_UNDO') },
        { keys: IS_MAC ? [[MOD, SHIFT, 'Z']] : [[MOD, 'Y'], [MOD, SHIFT, 'Z']], label: t('KBD_REDO') },
      ],
    },
  ];
}

// ── Helpers ──

let workspaceRef = null;
let toastFn = () => {};
let overlayEl = null;
let lastFocusBeforeOverlay = null;
let lastPointer = { ctrl: false, meta: false, alt: false, shift: false, time: 0 };

function isPrimary(e) {
  return IS_MAC ? (e.metaKey && !e.ctrlKey) : (e.ctrlKey && !e.metaKey);
}

function inBlocklyWidget(el) {
  return !!(el && el.closest && el.closest('.blocklyWidgetDiv, .blocklyDropDownDiv'));
}

function isEditable(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return false;
}

/** True when an open dialog (other than ours) should own the keyboard. */
function otherDialogOpen() {
  const dialogs = document.querySelectorAll('[role="dialog"], dialog[open]');
  for (const d of dialogs) {
    if (overlayEl && overlayEl.contains(d)) continue;
    if (isShown(d)) return true;
  }
  return false;
}

/** Rendered and visible (works for position: fixed, unlike offsetParent). */
function isShown(el) {
  if (!el || !el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // Some overlays stay laid out and hide with opacity/pointer-events instead
  // (e.g. the lesson confirm overlay), so treat those as hidden too.
  if (parseFloat(style.opacity) < 0.05 || style.pointerEvents === 'none') return false;
  return el.getClientRects().length > 0;
}

function clickButton(id, notReadyKey) {
  const btn = document.getElementById(id);
  if (!btn) return false;
  if (btn.disabled || !isShown(btn)) {
    if (notReadyKey) toastFn(t(notReadyKey), 'error');
    return false;
  }
  btn.click();
  return true;
}

/** Commit any Blockly field being edited, so Run/Deploy see the new value. */
function commitOpenEditor() {
  try {
    if (Blockly.WidgetDiv && Blockly.WidgetDiv.isVisible && Blockly.WidgetDiv.isVisible()) {
      Blockly.WidgetDiv.hide();
    }
    if (Blockly.DropDownDiv && Blockly.DropDownDiv.hideWithoutAnimation) {
      Blockly.DropDownDiv.hideWithoutAnimation();
    }
  } catch (err) {
    console.warn('[shortcuts] could not close the field editor', err);
  }
}

function selectedBlock() {
  const sel = Blockly.getSelected ? Blockly.getSelected() : Blockly.common && Blockly.common.getSelected();
  if (!sel || typeof sel.type !== 'string' || sel.isInFlyout) return null;
  return sel;
}

/**
 * Run one of Blockly's registered context-menu items against a scope,
 * honouring its own precondition exactly as the right-click menu would.
 * Returns true if it ran.
 */
function runMenuItem(id, scope) {
  const registry = Blockly.ContextMenuRegistry && Blockly.ContextMenuRegistry.registry;
  const item = registry && registry.getItem(id);
  if (!item) return false;
  const state = item.preconditionFn ? item.preconditionFn(scope) : 'enabled';
  if (state !== 'enabled') return false;
  item.callback(scope);
  return true;
}

/**
 * The live-watch item from js/blockly/watch-vars.js (change 32). Its menu-item
 * id is not imported here, so it is looked up by an id containing "watch".
 */
function findWatchItem() {
  const registry = Blockly.ContextMenuRegistry && Blockly.ContextMenuRegistry.registry;
  const items = registry && registry.registeredItems;
  if (!items || typeof items.forEach !== 'function') return null;
  let found = null;
  items.forEach((item, id) => {
    if (!found && /watch/i.test(String(id)) && item.scopeType !== 'workspace') found = item;
  });
  return found;
}

// ── Actions ──

const actions = {
  run() {
    commitOpenEditor();
    clickButton('btn-run', 'KBD_NEED_CONNECT');
  },
  stop() {
    clickButton('btn-stop', 'KBD_NOTHING_RUNNING');
  },
  deploy() {
    commitOpenEditor();
    clickButton('btn-deploy', 'KBD_NEED_CONNECT');
  },
  save() {
    commitOpenEditor();
    clickButton('btn-save');
  },
  togglePanel() {
    const panel = document.querySelector('.bottom-panel');
    if (!panel) return;
    const collapsed = panel.classList.contains('collapsed');
    if (collapsed) {
      // Open on Console while a program runs, otherwise on Python.
      const running = isShown(document.getElementById('btn-stop'));
      const tab = document.querySelector(`.bottom-panel__tab[data-tab="${running ? 'console' : 'python'}"]`) ||
        document.querySelector('.bottom-panel__tab');
      tab && tab.click();
    } else {
      const collapseBtn = ['btn-collapse-panel', 'btn-collapse-panel-2']
        .map((id) => document.getElementById(id))
        .find((b) => isShown(b));
      if (collapseBtn) collapseBtn.click();
      else {
        const active = document.querySelector('.bottom-panel__tab.active');
        active && active.click();
      }
    }
  },
  collapseAll() {
    if (!runMenuItem('collapseWorkspace', { workspace: workspaceRef })) toastFn(t('KBD_CANT_DO'), 'error');
  },
  expandAll() {
    if (!runMenuItem('expandWorkspace', { workspace: workspaceRef })) toastFn(t('KBD_CANT_DO'), 'error');
  },
  fit() {
    if (!workspaceRef) return;
    if (workspaceRef.getTopBlocks(false).length) workspaceRef.zoomToFit();
    else workspaceRef.scrollCenter();
  },
  duplicate() {
    const block = selectedBlock();
    if (!block) return toastFn(t('KBD_SELECT_BLOCK'), 'error');
    if (!runMenuItem('blockDuplicate', { block })) toastFn(t('KBD_CANT_DO'), 'error');
  },
  watch() {
    const block = selectedBlock();
    if (!block) return toastFn(t('KBD_SELECT_BLOCK'), 'error');
    const item = findWatchItem();
    if (!item) return toastFn(t('KBD_NO_WATCH'), 'error');
    const scope = { block };
    const state = item.preconditionFn ? item.preconditionFn(scope) : 'enabled';
    if (state !== 'enabled') return toastFn(t('KBD_NO_WATCH'), 'error');
    item.callback(scope);
  },
};

// ── Keyboard ──

function onKeyDown(e) {
  if (e.defaultPrevented || e.isComposing) return;
  const target = e.target;
  const typing = isEditable(target);
  const typingInBlockly = typing && inBlocklyWidget(target);
  const typingElsewhere = typing && !typingInBlockly;
  const code = e.code;
  const key = e.key;

  // Our own help panel: Esc closes it, everything else is left alone.
  if (overlayEl && !overlayEl.hidden) {
    if (key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    }
    return;
  }

  const dialogOpen = otherDialogOpen();
  const primary = isPrimary(e);

  // Stop is a safety key: it works everywhere, even while typing or in a dialog.
  if (primary && !e.altKey && !e.shiftKey && (key === '.' || code === 'Period')) {
    e.preventDefault();
    e.stopPropagation();
    actions.stop();
    return;
  }

  if (dialogOpen || typingElsewhere) return;

  // ── Modifier shortcuts. !e.altKey keeps AltGr (Ctrl+Alt on Windows) typing safe. ──
  if (primary && !e.altKey) {
    let action = null;
    if (key === 'Enter' && !e.shiftKey) action = 'run';
    else if (key === 'Enter' && e.shiftKey) action = 'deploy';
    else if (!e.shiftKey && (code === 'KeyS')) action = 'save';
    else if (!e.shiftKey && code === 'BracketLeft') action = 'collapseAll';
    else if (!e.shiftKey && code === 'BracketRight') action = 'expandAll';
    else if (!e.shiftKey && (code === 'Slash' || key === '/')) action = 'help';

    if (action) {
      e.preventDefault();
      // Stops Blockly's own Ctrl+Enter (context menu) from also firing;
      // that menu is remapped to Shift+F10 in remapBlocklyMenuKey().
      e.stopPropagation();
      if (e.repeat && action !== 'collapseAll' && action !== 'expandAll') return;
      if (action === 'help') openOverlay();
      else actions[action]();
      return;
    }
  }

  // Panel toggle is Ctrl+` on every platform (Cmd+` switches windows on a Mac).
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && code === 'Backquote') {
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) actions.togglePanel();
    return;
  }

  // Everything below is single-key, never while a Blockly field is being edited.
  if (typingInBlockly || e.ctrlKey || e.metaKey || e.altKey) return;

  if (key === '?') {
    e.preventDefault();
    openOverlay();
    return;
  }
  if (e.shiftKey) return;
  if (code === 'Home') {
    e.preventDefault();
    actions.fit();
  } else if (code === 'KeyD' && !e.repeat) {
    e.preventDefault();
    actions.duplicate();
  } else if (code === 'KeyW' && !e.repeat) {
    e.preventDefault();
    actions.watch();
  }
}

/** Blockly 12 opens a context menu on Ctrl+Enter; move that to Shift+F10. */
function remapBlocklyMenuKey() {
  try {
    const registry = Blockly.ShortcutRegistry.registry;
    const K = Blockly.utils.KeyCodes;
    const ctrlEnter = registry.createSerializedKey(K.ENTER, [K.CTRL_CMD]);
    registry.removeKeyMapping(ctrlEnter, 'menu', true);
    const shiftF10 = registry.createSerializedKey(K.F10, [K.SHIFT]);
    const existing = registry.getShortcutNamesByKeyCode(shiftF10) || [];
    if (!existing.includes('menu')) registry.addKeyMapping(shiftF10, 'menu', true);
  } catch (err) {
    console.warn('[shortcuts] could not remap the Blockly context-menu key', err);
  }
}

// ── Modifier + click on blocks ──

function onPointerDown(e) {
  lastPointer = { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey, time: Date.now() };
}

function onWorkspaceEvent(event) {
  if (event.type !== Blockly.Events.CLICK || event.targetType !== 'block' || !event.blockId) return;
  if (Date.now() - lastPointer.time > CLICK_MODIFIER_WINDOW_MS) return;

  const primaryClick = IS_MAC ? (lastPointer.meta && !lastPointer.ctrl) : (lastPointer.ctrl && !lastPointer.meta);
  const altClick = lastPointer.alt && !lastPointer.ctrl && !lastPointer.meta;
  if (!primaryClick && !altClick) return;
  lastPointer.time = 0; // one click, one action

  let block = workspaceRef.getBlockById(event.blockId);
  if (block && block.isShadow && block.isShadow()) block = block.getParent();
  if (!block) return;

  const id = primaryClick ? 'blockCollapseExpand' : 'blockDisable';
  // Deferred until Blockly has finished handling the click gesture; changes
  // made from inside the click event itself were not recorded for Undo.
  setTimeout(() => {
    if (block.isDisposed && block.isDisposed()) return;
    if (!runMenuItem(id, { block })) toastFn(t('KBD_CANT_DO'), 'error');
  }, 0);
}

// ── Help panel ──

const STYLE_ID = 'xrp-kbd-style';
const STYLE = `
.xrp-kbd-overlay {
  position: fixed; inset: 0; z-index: 100000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  background: rgba(20, 22, 30, 0.45);
}
.xrp-kbd-overlay[hidden] { display: none; }
.xrp-kbd-dialog {
  width: min(860px, 100%); max-height: min(86vh, 720px); overflow: auto;
  background: var(--color-surface, #fff); color: var(--color-text, #383a42);
  border: 1px solid var(--color-border, #e2e6ef);
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(45, 49, 66, 0.1));
  font-family: var(--font-ui, "Nunito", "Segoe UI", system-ui, sans-serif);
}
.xrp-kbd-head {
  position: sticky; top: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 16px 20px 12px;
  background: inherit; border-bottom: 1px solid var(--color-border, #e2e6ef);
}
.xrp-kbd-head h2 { margin: 0; font-size: 1.15rem; font-weight: 800; }
.xrp-kbd-close {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  width: 32px; height: 32px; border-radius: var(--radius-sm, 6px);
  display: inline-flex; align-items: center; justify-content: center;
}
.xrp-kbd-close:hover { background: var(--color-surface-hover, #f0f2f8); }
.xrp-kbd-close:focus-visible, .xrp-kbd-btn:focus-visible {
  outline: 2px solid var(--color-primary, #d1182c); outline-offset: 2px;
}
.xrp-kbd-body {
  column-count: 2; column-gap: 32px; padding: 4px 20px 8px;
}
.xrp-kbd-group { break-inside: avoid; padding-top: 6px; }
.xrp-kbd-group h3 {
  margin: 10px 0 6px; font-size: 0.85rem; font-weight: 800;
  color: var(--color-text-secondary, #5c6378);
}
.xrp-kbd-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  padding: 6px 0; border-bottom: 1px solid var(--color-border-light, #eef0f6);
  font-size: 0.9rem; line-height: 1.35;
}
.xrp-kbd-row:last-child { border-bottom: 0; }
.xrp-kbd-keys {
  display: inline-flex; flex-wrap: nowrap; flex-shrink: 0; align-items: center;
  justify-content: flex-end; gap: 4px; white-space: nowrap;
}
.xrp-kbd-mouse { font-size: 0.8rem; font-style: italic; color: var(--color-text-secondary, #5c6378); }
.xrp-kbd-or { color: var(--color-text-muted, #9ca3b8); font-size: 0.8rem; margin: 0 2px; }
.xrp-kbd-plus { color: var(--color-text-muted, #9ca3b8); font-size: 0.8rem; }
.xrp-kbd-overlay kbd {
  display: inline-block; min-width: 1.6em; padding: 1px 6px;
  font: 700 0.78rem/1.5 var(--font-ui, "Nunito", "Segoe UI", system-ui, sans-serif);
  text-align: center; color: var(--color-text, #383a42);
  background: var(--color-surface-hover, #f0f2f8);
  border: 1px solid var(--color-border, #e2e6ef); border-bottom-width: 2px;
  border-radius: 5px;
}
.xrp-kbd-foot {
  margin: 0; padding: 8px 20px 16px; font-size: 0.8rem;
  color: var(--color-text-secondary, #5c6378);
}
.xrp-kbd-btn .btn-icon { width: 18px; height: 18px; }
@media (max-width: 720px) {
  .xrp-kbd-body { column-count: 1; }
}
@media (max-width: 520px) {
  .xrp-kbd-row { flex-direction: column; align-items: flex-start; gap: 4px; }
  .xrp-kbd-keys { justify-content: flex-start; }
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function renderCombo(combo) {
  const frag = document.createDocumentFragment();
  combo.forEach((part, i) => {
    if (i > 0) frag.appendChild(el('span', { class: 'xrp-kbd-plus', text: '+', 'aria-hidden': 'true' }));
    // A mouse click is shown as a word, not as a key cap.
    if (part === t('KBD_CLICK')) frag.appendChild(el('span', { class: 'xrp-kbd-mouse', text: part }));
    else frag.appendChild(el('kbd', { text: part }));
  });
  return frag;
}

function buildOverlay() {
  const titleId = 'xrp-kbd-title';
  const closeBtn = el('button', { type: 'button', class: 'xrp-kbd-close', 'aria-label': t('KBD_CLOSE') });
  closeBtn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeBtn.addEventListener('click', closeOverlay);

  const body = el('div', { class: 'xrp-kbd-body' });
  for (const group of shortcutGroups()) {
    const section = el('section', { class: 'xrp-kbd-group' }, [el('h3', { text: group.title })]);
    for (const item of group.items) {
      const keys = el('span', { class: 'xrp-kbd-keys' });
      item.keys.forEach((combo, i) => {
        if (i > 0) keys.appendChild(el('span', { class: 'xrp-kbd-or', text: '/' }));
        keys.appendChild(renderCombo(combo));
      });
      section.appendChild(el('div', { class: 'xrp-kbd-row' }, [el('span', { text: item.label }), keys]));
    }
    body.appendChild(section);
  }

  const dialog = el('div', {
    class: 'xrp-kbd-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
  }, [
    el('div', { class: 'xrp-kbd-head' }, [el('h2', { id: titleId, text: t('KBD_TITLE') }), closeBtn]),
    body,
    el('p', { class: 'xrp-kbd-foot', text: t('KBD_NOTE_TYPING') }),
  ]);

  const overlay = el('div', { class: 'xrp-kbd-overlay', hidden: '' }, [dialog]);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeOverlay(); });
  // Keep Tab inside the panel (it has one focusable control).
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
  });
  document.body.appendChild(overlay);
  return overlay;
}

function openOverlay() {
  if (!overlayEl) overlayEl = buildOverlay();
  if (!overlayEl.hidden) return;
  try { workspaceRef && workspaceRef.hideChaff(); } catch (_) { /* ignore */ }
  lastFocusBeforeOverlay = document.activeElement;
  overlayEl.hidden = false;
  overlayEl.querySelector('.xrp-kbd-close').focus();
}

function closeOverlay() {
  if (!overlayEl || overlayEl.hidden) return;
  overlayEl.hidden = true;
  if (lastFocusBeforeOverlay && lastFocusBeforeOverlay.focus) {
    try { lastFocusBeforeOverlay.focus(); } catch (_) { /* ignore */ }
  }
}

// ── Toolbar button and tooltip hints ──

function addToolbarButton() {
  if (document.getElementById('btn-shortcuts')) return;
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return;
  const btn = el('button', {
    id: 'btn-shortcuts', type: 'button',
    class: 'toolbar__btn toolbar__btn--secondary xrp-kbd-btn',
    'data-tooltip': `${t('KBD_BUTTON_TIP')} (${MOD}+/)`,
    'aria-label': t('KBD_BUTTON_TIP'),
    'aria-keyshortcuts': IS_MAC ? 'Meta+/' : 'Control+/',
  });
  btn.innerHTML =
    '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="2" y="5" width="20" height="14" rx="2"/>' +
    '<path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 16h8"/></svg>';
  btn.addEventListener('click', openOverlay);

  // Before the language selector if present, otherwise at the end of the toolbar.
  const lang = document.getElementById('select-lang');
  if (lang && lang.parentNode) lang.parentNode.insertBefore(btn, lang);
  else toolbar.appendChild(btn);
}

function addTooltipHints() {
  const hints = {
    'btn-run': `${MOD}+Enter`,
    'btn-stop': `${MOD}+.`,
    'btn-deploy': `${MOD}+${SHIFT}+Enter`,
    'btn-save': `${MOD}+S`,
  };
  const ariaKeys = {
    'btn-run': IS_MAC ? 'Meta+Enter' : 'Control+Enter',
    'btn-stop': IS_MAC ? 'Meta+.' : 'Control+.',
    'btn-deploy': IS_MAC ? 'Meta+Shift+Enter' : 'Control+Shift+Enter',
    'btn-save': IS_MAC ? 'Meta+S' : 'Control+S',
  };
  for (const [id, hint] of Object.entries(hints)) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.setAttribute('aria-keyshortcuts', ariaKeys[id]);
    const tip = btn.getAttribute('data-tooltip');
    if (tip && !tip.includes(`(${hint})`)) btn.setAttribute('data-tooltip', `${tip} (${hint})`);
  }
}

// ── Public ──

let initialised = false;

export function initKeyboardShortcuts({ workspace, showToast } = {}) {
  if (initialised) return;
  if (!workspace || typeof Blockly === 'undefined') {
    console.warn('[shortcuts] not started: Blockly workspace missing');
    return;
  }
  initialised = true;
  workspaceRef = workspace;
  if (typeof showToast === 'function') toastFn = showToast;

  mergeStrings();
  injectStyle();
  remapBlocklyMenuKey();

  // Capture phase on window, so this runs before Blockly's document handler.
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  workspace.addChangeListener(onWorkspaceEvent);

  addToolbarButton();
  addTooltipHints();
}

/** Exposed for docs generation and tests. */
export const _internal = { shortcutGroups, STRINGS, IS_MAC };
