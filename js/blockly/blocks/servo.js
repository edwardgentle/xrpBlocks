/**
 * XRP Blocks — Servo block definitions
 * Maps to XRPLib Servo API
 *
 * XRPLib's angle range is 0 to 200, which spans the full 500 to 2500 us pulse
 * of a standard hobby servo. That makes 100 the true centre, not 90.
 *
 * Servos 3 and 4 exist on the XRP Controller but not on the XRP Beta.
 */

export function registerServoBlocks() {
  const SERVO_OPTIONS = [
    ['%{BKY_XRP_SERVO_1}', '1'],
    ['%{BKY_XRP_SERVO_2}', '2'],
    ['%{BKY_XRP_SERVO_3}', '3'],
    ['%{BKY_XRP_SERVO_4}', '4'],
  ];

  // --- Set Servo Angle ---
  Blockly.Blocks['xrp_servo_set_angle'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_set_angle',
        message0: '%{BKY_XRP_SERVO_SET_ANGLE}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
          { type: 'input_value', name: 'ANGLE', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_SET_ANGLE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Centre Servo ---
  Blockly.Blocks['xrp_servo_centre'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_centre',
        message0: '%{BKY_XRP_SERVO_CENTRE}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_CENTRE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Sweep Servo ---
  Blockly.Blocks['xrp_servo_sweep'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_sweep',
        message0: '%{BKY_XRP_SERVO_SWEEP}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
        ],
        message1: '%{BKY_XRP_SERVO_SWEEP_RANGE}',
        args1: [
          { type: 'input_value', name: 'FROM', check: 'Number' },
          { type: 'input_value', name: 'TO', check: 'Number' },
        ],
        message2: '%{BKY_XRP_SERVO_SWEEP_TIME}',
        args2: [
          { type: 'input_value', name: 'SECONDS', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_SWEEP_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Continuous rotation speed ---
  Blockly.Blocks['xrp_servo_speed'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_speed',
        message0: '%{BKY_XRP_SERVO_SPEED}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
          { type: 'input_value', name: 'SPEED', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_SPEED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Free Servo ---
  Blockly.Blocks['xrp_servo_free'] = {
    init() {
      this.jsonInit({
        type: 'xrp_servo_free',
        message0: '%{BKY_XRP_SERVO_FREE}',
        args0: [
          { type: 'field_dropdown', name: 'SERVO', options: SERVO_OPTIONS },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'servo_blocks',
        tooltip: '%{BKY_XRP_SERVO_FREE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
