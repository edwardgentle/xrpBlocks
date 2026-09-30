/**
 * XRP Blocks — Python generators for Motor blocks
 *
 * XRPLib's set_effort() does NOT clamp its argument: anything outside -1 to 1
 * is passed straight through to the motor driver. Effort blocks therefore go
 * through a small clamping helper. Speed is in rpm, and set_speed(0) hands
 * control back to effort rather than braking.
 */

export function registerMotorGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  // Map dropdown values to Python variable names
  const MOTOR_MAP = {
    LEFT: 'left_motor',
    RIGHT: 'right_motor',
    MOTOR3: 'motor_three',
    MOTOR4: 'motor_four',
  };

  function getMotorVar(block) {
    const motor = block.getFieldValue('MOTOR');
    return MOTOR_MAP[motor] || 'left_motor';
  }

  // Shared helper: keep effort inside the -1 to 1 the motor driver expects.
  function provideSetEffort(generator) {
    return generator.provideFunction_('xrp_motor_effort', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(motor, effort):',
      '  # XRPLib does not check the range. -1 is full reverse, 1 is full',
      '  # forward, 0 is stop.',
      '  if effort < -1:',
      '    effort = -1',
      '  elif effort > 1:',
      '    effort = 1',
      '  motor.set_effort(effort)',
    ]);
  }

  python.forBlock['xrp_motor_set_effort'] = function (block, generator) {
    const setEffort = provideSetEffort(generator);
    const effort = generator.valueToCode(block, 'EFFORT', Order.NONE) || '0';
    return `${setEffort}(${getMotorVar(block)}, ${effort})\n`;
  };

  python.forBlock['xrp_motor_set_effort_percent'] = function (block, generator) {
    const setEffort = provideSetEffort(generator);
    const percent = generator.valueToCode(block, 'PERCENT', Order.NONE) || '0';
    return `${setEffort}(${getMotorVar(block)}, (${percent}) / 100)\n`;
  };

  python.forBlock['xrp_motor_speed_off'] = function (block) {
    return `${getMotorVar(block)}.set_speed(None)\n`;
  };

  python.forBlock['xrp_motor_get_counts'] = function (block) {
    return [`${getMotorVar(block)}.get_position_counts()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_motor_set_speed'] = function (block, generator) {
    const motor = getMotorVar(block);
    const speed = generator.valueToCode(block, 'SPEED', Order.NONE) || '0';
    return `${motor}.set_speed(${speed})\n`;
  };

  python.forBlock['xrp_motor_get_position'] = function (block) {
    const motor = getMotorVar(block);
    return [`${motor}.get_position()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_motor_get_speed'] = function (block) {
    const motor = getMotorVar(block);
    return [`${motor}.get_speed()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_motor_reset_encoder'] = function (block) {
    const motor = getMotorVar(block);
    return `${motor}.reset_encoder_position()\n`;
  };

  python.forBlock['xrp_motor_brake'] = function (block) {
    const motor = getMotorVar(block);
    return `${motor}.brake()\n`;
  };

  // Change 46. XRPLib already sets flip_dir on some motors (the left one on
  // the standard XRP), so "reversed" means the opposite of the motor's own
  // starting direction, remembered the first time. The encoder reading
  // follows flip_dir in XRPLib, so speed control and positions stay correct.
  python.forBlock['xrp_motor_reverse'] = function (block, generator) {
    const reverse = generator.provideFunction_('xrp_motor_reverse', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(motor, reversed_):',
      '  # Remember how XRPLib set the motor up, then flip relative to that.',
      "  if not hasattr(motor, '_xrp_dir0'):",
      '    motor._xrp_dir0 = motor._motor.flip_dir',
      '  motor.set_effort(0)',
      '  motor._motor.flip_dir = motor._xrp_dir0 != reversed_',
    ]);
    const state = block.getFieldValue('STATE') === 'OFF' ? 'False' : 'True';
    return `${reverse}(${getMotorVar(block)}, ${state})\n`;
  };

  python.forBlock['xrp_motor_coast'] = function (block) {
    const motor = getMotorVar(block);
    return `${motor}.coast()\n`;
  };
}
