/**
 * Pinned blocks: right-click any block to add a ready-to-drag copy of it to
 * a "📌 Pinned" toolbox category, and right-click a pinned block again to
 * take it back out.
 *
 * How it works:
 *  - Pinning a block saves a JSON snapshot of that ONE block (its fields and
 *    any shadow/child value-inputs, e.g. the "20" in a distance socket) via
 *    Blockly.serialization.blocks.save(). Its next-connection is deliberately
 *    NOT saved, so pinning a block never drags the rest of its stack along.
 *  - Each snapshot gets a small id, stored in the block's own `.data`
 *    property. `.data` is a standard part of Blockly's block state, so it is
 *    saved and restored automatically both in the pinned list and in the
 *    user's own workspace file - no extra bookkeeping needed.
 *  - The Pinned category is a DYNAMIC category, the same mechanism Blockly
 *    itself uses internally for the built-in Variables and Functions
 *    categories (`custom: 'VARIABLE'` / `custom: 'PROCEDURE'` in toolbox.js).
 *    Its callback rebuilds the flyout's contents from localStorage on every
 *    open: each saved JSON snapshot is materialised on a throwaway headless
 *    workspace, converted to a real Blockly <block> XML element, and that
 *    element is what gets handed to the flyout. This is the same
 *    materialise-then-hand-back-XML path Blockly's own dynamic categories
 *    use, so it does not depend on any newer/less-certain toolbox JSON
 *    feature - only on APIs already exercised elsewhere in this app.
 *  - The category is always present (even with nothing pinned, its flyout
 *    just opens empty), so its place in the toolbox never moves around.
 *  - A pinned entry that fails to rebuild (e.g. it references a variable
 *    that no longer exists) is skipped and quietly removed rather than
 *    breaking the whole Pinned flyout.
 *  - Whenever there is at least one pinned block, a "📌 Unpin all" button
 *    appears at the top of the flyout, above the pinned blocks themselves.
 *
 * One known edge case, left as-is rather than engineered around: Blockly's
 * built-in "Duplicate" also copies `.data`. Duplicating a block you pinned
 * makes the duplicate register as pinned too, and right-clicking either copy
 * to unpin removes the one shared toolbox entry. Rare enough in a teaching
 * tool not to be worth extra bookkeeping.
 */

const STORAGE_KEY = 'xrp_blocks_pinned';

/** @returns {!Array<{id: string, state: !Object}>} */
function getPinnedEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('[XRP Blocks] Could not read pinned blocks from storage:', err);
    return [];
  }
}

function savePinnedEntries(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('[XRP Blocks] Could not save pinned blocks to storage:', err);
  }
}

/** @returns {boolean} whether this exact pin id is still a live pinned entry. */
function isPinned(block) {
  if (!block || !block.data) return false;
  return getPinnedEntries().some(entry => entry.id === block.data);
}

/**
 * Save a snapshot of one block (fields + value-inputs, not its stack) as a
 * new pinned entry, and mark the block itself as that entry so a further
 * right-click reads "Unpin".
 */
function pinBlock(block) {
  const id = 'pin_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
  block.data = id;
  const state = Blockly.serialization.blocks.save(block, {
    addCoordinates: false,
    addNextBlocks: false, // only this block (and its inputs), not what follows it
  });
  const list = getPinnedEntries();
  list.push({ id, state });
  savePinnedEntries(list);
}

/** Remove a pinned entry by id (works whether triggered from the original
 *  workspace block or from its copy sitting in the Pinned flyout). */
function unpinById(id) {
  savePinnedEntries(getPinnedEntries().filter(entry => entry.id !== id));
}

/** Clear every pinned block at once ("📌 Unpin all"). */
function unpinAll() {
  savePinnedEntries([]);
}

const CALLBACK_KEY = 'XRP_PINNED';
const UNPIN_ALL_BUTTON_KEY = 'XRP_UNPIN_ALL';

/**
 * Build the "Pinned" toolbox category. Always returned (even with nothing
 * pinned - its flyout just opens empty) so the category's place in the
 * toolbox never shifts around. This is a `custom` (dynamic) category - see
 * registerPinnedCategoryCallback below for what actually fills its flyout.
 * @returns {!Object} a toolbox category definition
 */
export function getPinnedCategory() {
  return {
    kind: 'category',
    categoryKey: 'Pinned',
    name: Blockly.Msg['CAT_PINNED'] || '📌 Pinned',
    categorystyle: 'pinned_category',
    cssConfig: { icon: 'cat-icon cat-icon-pinned' },
    custom: CALLBACK_KEY,
  };
}

