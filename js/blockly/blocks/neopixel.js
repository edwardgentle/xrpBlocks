/**
 * XRP Blocks — NeoPixel strip block definitions
 *
 * A WS2812 strip needs exact 800 kHz timing, so the data line must go to a
 * real GPIO on the XRP. The servo headers are the easiest physical connector;
 * GPIO 12 to 19 are free on the XRP Controller.
 */

const NP_PIN_OPTIONS = [
  ['Servo 1 (GPIO 6)', '6'],
  ['Servo 2 (GPIO 9)', '9'],
  ['Servo 3 (GPIO 7)', '7'],
  ['Servo 4 (GPIO 8)', '8'],
  ['GPIO 12', '12'],
  ['GPIO 13', '13'],
  ['GPIO 14', '14'],
  ['GPIO 15', '15'],
  ['GPIO 16', '16'],
  ['GPIO 17', '17'],
  ['GPIO 18', '18'],
  ['GPIO 19', '19'],
];

const NP_COLOUR_OPTIONS = [
  ['%{BKY_XRP_NP_C_RED}', 'red'],
  ['%{BKY_XRP_NP_C_ORANGE}', 'orange'],
  ['%{BKY_XRP_NP_C_YELLOW}', 'yellow'],
  ['%{BKY_XRP_NP_C_GREEN}', 'green'],
  ['%{BKY_XRP_NP_C_CYAN}', 'cyan'],
  ['%{BKY_XRP_NP_C_BLUE}', 'blue'],
  ['%{BKY_XRP_NP_C_PURPLE}', 'purple'],
  ['%{BKY_XRP_NP_C_MAGENTA}', 'magenta'],
  ['%{BKY_XRP_NP_C_PINK}', 'pink'],
  ['%{BKY_XRP_NP_C_WHITE}', 'white'],
  ['%{BKY_XRP_NP_C_OFF}', 'off'],
];

export function registerNeoPixelBlocks() {
  // --- Set up the strip ---
  Blockly.Blocks['xrp_np_setup'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_setup',
        message0: '%{BKY_XRP_NP_SETUP}',
        args0: [
          { type: 'field_dropdown', name: 'PIN', options: NP_PIN_OPTIONS },
          { type: 'input_value', name: 'COUNT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_SETUP_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Brightness ---
  Blockly.Blocks['xrp_np_brightness'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_brightness',
        message0: '%{BKY_XRP_NP_BRIGHTNESS}',
        args0: [
          { type: 'input_value', name: 'PERCENT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_BRIGHTNESS_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Named colour (reporter) ---
  Blockly.Blocks['xrp_np_colour'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_colour',
        message0: '%{BKY_XRP_NP_COLOUR}',
        args0: [
          { type: 'field_dropdown', name: 'NAME', options: NP_COLOUR_OPTIONS },
        ],
        output: 'Colour',
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_COLOUR_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Colour from red/green/blue (reporter) ---
  Blockly.Blocks['xrp_np_rgb'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_rgb',
        message0: '%{BKY_XRP_NP_RGB}',
        args0: [
          { type: 'input_value', name: 'RED', check: 'Number' },
          { type: 'input_value', name: 'GREEN', check: 'Number' },
          { type: 'input_value', name: 'BLUE', check: 'Number' },
        ],
        inputsInline: true,
        output: 'Colour',
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_RGB_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Set one pixel ---
  Blockly.Blocks['xrp_np_set_pixel'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_set_pixel',
        message0: '%{BKY_XRP_NP_SET_PIXEL}',
        args0: [
          { type: 'input_value', name: 'INDEX', check: 'Number' },
          { type: 'input_value', name: 'COLOUR', check: 'Colour' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_SET_PIXEL_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Set the whole strip ---
  Blockly.Blocks['xrp_np_fill'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_fill',
        message0: '%{BKY_XRP_NP_FILL}',
        args0: [
          { type: 'input_value', name: 'COLOUR', check: 'Colour' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_FILL_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Clear ---
  Blockly.Blocks['xrp_np_clear'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_clear',
        message0: '%{BKY_XRP_NP_CLEAR}',
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_CLEAR_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Rainbow ---
  Blockly.Blocks['xrp_np_rainbow'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_rainbow',
        message0: '%{BKY_XRP_NP_RAINBOW}',
        args0: [
          { type: 'input_value', name: 'OFFSET', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_RAINBOW_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Shift ---
  Blockly.Blocks['xrp_np_shift'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_shift',
        message0: '%{BKY_XRP_NP_SHIFT}',
        args0: [
          { type: 'input_value', name: 'STEP', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_SHIFT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Show / update mode ---
  Blockly.Blocks['xrp_np_show'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_show',
        message0: '%{BKY_XRP_NP_SHOW}',
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_SHOW_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  Blockly.Blocks['xrp_np_auto_show'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_auto_show',
        message0: '%{BKY_XRP_NP_AUTO_SHOW}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'MODE',
            options: [
              ['%{BKY_XRP_NP_AUTO_ON}', 'True'],
              ['%{BKY_XRP_NP_AUTO_OFF}', 'False'],
            ],
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_AUTO_SHOW_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Number of pixels (reporter) ---
  Blockly.Blocks['xrp_np_count'] = {
    init() {
      this.jsonInit({
        type: 'xrp_np_count',
        message0: '%{BKY_XRP_NP_COUNT}',
        output: 'Number',
        style: 'neopixel_blocks',
        tooltip: '%{BKY_XRP_NP_COUNT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
