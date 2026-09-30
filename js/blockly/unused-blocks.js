/** Find disconnected stacks and functions unreachable from a start block. */
export function unusedRoots(workspace) {
  const roots = workspace.getTopBlocks(false);
  const kept = new Set();
  const pending = roots.filter(root => root.type === 'xrp_start' ||
    // Default input values are shadow blocks: they cannot be deleted on their
    // own, but must not protect an otherwise unused stack from cleanup.
    root.getDescendants(false).some(block => !block.isShadow() && !block.isDeletable()));
  const definitions = roots.filter(root => typeof root.getProcedureDef === 'function');

  while (pending.length) {
    const root = pending.pop();
    if (kept.has(root)) continue;
    kept.add(root);
    for (const block of root.getDescendants(false)) {
      if (typeof block.getProcedureCall !== 'function') continue;
      const name = block.getProcedureCall();
      for (const definition of definitions) {
        if (Blockly.Names.equals(definition.getProcedureDef()[0], name)) {
          pending.push(definition);
        }
      }
    }
  }
  return roots.filter(root => !kept.has(root));
}

export function deleteUnusedBlocks(workspace) {
  const roots = unusedRoots(workspace);
  const previousGroup = Blockly.Events.getGroup();
  Blockly.Events.setGroup(true);
  try {
    for (const root of roots) root.dispose(false);
  } finally {
    Blockly.Events.setGroup(previousGroup);
  }
}

export function registerUnusedBlocksMenu(workspace) {
  const registry = Blockly.ContextMenuRegistry.registry;
  for (const scopeType of [Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
    Blockly.ContextMenuRegistry.ScopeType.BLOCK]) {
    const id = 'xrp_delete_unused_' + scopeType;
    if (registry.getItem(id)) registry.unregister(id);
    registry.register({
      id,
      scopeType,
      weight: 95,
      displayText: () => Blockly.Msg['XRP_DELETE_UNUSED'] || 'Delete unused blocks',
      preconditionFn: scope => {
        const target = scope.block?.workspace || scope.workspace;
        if (target !== workspace || target.isFlyout || target.options.readOnly) return 'hidden';
        return unusedRoots(target).length ? 'enabled' : 'disabled';
      },
      callback: () => deleteUnusedBlocks(workspace),
    });
  }
}
