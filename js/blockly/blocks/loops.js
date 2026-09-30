/**
 * XRP Blocks — Loop block definitions
 * Adds a beginner-friendly "repeat forever" block (Scratch style).
 */

export function registerLoopBlocks() {
  // --- Repeat Forever ---
  Blockly.Blocks['xrp_forever'] = {
    init() {
      this.jsonInit({
        type: 'xrp_forever',
        message0: '%{BKY_XRP_FOREVER}',
        message1: '%1',
        args1: [
          { type: 'input_statement', name: 'DO' },
        ],
        previousStatement: null,
        // No nextStatement: nothing can follow a forever loop, which makes
        // the "this never ends" idea visible in the shape of the block.
        style: 'loop_blocks',
        tooltip: '%{BKY_XRP_FOREVER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
