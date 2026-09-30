/**
 * XRP Blocks — Board block definitions
 * Maps to XRPLib Board API + general utilities
 */

export function registerBoardBlocks() {
  // --- Start (Hat Block) ---
  Blockly.Blocks['xrp_start'] = {
    init() {
      this.jsonInit({
        type: 'xrp_start',
        message0: '%{BKY_XRP_START}',
        nextStatement: null,
        style: 'events_blocks',
        tooltip: '%{BKY_XRP_START_TOOLTIP}',
        helpUrl: '',
      });
      this.setDeletable(false);
    },
  };

  // --- LED On ---
  Blockly.Blocks['xrp_led_on'] = {
    init() {
      this.jsonInit({
        type: 'xrp_led_on',
        message0: '%{BKY_XRP_LED_ON}',
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_LED_ON_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- LED Off ---
  Blockly.Blocks['xrp_led_off'] = {
    init() {
      this.jsonInit({
        type: 'xrp_led_off',
        message0: '%{BKY_XRP_LED_OFF}',
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_LED_OFF_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- LED Blink ---
  Blockly.Blocks['xrp_led_blink'] = {
    init() {
      this.jsonInit({
        type: 'xrp_led_blink',
        message0: '%{BKY_XRP_LED_BLINK}',
        args0: [
          { type: 'input_value', name: 'COUNT', check: 'Number' },
          { type: 'input_value', name: 'DELAY', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_LED_BLINK_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- RGB LED ---
  Blockly.Blocks['xrp_rgb_led'] = {
    init() {
      this.jsonInit({
        type: 'xrp_rgb_led',
        message0: '%{BKY_XRP_RGB_LED}',
        args0: [
          { type: 'input_value', name: 'RED', check: 'Number' },
          { type: 'input_value', name: 'GREEN', check: 'Number' },
          { type: 'input_value', name: 'BLUE', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_RGB_LED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // Simple onboard colour control; independent of add-on device libraries.
  Blockly.Blocks['xrp_rgb_colour'] = {
    init() {
      const colours = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue',
        'purple', 'magenta', 'pink', 'white', 'off'];
      this.jsonInit({
        message0: '%{BKY_XRP_RGB_COLOUR}',
        args0: [
          { type: 'field_dropdown', name: 'COLOUR', options: colours.map(name =>
            [Blockly.Msg['XRP_COLOUR_' + name.toUpperCase()] || name, name]) },
          { type: 'input_value', name: 'BRIGHTNESS', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_RGB_COLOUR_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Wait / Sleep ---
  Blockly.Blocks['xrp_wait_seconds'] = {
    init() {
      this.jsonInit({
        type: 'xrp_wait_seconds',
        message0: '%{BKY_XRP_WAIT_SECONDS}',
        args0: [
          { type: 'input_value', name: 'SECONDS', check: 'Number' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_WAIT_SECONDS_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Print ---
  Blockly.Blocks['xrp_print'] = {
    init() {
      this.jsonInit({
        type: 'xrp_print',
        message0: '%{BKY_XRP_PRINT}',
        args0: [
          { type: 'input_value', name: 'TEXT' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'board_blocks',
        tooltip: '%{BKY_XRP_PRINT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