/**
 * Registers the flyout callback for the dynamic Pinned category, and the
 * "Unpin all" button that appears at the top of it. Call this once, right
 * after the workspace is created (same lifetime as the workspace itself -
 * re-registering under the same keys just replaces the callbacks).
 * @param {!Blockly.WorkspaceSvg} workspace
 */
export function registerPinnedCategoryCallback(workspace) {
  workspace.registerToolboxCategoryCallback(CALLBACK_KEY, () => {
    const entries = getPinnedEntries();
    const xmlList = [];

    if (entries.length) {
      const button = Blockly.utils.xml.createElement('button');
      button.setAttribute('text', Blockly.Msg['XRP_UNPIN_ALL'] || '📌 Unpin all');
      button.setAttribute('callbackKey', UNPIN_ALL_BUTTON_KEY);
      xmlList.push(button);
    }

    for (const entry of entries) {
      let tempWorkspace;
      try {
        tempWorkspace = new Blockly.Workspace();
        const block = Blockly.serialization.blocks.append(entry.state, tempWorkspace);
        xmlList.push(Blockly.Xml.blockToDom(block, true));
      } catch (err) {
        console.warn('[XRP Blocks] Removing a pinned block that could not be rebuilt:', err);
        unpinById(entry.id);
      } finally {
        if (tempWorkspace) tempWorkspace.dispose();
      }
    }
    return xmlList;
  });

  workspace.registerButtonCallback(UNPIN_ALL_BUTTON_KEY, () => {
    unpinAll();
    // The flyout is open (that's how this button got clicked); ask the
    // toolbox to re-run the category callback so it immediately shows empty
    // instead of the now-stale list of blocks.
    const toolbox = workspace.getToolbox();
    if (toolbox && typeof toolbox.refreshSelection === 'function') {
      toolbox.refreshSelection();
    }
  });
}

/**
 * Registers the single Pin/Unpin context-menu item on every block.
 *
 * This does NOT reinject the toolbox (workspace.updateToolbox()). The Pinned
 * category is dynamic, so it already reads localStorage fresh every single
 * time its flyout opens - nothing needs to be rebuilt in advance for that.
 * The only case that needs an immediate nudge is unpinning a block that is
 * sitting in the Pinned flyout RIGHT NOW (the flyout is open, so it will not
 * reopen on its own); that case is handled the same lightweight way "Unpin
 * all" is, via toolbox.refreshSelection() - never a full updateToolbox().
 * Calling updateToolbox() from inside a context-menu callback was what
 * caused a stray, empty menu box to hang over the workspace: it replaces the
 * live Toolbox/Flyout objects out from under Blockly's own menu-closing
 * teardown, which is running at the very same moment.
 *
 * @param {!Blockly.WorkspaceSvg} workspace - the main workspace (not a flyout).
 */
export function registerPinnedBlocksMenu(workspace) {
  const registry = Blockly.ContextMenuRegistry.registry;
  const id = 'xrp_toggle_pin';
  if (registry.getItem(id)) registry.unregister(id);

  registry.register({
    id,
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    weight: 94, // just above "Delete unused blocks" (95) in the same menu
    displayText: (scope) => {
      const block = scope.block;
      const pinned = isPinned(block);
      return pinned
        ? (Blockly.Msg['XRP_UNPIN_BLOCK'] || '📌 Unpin from toolbox')
        : (Blockly.Msg['XRP_PIN_BLOCK'] || '📌 Pin to toolbox');
    },
    preconditionFn: (scope) => {
      const block = scope.block;
      if (!block) return 'hidden';
      // Shadow blocks (default input values) and the permanent start block
      // are not meaningful things to pin on their own.
      if (block.isShadow() || block.type === 'xrp_start') return 'hidden';
      return 'enabled';
    },
    callback: (scope) => {
      const block = scope.block;
      if (!block) return;
      if (isPinned(block)) {
        unpinById(block.data);
        block.data = null;
      } else {
        pinBlock(block);
      }
      // Only matters if the Pinned flyout is open right now (i.e. this block
      // itself lives in that flyout, and was just unpinned from inside it).
      // See the note on this function for why this is refreshSelection(),
      // never updateToolbox().
      const toolbox = workspace.getToolbox();
      if (toolbox && typeof toolbox.refreshSelection === 'function') {
        toolbox.refreshSelection();
      }
    },
  });
}
