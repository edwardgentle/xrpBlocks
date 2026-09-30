/**
 * XRP Blocks — PCF8575 I/O expander block definitions
 *
 * Every pin of a PCF8575 can be an LED (output) or a button (input); which it
 * is depends on how it is wired and which block you point at it. See
 * lib/PCF8575.py for the wiring, which must be active low in both cases.
 */

const PIN_OPTIONS = [
  ['0 (P00)', '0'], ['1 (P01)', '1'], ['2 (P02)', '2'], ['3 (P03)', '3'],
  ['4 (P04)', '4'], ['5 (P05)', '5'], ['6 (P06)', '6'], ['7 (P07)', '7'],
  ['8 (P10)', '8'], ['9 (P11)', '9'], ['10 (P12)', '10'], ['11 (P13)', '11'],
  ['12 (P14)', '12'], ['13 (P15)', '13'], ['14 (P16)', '14'], ['15 (P17)', '15'],
];

const ADDRESS_OPTIONS = [
  ['0x20', '0x20'], ['0x21', '0x21'], ['0x22', '0x22'], ['0x23', '0x23'],
  ['0x24', '0x24'], ['0x25', '0x25'], ['0x26', '0x26'], ['0x27', '0x27'],
];

export function registerExpanderBlocks() {
  // --- Set up the expander ---
  Blockly.Blocks['xrp_pcf_setup'] = {
    init() {
      this.jsonInit({
        type: 'xrp_pcf_setup',
        message0: '%{BKY_XRP_PCF_SETUP}',
        args0: [
          { type: 'field_dropdown', name: 'ADDR', options: ADDRESS_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'expander_blocks',
        tooltip: '%{BKY_XRP_PCF_SETUP_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Declare what is wired to a pin ---
  Blockly.Blocks['xrp_pcf_pin_mode'] = {
    init() {
      this.jsonInit({
        type: 'xrp_pcf_pin_mode',
        message0: '%{BKY_XRP_PCF_PIN_MODE}',
        args0: [
          { type: 'field_dropdown', name: 'PIN', options: PIN_OPTIONS },
          {
            type: 'field_dropdown',
            name: 'MODE',
            options: [
              ['%{BKY_XRP_PCF_MODE_LED}', 'OUTPUT'],
              ['%{BKY_XRP_PCF_MODE_BUTTON}', 'INPUT'],
            ],
          },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'expander_blocks',
        tooltip: '%{BKY_XRP_PCF_PIN_MODE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- LED on / off ---
  Blockly.Blocks['xrp_pcf_led'] = {
    init() {
      this.jsonInit({
        type: 'xrp_pcf_led',
        message0: '%{BKY_XRP_PCF_LED}',
        args0: [
          { type: 'field_dropdown', name: 'PIN', options: PIN_OPTIONS },
          {
            type: 'field_dropdown',
            name: 'STATE',
            options: [
              ['%{BKY_XRP_PCF_ON}', 'ON'],
              ['%{BKY_XRP_PCF_OFF}', 'OFF'],
            ],
          },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'expander_blocks',
        tooltip: '%{BKY_XRP_PCF_LED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- All LEDs off ---
  Blockly.Blocks['xrp_pcf_all_off'] = {
    init() {
      this.jsonInit({
        type: 'xrp_pcf_all_off',
        message0: '%{BKY_XRP_PCF_ALL_OFF}',
        previousStatement: null,
        nextStatement: null,
        style: 'expander_blocks',
        tooltip: '%{BKY_XRP_PCF_ALL_OFF_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Button pressed? (boolean reporter) ---
  Blockly.Blocks['xrp_pcf_button'] = {
    init() {
      this.jsonInit({
        type: 'xrp_pcf_button',
        message0: '%{BKY_XRP_PCF_BUTTON}',
        args0: [
          { type: 'field_dropdown', name: 'PIN', options: PIN_OPTIONS },
        ],
        output: 'Boolean',
        style: 'expander_blocks',
        tooltip: '%{BKY_XRP_PCF_BUTTON_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Raw pin write ---
  Blockly.Blocks['xrp_pcf_set_pin'] = {
    init() {
      this.jsonInit({
        type: 'xrp_pcf_set_pin',
        message0: '%{BKY_XRP_PCF_SET_PIN}',
        args0: [
          { type: 'field_dropdown', name: 'PIN', options: PIN_OPTIONS },
          {
            type: 'field_dropdown',
            name: 'LEVEL',
            options: [
              ['%{BKY_XRP_PCF_HIGH}', 'HIGH'],
              ['%{BKY_XRP_PCF_LOW}', 'LOW'],
            ],
          },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'expander_blocks',
        tooltip: '%{BKY_XRP_PCF_SET_PIN_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Raw pin read (number reporter) ---
  Blockly.Blocks['xrp_pcf_read_pin'] = {
    init() {
      this.jsonInit({
        type: 'xrp_pcf_read_pin',
        message0: '%{BKY_XRP_PCF_READ_PIN}',
        args0: [
          { type: 'field_dropdown', name: 'PIN', options: PIN_OPTIONS },
        ],
        output: 'Number',
        style: 'expander_blocks',
        tooltip: '%{BKY_XRP_PCF_READ_PIN_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
