/**
 * XRP Blocks — Sensor block definitions
 * Maps to XRPLib DistanceSensor, Reflectance, IMU, Board APIs
 */

export function registerSensorBlocks() {

  // --- Distance Sensor ---
  Blockly.Blocks['xrp_distance_sensor'] = {
    init() {
      this.jsonInit({
        type: 'xrp_distance_sensor',
        message0: '%{BKY_XRP_DISTANCE_SENSOR}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_DISTANCE_SENSOR_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Line Follower Left ---
  Blockly.Blocks['xrp_line_get_left'] = {
    init() {
      this.jsonInit({
        type: 'xrp_line_get_left',
        message0: '%{BKY_XRP_LINE_GET_LEFT}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_LINE_GET_LEFT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Line Follower Right ---
  Blockly.Blocks['xrp_line_get_right'] = {
    init() {
      this.jsonInit({
        type: 'xrp_line_get_right',
        message0: '%{BKY_XRP_LINE_GET_RIGHT}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_LINE_GET_RIGHT_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- IMU Heading / Yaw ---
  Blockly.Blocks['xrp_imu_get_yaw'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_get_yaw',
        message0: '%{BKY_XRP_IMU_GET_YAW}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_GET_YAW_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- IMU Pitch ---
  Blockly.Blocks['xrp_imu_get_pitch'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_get_pitch',
        message0: '%{BKY_XRP_IMU_GET_PITCH}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_GET_PITCH_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- IMU Roll ---
  Blockly.Blocks['xrp_imu_get_roll'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_get_roll',
        message0: '%{BKY_XRP_IMU_GET_ROLL}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_GET_ROLL_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Line sensor reflectance, either side ---
  Blockly.Blocks['xrp_line_reflectance'] = {
    init() {
      this.jsonInit({
        type: 'xrp_line_reflectance',
        message0: '%{BKY_XRP_LINE_REFLECTANCE}',
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
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_LINE_REFLECTANCE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Gyro angle, any of the four readings ---
  Blockly.Blocks['xrp_imu_angle'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_angle',
        message0: '%{BKY_XRP_IMU_ANGLE}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'READING',
            options: [
              ['%{BKY_XRP_IMU_READ_YAW}', 'get_yaw'],
              ['%{BKY_XRP_IMU_READ_HEADING}', 'get_heading'],
              ['%{BKY_XRP_IMU_READ_PITCH}', 'get_pitch'],
              ['%{BKY_XRP_IMU_READ_ROLL}', 'get_roll'],
            ],
          },
        ],
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_ANGLE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Accelerometer, one axis, in a chosen unit (change 46) ---
  Blockly.Blocks['xrp_imu_accel'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_accel',
        message0: '%{BKY_XRP_IMU_ACCEL}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'AXIS',
            options: [
              ['X', 'x'],
              ['Y', 'y'],
              ['Z', 'z'],
            ],
          },
          {
            type: 'field_dropdown',
            name: 'UNIT',
            options: [
              ['%{BKY_XRP_IMU_ACCEL_G}', 'G'],
              ['%{BKY_XRP_IMU_ACCEL_MS2}', 'MS2'],
              ['%{BKY_XRP_IMU_ACCEL_MG}', 'MG'],
            ],
          },
        ],
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_ACCEL_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Reset one of the three angles ---
  Blockly.Blocks['xrp_imu_reset_yaw'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_reset_yaw',
        message0: '%{BKY_XRP_IMU_RESET_YAW}',
        args0: [
          {
            type: 'field_dropdown',
            name: 'AXIS',
            options: [
              ['%{BKY_XRP_IMU_AXIS_YAW}', 'yaw'],
              ['%{BKY_XRP_IMU_AXIS_PITCH}', 'pitch'],
              ['%{BKY_XRP_IMU_AXIS_ROLL}', 'roll'],
            ],
          },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_RESET_YAW_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Heading, bounded 0 to 360 ---
  Blockly.Blocks['xrp_imu_get_heading'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_get_heading',
        message0: '%{BKY_XRP_IMU_GET_HEADING}',
        output: 'Number',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_GET_HEADING_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- IMU Calibrate ---
  Blockly.Blocks['xrp_imu_calibrate'] = {
    init() {
      this.jsonInit({
        type: 'xrp_imu_calibrate',
        message0: '%{BKY_XRP_IMU_CALIBRATE}',
        previousStatement: null,
        nextStatement: null,
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_IMU_CALIBRATE_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Button Pressed ---
  Blockly.Blocks['xrp_button_is_pressed'] = {
    init() {
      this.jsonInit({
        type: 'xrp_button_is_pressed',
        message0: '%{BKY_XRP_BUTTON_IS_PRESSED}',
        output: 'Boolean',
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_BUTTON_IS_PRESSED_TOOLTIP}',
        helpUrl: '',
      });
    },
  };

  // --- Wait For Button ---
  Blockly.Blocks['xrp_wait_for_button'] = {
    init() {
      this.jsonInit({
        type: 'xrp_wait_for_button',
        message0: '%{BKY_XRP_WAIT_FOR_BUTTON}',
        previousStatement: null,
        nextStatement: null,
        style: 'sensor_blocks',
        tooltip: '%{BKY_XRP_WAIT_FOR_BUTTON_TOOLTIP}',
        helpUrl: '',
      });
    },
  };
}
