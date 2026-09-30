/**
 * XRP Blocks — Drivetrain block definitions
 * Maps to XRPLib DifferentialDrive API
 */

export function registerDrivetrainBlocks() {

  // --- Drive Straight ---
  Blockly.Blocks['xrp_drive_straight'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_straight',
        message0: '%{BKY_XRP_DRIVE_STRAIGHT}',
        args0: [
          {
            type: 'input_value',
            name: 'DISTANCE',
            check: 'Number',
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_STRAIGHT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Drive Straight (with effort) ---
  Blockly.Blocks['xrp_drive_straight_effort'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_straight_effort',
        message0: '%{BKY_XRP_DRIVE_STRAIGHT_EFFORT}',
        args0: [
          { type: 'input_value', name: 'DISTANCE', check: 'Number' },
          { type: 'input_value', name: 'EFFORT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_STRAIGHT_EFFORT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Turn ---
  Blockly.Blocks['xrp_drive_turn'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_turn',
        message0: '%{BKY_XRP_DRIVE_TURN}',
        args0: [
          { type: 'input_value', name: 'ANGLE', check: 'Number' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_TURN_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Turn (with effort) ---
  Blockly.Blocks['xrp_drive_turn_effort'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_turn_effort',
        message0: '%{BKY_XRP_DRIVE_TURN_EFFORT}',
        args0: [
          { type: 'input_value', name: 'ANGLE', check: 'Number' },
          { type: 'input_value', name: 'EFFORT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_TURN_EFFORT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Turn calibration ---
  Blockly.Blocks['xrp_drive_turn_calibrate'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_turn_calibrate',
        message0: '%{BKY_XRP_DRIVE_TURN_CAL}',
        args0: [
          { type: 'input_value', name: 'PERCENT', check: 'Number' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_TURN_CAL_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Acceleration (every movement) ---
  Blockly.Blocks['xrp_drive_accel'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_accel',
        message0: '%{BKY_XRP_DRIVE_ACCEL}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'LEVEL',
            options: [
              ['%{BKY_XRP_ACCEL_XSLOW}', '0.125'],
              ['%{BKY_XRP_ACCEL_SLOW}', '0.25'],
              ['%{BKY_XRP_ACCEL_MEDIUM}', '0.5'],
              ['%{BKY_XRP_ACCEL_FAST}', '1.0'],
              ['%{BKY_XRP_ACCEL_XFAST}', '1.75'],
            ],
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_ACCEL_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Stop ---
  Blockly.Blocks['xrp_drive_stop'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_stop',
        message0: '%{BKY_XRP_DRIVE_STOP}',
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_STOP_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Set Drive Effort ---
  Blockly.Blocks['xrp_drive_set_effort'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_set_effort',
        message0: '%{BKY_XRP_DRIVE_SET_EFFORT}',
        args0: [
          { type: 'input_value', name: 'LEFT', check: 'Number' },
          { type: 'input_value', name: 'RIGHT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_SET_EFFORT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Set Drive Speed ---
  Blockly.Blocks['xrp_drive_set_speed'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_set_speed',
        message0: '%{BKY_XRP_DRIVE_SET_SPEED}',
        args0: [
          { type: 'input_value', name: 'LEFT', check: 'Number' },
          { type: 'input_value', name: 'RIGHT', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_SET_SPEED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Arcade Drive ---
  Blockly.Blocks['xrp_drive_arcade'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_arcade',
        message0: '%{BKY_XRP_DRIVE_ARCADE}',
        args0: [
          { type: 'input_value', name: 'SPEED', check: 'Number' },
          { type: 'input_value', name: 'TURN', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_ARCADE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Get Left Encoder ---
  Blockly.Blocks['xrp_drive_get_left_encoder'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_get_left_encoder',
        message0: '%{BKY_XRP_DRIVE_LEFT_ENCODER}',
        output: 'Number',
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_LEFT_ENCODER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Get Right Encoder ---
  Blockly.Blocks['xrp_drive_get_right_encoder'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_get_right_encoder',
        message0: '%{BKY_XRP_DRIVE_RIGHT_ENCODER}',
        output: 'Number',
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_RIGHT_ENCODER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Reset Encoders ---
  Blockly.Blocks['xrp_drive_encoder'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_encoder',
        message0: '%{BKY_XRP_DRIVE_ENCODER}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'SIDE',
            options: [
              ['%{BKY_XRP_SIDE_LEFT}', 'left'],
              ['%{BKY_XRP_SIDE_RIGHT}', 'right'],
            ],
          },
        ],
        output: 'Number',
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_ENCODER_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  Blockly.Blocks['xrp_drive_reset_encoders'] = {
    init() {
      this.jsonInit({
        type: 'xrp_drive_reset_encoders',
        message0: '%{BKY_XRP_DRIVE_RESET_ENCODERS}',
        previousStatement: null,
        nextStatement: null,
        style: 'drive_blocks',
        tooltip: '%{BKY_XRP_DRIVE_RESET_ENCODERS_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
