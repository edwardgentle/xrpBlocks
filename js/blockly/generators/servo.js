/**
 * XRP Blocks — Python generators for Servo blocks
 *
 * THE BLOCKS ARE IN DEGREES, 0 TO 180. XRPLIB IS NOT.
 * ---------------------------------------------------
 * XRPLib's `set_angle(d)` is not really degrees at all: it converts straight to
 * a pulse width with `d * 10 + 500` microseconds, so its 0 to 200 covers the
 * full 500 to 2500 us travel of a hobby servo and 100 is the centre. Students
 * reach for a protractor, not a pulse width, so every block here takes plain
 * degrees and one helper does the conversion:
 *
 *     0 degrees   ->  500 us   (XRPLib   0)
 *     90 degrees  -> 1500 us   (XRPLib 100, the centre)
 *     180 degrees -> 2500 us   (XRPLib 200)
 *
 * XRPLib does no range checking, so a value outside that span drives the servo
 * past its stop. The helper clamps, and holds back a few degrees at each end so
 * a servo cannot be pushed into its own mechanical stop, where it buzzes, draws
 * current and gets hot. SAFE_LOW and SAFE_HIGH sit at the top of the generated
 * helper so a class with an unusual servo can widen or narrow them by hand.
 */

/** Degrees the blocks accept. */
const DEGREES_MIN = 0;
const DEGREES_MAX = 180;

/** Held back from each end so the servo never reaches its mechanical stop. */
const SAFE_LOW = 5;
const SAFE_HIGH = 175;

/** Degrees to XRPLib units: 180 degrees of travel over 200 units. */
const UNITS_PER_DEGREE = 10 / 9;

export function registerServoGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  const SERVO_MAP = {
    '1': 'servo_one',
    '2': 'servo_two',
    '3': 'servo_three',
    '4': 'servo_four',
  };

  function getServoVar(block) {
    return SERVO_MAP[block.getFieldValue('SERVO')] || 'servo_one';
  }

  /** The degrees-to-XRPLib helper, emitted once however many blocks use it. */
  function provideSetAngle(generator) {
    return generator.provideFunction_('xrp_servo_degrees', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(servo, degrees):',
      '  # The blocks are in degrees, 0 to 180. XRPLib\'s set_angle wants 0 to',
      '  # 200, which is really the pulse width: 0 = 500us, 200 = 2500us.',
      '  # A few degrees are held back at each end so the servo is never',
      '  # driven into its own stop. Widen these two if your servo can take it.',
      `  SAFE_LOW = ${SAFE_LOW}`,
      `  SAFE_HIGH = ${SAFE_HIGH}`,
      '  if degrees < SAFE_LOW:',
      '    degrees = SAFE_LOW',
      '  elif degrees > SAFE_HIGH:',
      '    degrees = SAFE_HIGH',
      '  servo.set_angle(degrees * 10 / 9)',
    ]);
  }

  python.forBlock['xrp_servo_set_angle'] = function (block, generator) {
    const setAngle = provideSetAngle(generator);
    const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '90';
    return `${setAngle}(${getServoVar(block)}, ${angle})\n`;
  };

  python.forBlock['xrp_servo_centre'] = function (block, generator) {
    const setAngle = provideSetAngle(generator);
    // 90 degrees is the middle of 0 to 180, and lands on XRPLib's 100.
    return `${setAngle}(${getServoVar(block)}, 90)\n`;
  };

  python.forBlock['xrp_servo_speed'] = function (block, generator) {
    const setAngle = provideSetAngle(generator);
    const speed = generator.valueToCode(block, 'SPEED', Order.MULTIPLICATIVE) || '0';
    // A continuous rotation servo sits still at the centre pulse and runs
    // faster the further the pulse moves from it, so -100..100 percent maps
    // onto 0..180 degrees around the 90 degree centre.
    return `${setAngle}(${getServoVar(block)}, 90 + (${speed}) * 0.9)\n`;
  };

  python.forBlock['xrp_servo_sweep'] = function (block, generator) {
    const setAngle = provideSetAngle(generator);
    generator.definitions_['import_time'] = 'import time';
    const sweep = generator.provideFunction_('xrp_servo_sweep', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(servo, start, end, seconds):',
      '  # 50 steps a second is smooth to the eye and matches the servo\'s own',
      '  # 50 Hz update rate, so asking for more would not move it any sooner.',
      '  steps = int(seconds * 50)',
      '  if steps < 1:',
      '    steps = 1',
      '  for i in range(steps + 1):',
      '    ' + setAngle + '(servo, start + (end - start) * i / steps)',
      '    time.sleep(seconds / steps)',
    ]);
    const from = generator.valueToCode(block, 'FROM', Order.NONE) || String(DEGREES_MIN);
    const to = generator.valueToCode(block, 'TO', Order.NONE) || String(DEGREES_MAX);
    const seconds = generator.valueToCode(block, 'SECONDS', Order.NONE) || '1';
    return `${sweep}(${getServoVar(block)}, ${from}, ${to}, ${seconds})\n`;
  };

  python.forBlock['xrp_servo_free'] = function (block) {
    return `${getServoVar(block)}.free()\n`;
  };
}

export const SERVO_LIMITS = { DEGREES_MIN, DEGREES_MAX, SAFE_LOW, SAFE_HIGH, UNITS_PER_DEGREE };
