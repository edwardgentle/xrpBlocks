/**
 * XRP Blocks — Toolbox Definition
 * Category-based toolbox with XRP-specific and standard Blockly categories.
 *
 * Each category has a stable `categoryKey` (English, no spaces) used by
 * the lesson system to filter categories regardless of UI language.
 *
 * Device libraries (devices/*.json) contribute their own categories at run
 * time. They are passed in rather than hard-coded here, so adding a device
 * never means editing this file. PCF8575 and NeoPixel used to live here and
 * are now two such libraries.
 */

/**
 * @param {Array<Object>} [libraryCategories] - categories contributed by the
 *   device libraries the user has added, in the order they were added.
 * @param {?Object} [pinnedCategory] - the "📌 Pinned" category (see
 *   blockly/pinned-blocks.js), or null/undefined when nothing is pinned yet.
 */
export function getToolboxDefinition(libraryCategories = [], pinnedCategory = null) {
  const toolbox = {
    kind: 'categoryToolbox',
    contents: [
      // ── XRP Categories ──
      // Note: the "Events" category (xrp_start) is intentionally omitted from
      // the toolbox. The start block is a permanent, non-deletable fixture
      // that is always present on the canvas by default (see app.js), so it
      // should not be selectable/draggable from the toolbox.
      {
        kind: 'category',
        categoryKey: 'Drive',
        name: Blockly.Msg['CAT_DRIVE'] || 'Drive',
        categorystyle: 'drive_category',
        cssConfig: { icon: 'cat-icon cat-icon-drive' },
        contents: [
          // Getting the robot moving.
          {
            kind: 'block',
            type: 'xrp_drive_straight',
            inputs: {
              DISTANCE: { shadow: { type: 'math_number', fields: { NUM: 20 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_turn',
            inputs: {
              ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
            },
          },
          { kind: 'block', type: 'xrp_drive_stop' },
          { kind: 'sep', gap: '24' },
          // The same two, once a learner wants to choose the power.
          {
            kind: 'block',
            type: 'xrp_drive_straight_effort',
            inputs: {
              DISTANCE: { shadow: { type: 'math_number', fields: { NUM: 20 } } },
              EFFORT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_turn_effort',
            inputs: {
              ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
              EFFORT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          // Put once at the start of a program if turns are consistently off.
          {
            kind: 'block',
            type: 'xrp_drive_turn_calibrate',
            inputs: {
              PERCENT: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_accel',
            fields: { LEVEL: '0.5' },
          },
          { kind: 'sep', gap: '24' },
          // Driving the wheels directly, which does not stop by itself.
          {
            kind: 'block',
            type: 'xrp_drive_set_effort',
            inputs: {
              LEFT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
              RIGHT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_arcade',
            inputs: {
              SPEED: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
              TURN: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_drive_set_speed',
            inputs: {
              LEFT: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
              RIGHT: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            },
          },
          { kind: 'sep', gap: '24' },
          // Measuring how far the wheels have turned.
          { kind: 'block', type: 'xrp_drive_encoder' },
          { kind: 'block', type: 'xrp_drive_reset_encoders' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Motors',
        name: Blockly.Msg['CAT_MOTORS'] || 'Motors',
        categorystyle: 'motor_category',
        cssConfig: { icon: 'cat-icon cat-icon-motors' },
        contents: [
          // One motor at a time, in percent like everything else.
          {
            kind: 'block',
            type: 'xrp_motor_set_effort_percent',
            inputs: {
              PERCENT: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          { kind: 'block', type: 'xrp_motor_brake' },
          { kind: 'block', type: 'xrp_motor_coast' },
          { kind: 'sep', gap: '24' },
          // Holding a steady speed, which needs the encoder.
          {
            kind: 'block',
            type: 'xrp_motor_set_speed',
            inputs: {
              SPEED: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
            },
          },
          { kind: 'block', type: 'xrp_motor_speed_off' },
          { kind: 'sep', gap: '24' },
          // Reading the encoder.
          { kind: 'block', type: 'xrp_motor_get_position' },
          { kind: 'block', type: 'xrp_motor_get_counts' },
          { kind: 'block', type: 'xrp_motor_get_speed' },
          { kind: 'block', type: 'xrp_motor_reset_encoder' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Servo',
        name: Blockly.Msg['CAT_SERVO'] || 'Servo',
        categorystyle: 'servo_category',
        cssConfig: { icon: 'cat-icon cat-icon-servo' },
        contents: [
          // Degrees, 0 to 180, with 90 in the middle.
          {
            kind: 'block',
            type: 'xrp_servo_set_angle',
            inputs: {
              ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
            },
          },
          { kind: 'block', type: 'xrp_servo_centre' },
          { kind: 'sep', gap: '24' },
          // Moving smoothly rather than jumping.
          {
            kind: 'block',
            type: 'xrp_servo_sweep',
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 180 } } },
              SECONDS: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            },
          },
          { kind: 'sep', gap: '24' },
          // For a continuous rotation servo, and for letting go.
          {
            kind: 'block',
            type: 'xrp_servo_speed',
            inputs: {
              SPEED: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            },
          },
          { kind: 'block', type: 'xrp_servo_free' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Sensors',
        name: Blockly.Msg['CAT_SENSORS'] || 'Sensors',
        categorystyle: 'sensor_category',
        cssConfig: { icon: 'cat-icon cat-icon-sensors' },
        contents: [
          // What the robot can see and feel.
          { kind: 'block', type: 'xrp_distance_sensor' },
          { kind: 'block', type: 'xrp_line_reflectance' },
          { kind: 'sep', gap: '16' },
          { kind: 'block', type: 'xrp_button_is_pressed' },
          { kind: 'block', type: 'xrp_wait_for_button' },
          { kind: 'sep', gap: '24' },
          // The gyro, which needs zeroing before it means anything.
          { kind: 'block', type: 'xrp_imu_angle' },
          { kind: 'block', type: 'xrp_imu_reset_yaw' },
          { kind: 'block', type: 'xrp_imu_calibrate' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Board',
        name: Blockly.Msg['CAT_BOARD'] || 'Board',
        categorystyle: 'board_category',
        cssConfig: { icon: 'cat-icon cat-icon-board' },
        contents: [
          // The single green LED.
          { kind: 'block', type: 'xrp_led_on' },
          { kind: 'block', type: 'xrp_led_off' },
          {
            kind: 'block',
            type: 'xrp_led_blink',
            inputs: {
              COUNT: { shadow: { type: 'math_number', fields: { NUM: 3 } } },
              DELAY: { shadow: { type: 'math_number', fields: { NUM: 0.5 } } },
            },
          },
          { kind: 'sep', gap: '16' },
          // Used by almost every program.
          {
            kind: 'block',
            type: 'xrp_wait_seconds',
            inputs: {
              SECONDS: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            },
          },
          {
            kind: 'block',
            type: 'xrp_print',
            inputs: {
              TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hello XRP!' } } },
            },
          },
          { kind: 'sep', gap: '24' },
          {
            kind: 'block',
            type: 'xrp_rgb_colour',
            inputs: {
              BRIGHTNESS: { shadow: { type: 'math_number', fields: { NUM: 30 } } },
            },
          },
          // Mixing your own colour on the RGB LED.
          {
            kind: 'block',
            type: 'xrp_rgb_led',
            inputs: {
              RED: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
              GREEN: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              BLUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            },
          },
        ],
      },

      // ── Device library categories (devices/*.json) ──
      ...libraryCategories,

      // ── Separator ──
      { kind: 'sep' },

      // ── Standard Blockly Categories ──
      {
        kind: 'category',
        categoryKey: 'Logic',
        name: Blockly.Msg['CAT_LOGIC'] || 'Logic',
        categorystyle: 'logic_category',
        cssConfig: { icon: 'cat-icon cat-icon-logic' },
        contents: [
          { kind: 'block', type: 'controls_if' },
          {
            kind: 'block',
            type: 'controls_ifelse',
          },
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_negate' },
          { kind: 'block', type: 'logic_boolean' },
          { kind: 'block', type: 'logic_null' },
          { kind: 'block', type: 'logic_ternary' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Loops',
        name: Blockly.Msg['CAT_LOOPS'] || 'Loops',
        categorystyle: 'loop_category',
        cssConfig: { icon: 'cat-icon cat-icon-loops' },
        contents: [
          { kind: 'block', type: 'xrp_forever' },
          { kind: 'sep', gap: '16' },
          {
            kind: 'block',
            type: 'controls_repeat_ext',
            inputs: {
              TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            },
          },
          { kind: 'block', type: 'controls_whileUntil' },
          {
            kind: 'block',
            type: 'controls_for',
            fields: { VAR: 'i' },
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
              BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            },
          },
          { kind: 'block', type: 'controls_forEach' },
          { kind: 'block', type: 'controls_flow_statements' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Math',
        name: Blockly.Msg['CAT_MATH'] || 'Math',
        categorystyle: 'math_category',
        cssConfig: { icon: 'cat-icon cat-icon-math' },
        contents: [
          { kind: 'block', type: 'math_number', fields: { NUM: 0 } },
          { kind: 'block', type: 'math_arithmetic' },
          { kind: 'block', type: 'math_single' },
          { kind: 'block', type: 'math_trig' },
          { kind: 'block', type: 'math_constant' },
          { kind: 'block', type: 'math_number_property' },
          { kind: 'block', type: 'math_round' },
          { kind: 'block', type: 'math_modulo' },
          { kind: 'block', type: 'math_constrain' },
          {
            kind: 'block',
            type: 'math_random_int',
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            },
          },
          { kind: 'block', type: 'math_random_float' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Text',
        name: Blockly.Msg['CAT_TEXT'] || 'Text',
        categorystyle: 'text_category',
        cssConfig: { icon: 'cat-icon cat-icon-text' },
        contents: [
          { kind: 'block', type: 'text' },
          { kind: 'block', type: 'text_join' },
          { kind: 'block', type: 'text_append' },
          { kind: 'block', type: 'text_length' },
          { kind: 'block', type: 'text_isEmpty' },
          { kind: 'block', type: 'text_indexOf' },
          { kind: 'block', type: 'text_charAt' },
        ],
      },

      {
        kind: 'category',
        categoryKey: 'Variables',
        name: Blockly.Msg['CAT_VARIABLES'] || 'Variables',
        categorystyle: 'variable_category',
        cssConfig: { icon: 'cat-icon cat-icon-variables' },
        custom: 'VARIABLE',
      },

      {
        kind: 'category',
        categoryKey: 'Functions',
        name: Blockly.Msg['CAT_FUNCTIONS'] || 'Functions',
        categorystyle: 'procedure_category',
        cssConfig: { icon: 'cat-icon cat-icon-functions' },
        custom: 'PROCEDURE',
      },
    ],
  };

  // Pinned favourites go at the very top, above Drive, so they are always
  // the fastest category to reach. Always present, even with an empty
  // flyout, so its position in the toolbox never shifts around.
  if (pinnedCategory) toolbox.contents.unshift(pinnedCategory);

  return toolbox;
}

/**
 * Returns a filtered toolbox definition for a lesson.
 *
 * @param {Object|null} toolboxFilter - The `toolbox` field from a lesson JSON.
 *   - null / undefined / {} → return full toolbox (no filtering)
 *   - { "Drive": [], "Events": [] } → only those categories, all their blocks
 *   - { "Drive": ["xrp_drive_straight"] } → only that category with only that block
 * @returns {Object} Blockly toolbox definition
 */
export function getFilteredToolbox(toolboxFilter, libraryCategories = [], pinnedCategory = null) {
  const full = getToolboxDefinition(libraryCategories, pinnedCategory);

  // No filter — return the full toolbox
  if (!toolboxFilter || Object.keys(toolboxFilter).length === 0) {
    return full;
  }

  const filteredContents = [];

  for (const item of full.contents) {
    // Pass through separators between categories
    if (item.kind === 'sep' && !item.categoryKey) {
      filteredContents.push(item);
      continue;
    }

    // Skip categories not mentioned in the filter
    if (item.kind === 'category') {
      const key = item.categoryKey;
      if (!key || !(key in toolboxFilter)) continue;

      const allowedBlocks = toolboxFilter[key];

      // Empty array → include all blocks in this category as-is
      if (!allowedBlocks || allowedBlocks.length === 0) {
        filteredContents.push(item);
        continue;
      }

      // Non-empty array → filter the category's contents to matching block types
      // Keep `sep` items that appear between included blocks
      const filteredCategoryContents = [];
      let lastWasBlock = false;
      let pendingSep = null;

      for (const entry of (item.contents || [])) {
        if (entry.kind === 'sep') {
          // Hold the sep — only emit it if a block follows
          pendingSep = entry;
        } else if (entry.kind === 'block' && allowedBlocks.includes(entry.type)) {
          if (pendingSep && lastWasBlock) {
            filteredCategoryContents.push(pendingSep);
          }
          filteredCategoryContents.push(entry);
          pendingSep = null;
          lastWasBlock = true;
        }
      }

      if (filteredCategoryContents.length > 0) {
        filteredContents.push({ ...item, contents: filteredCategoryContents });
      }
    }
  }

  return { kind: 'categoryToolbox', contents: filteredContents };
}
