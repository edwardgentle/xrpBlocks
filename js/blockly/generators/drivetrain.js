/**
 * XRP Blocks — Python generators for Drivetrain blocks
 *
 * EFFORT IS IN PERCENT EVERYWHERE
 * -------------------------------
 * XRPLib takes effort as a fraction from -1 to 1, and does no range checking:
 * anything larger goes straight to the motor driver. The blocks used to be
 * inconsistent about this — "drive straight with 50% effort" alongside "set
 * drive effort 0.5" — so a student met two conventions in one category. Every
 * effort block now says percent, and one helper converts and clamps.
 *
 * Units, from the XRPLib API:
 *   straight(distance_cm), turn(degrees), set_speed(cm/s),
 *   get_left_encoder_position() -> cm
 */

export function registerDrivetrainGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  /**
   * Percent to XRPLib's -1..1, clamped. `lowest` is 0 for the blocks where a
   * negative effort makes no sense, such as the max_effort of a measured drive.
   */
  function provideEffort(generator) {
    return generator.provideFunction_('xrp_effort', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(percent, lowest=-1):',
      '  # The blocks are in percent. XRPLib wants -1 to 1 and does not check',
      '  # the range, so without this a slip of the keyboard would go straight',
      '  # to the motor driver.',
      '  effort = percent / 100',
      '  if effort < lowest:',
      '    effort = lowest',
      '  elif effort > 1:',
      '    effort = 1',
      '  return effort',
    ]);
  }

  /**
   * Drive straight with a gentle start.
   *
   * XRPLib's straight() asks for full effort on its first reading (its
   * distance PID has kp 0.1 per cm and a 30% minimum), so the robot lurches
   * off. We keep that PID exactly as XRPLib builds it for the XRP, so the
   * stop at the end behaves as before, and wrap it with a power limit:
   *   - Until the encoders show 0.2 cm of movement the limit rises from 15%
   *     by 1.0 per second; the level where it moved is this floor's grip.
   *   - From there the limit climbs in a straight line with distance, from
   *     the grip level to the chosen effort over the first 5 cm (medium;
   *     slow 10 cm, fast 2.9 cm, from the acceleration block).
   * Heading correction: XRPLib's values, capped at 80% of the drive power
   * (XrpHold below), so neither wheel is driven backwards.
   * Also: effort 15-100% (0% used to wait for ever), a generous timeout,
   * and float() so list items and text numbers work.
   * Simulated: 15% at the start, full effort at 5 cm, end accuracy the same
   * as XRPLib's own. Not yet confirmed on the robot. The PID values are
   * XRPLib's standard-XRP ones, not the NanoXRP ones.
   */
  /**
   * Saved movement reports (turns and drives): the first-turn trace flag,
   * and at program start printing the last runs from turnlog.txt.
   */
  function provideLog(generator) {
    // At the start of the program: print the reports saved by the last runs
    // (for example one run without the USB cable) and keep the last three.
    generator.definitions_['xrp_trace_done'] = 'xrp_trace_done = [False]';
    generator.definitions_['xrp_turn_log'] = [
      '# Saved turn and drive reports: printed at the start of every program; the',
      '# last three runs are kept. Plugging in the USB cable restarts the',
      '# saved program, so nothing is cleared that has not had a chance to be read.',
      'try:',
      "  with open('turnlog.txt') as f:",
      '    saved = f.read()',
      'except OSError:',
      "  saved = ''",
      'if saved:',
      "  print('--- saved turn and drive reports, most recent run last ---')",
      "  print(saved, end='')",
      "  print('---')",
      "runs = [r for r in saved.split('=== run ===\\n') if r.strip()]",
      'try:',
      "  with open('turnlog.txt', 'w') as f:",
      '    for r in runs[-2:]:',
      "      f.write('=== run ===\\n' + r)",
      "    f.write('=== run ===\\n')",
      'except OSError:',
      '  pass',
    ].join('\n');
  }

  function provideStraight(generator) {
    generator.definitions_['import_time'] = 'import time';
    generator.definitions_['xrp_odo'] = 'xrp_odo = [None]  # where drive straight expects the robot to be';
    generator.definitions_['xrp_head'] = 'xrp_head = [None]  # the heading drive straight should hold';
    generator.definitions_['xrp_side'] = 'xrp_side = [0]  # cm left (+) of the line drive straight follows';
    generator.definitions_['import_math'] = 'import math';
    provideLog(generator);
    provideAccel(generator);
    generator.definitions_['import_pid'] = 'from XRPLib.pid import PID';
    const ramp = generator.provideFunction_('XrpStraight', [
      'class ' + generator.FUNCTION_NAME_PLACEHOLDER_ + ':',
      '  def __init__(self, effort):',
      '    self.pid = PID(kp=0.1, ki=0.04, kd=0.04, min_output=0.3, max_output=effort,',
      '                   max_integral=10, tolerance=0.25, tolerance_count=3)',
      '    self.effort = effort',
      '    # Acceleration setting: builds up over 5 / setting cm (medium 10 cm).',
      '    self.ramp_cm = 5 / xrp_accel[0]',
      '    self.rise = 1.0 * xrp_accel[0]  # start-up power per second',
      '    self.start = None',
      '    self.grip = None',
      '    self.error = 0',
      '    self.out = 0',
      '    self.out_cap = 0',
      '    self.along = 0',
      '',
      '  def update(self, error):',
      '    out = self.pid.update(error)',
      '    now = time.ticks_ms()',
      '    self.error = error',
      '    if self.start is None:',
      '      self.start = error',
      '      self.t0 = now',
      '    self.along = self.start - error  # signed cm travelled in this drive',
      '    travelled = abs(self.along)',
      '    if self.grip is None:',
      '      # Not moving yet: raise the limit until the wheels turn. 0.5 cm, so',
      '      # a twitch taking up gear slack does not count as moving.',
      '      cap = min(self.effort, 0.15 + self.rise * time.ticks_diff(now, self.t0) / 1000)',
      '      if travelled > 0.5:',
      '        self.grip = cap',
      '        self.mark = now',
      '        self.last_cm = travelled',
      '    if self.grip is not None:',
      '      # Stalled (less than 1 mm in 0.1 s while held back by the limit)?',
      '      # Raise the starting level, so a slow build-up can never get stuck.',
      '      if time.ticks_diff(now, self.mark) >= 100:',
      '        if travelled - self.last_cm < 0.1 and abs(out) >= self.out_cap:',
      '          self.grip = min(self.effort, self.grip + 0.02)',
      '        self.mark = now',
      '        self.last_cm = travelled',
      '      # Moving: build up to full effort over the first ramp_cm.',
      '      cap = self.grip + (self.effort - self.grip) * min(1, travelled / self.ramp_cm)',
      '    self.out_cap = cap',
      '    self.out = max(-cap, min(cap, out))',
      '    return self.out',
      '',
      '  def is_done(self):',
      '    return self.pid.is_done()',
    ]);
    // XRPLib's heading hold (same kp/kd as XRPLib), but the steering can never
    // be more than 80% of the drive power, so both wheels keep turning
    // forwards. Without this, at the gentle 15% start a heading error of only
    // 2 degrees (e.g. still settling after a turn) cancelled the drive power
    // and a larger one ran one wheel backwards (seen on the robot).
    const hold = generator.provideFunction_('XrpHold', [
      'class ' + generator.FUNCTION_NAME_PLACEHOLDER_ + ':',
      '  def __init__(self, drive, offset=0, side=0, backwards=False):',
      '    self.pid = PID(kp=0.075, kd=0.001)',
      '    self.drive = drive',
      '    # XRPLib holds the heading the drive started at; offset shifts that to',
      '    # the heading the robot should have (see xrp_straight).',
      '    self.offset = offset',
      '    # Keeping to the line: side = cm the robot is left (+) of the line it',
      '    # should be on, worked out from the gyro and the encoders as it drives.',
      '    self.side = side',
      '    self.last = 0',
      '    self.backwards = backwards',
      '',
      '  def update(self, error):',
      '    off = error + self.offset  # degrees to turn to face the right way',
      '    along = self.drive.along',
      '    self.side -= math.sin(math.radians(off)) * (along - self.last)',
      '    self.last = along',
      '    # Aim back towards the line: 3 degrees per cm, at most 8 degrees.',
      '    # Backwards, the robot has to point the other way to get back.',
      '    aim = max(-8, min(8, 3 * self.side))',
      '    off += aim if self.backwards else -aim',
      '    limit = 0.8 * abs(self.drive.out)',
      '    return max(-limit, min(limit, self.pid.update(off)))',
      '',
      '  def is_done(self):',
      '    return True',
    ]);
    return generator.provideFunction_('xrp_straight', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(distance, percent=50):',
      '  distance = float(distance)',
      '  effort = max(15, min(100, float(percent))) / 100',
      '  # Plan from where the robot should be, not from where the last drive',
      '  # happened to stop (the encoders include any coasting), so small stop',
      '  # errors do not add up over many drives. Only a small leftover (under',
      '  # 2 cm) is carried over; after a turn or any other movement it starts',
      '  # afresh, so it never undoes a movement that was asked for.',
      '  pos = (drivetrain.get_left_encoder_position() + drivetrain.get_right_encoder_position()) / 2',
      '  planned = xrp_odo[0]',
      '  if planned is None or abs(pos - planned) > 2:',
      '    planned = pos',
      '  goal = planned + distance',
      '  move = goal - pos',
      '  # The same for the heading: hold the heading the robot should have (the',
      '  # last turn\'s target, or the last drive\'s), not whatever it has now,',
      '  # so small heading errors do not add up either. Starts afresh if more',
      '  # than 10 degrees off (something else turned the robot).',
      '  imu = drivetrain.imu',
      '  yaw = imu.get_yaw() if imu else None',
      '  heading = xrp_head[0]',
      '  if heading is None or yaw is None or abs(heading - yaw) > 10:',
      '    heading = yaw',
      '  offset = (heading - yaw) if yaw is not None else 0',
      '  side = xrp_side[0] if heading == xrp_head[0] and abs(xrp_side[0]) < 3 else 0',
      '  drive = ' + ramp + '(effort)',
      '  keeper = ' + hold + '(drive, offset if yaw is not None else 0, side, move < 0)',
      '  seconds = 3 + abs(move) / (15 * effort)',
      '  done = drivetrain.straight(move, max_effort=effort, timeout=seconds,',
      '                             main_controller=drive, secondary_controller=keeper)',
      '  xrp_odo[0] = goal',
      '  xrp_head[0] = heading',
      '  xrp_side[0] = keeper.side if yaw is not None else 0',
      '  if not done:',
      "    print('drive ' + str(distance) + ' cm: gave up ' + str(round(drive.error, 1)) + ' cm short')",
      "  line = 'drive %d cm: drove %.1f cm (%+.1f carried over), moved at %d%% power, %.1f cm off%s' % (",
      "      round(distance), move, move - distance, round((drive.grip or 0) * 100), drive.error, '' if done else ', GAVE UP (time limit)')",
      '  print(line)',
      '  try:',
      "    with open('turnlog.txt', 'a') as f:",
      "      f.write(line + '\\n')",
      '  except OSError:',
      '    pass',
      '  return done',
    ]);
  }

  python.forBlock['xrp_drive_straight'] = function (block, generator) {
    const straight = provideStraight(generator);
    const distance = generator.valueToCode(block, 'DISTANCE', Order.NONE) || '0';
    return `${straight}(${distance})\n`;
  };

  python.forBlock['xrp_drive_straight_effort'] = function (block, generator) {
    const straight = provideStraight(generator);
    const distance = generator.valueToCode(block, 'DISTANCE', Order.NONE) || '0';
    const effort = generator.valueToCode(block, 'EFFORT', Order.NONE) || '50';
    return `${straight}(${distance}, ${effort})\n`;
  };

  /**
   * A gyro turn that slows down near the target and never stalls short of it.
   *
   * XRPLib's turn() already pivots on the spot: a second controller keeps the
   * left and right encoder totals equal and opposite, so the robot does not
   * creep forward while it turns. It also measures each turn from the current
   * yaw, so nothing needs resetting before a turn. We keep all of that and
   * hand it our own heading controller (any object with update(error) and
   * is_done() will do):
   *
   *   - Proportional slow-down over the last `slow_zone` degrees (half the
   *     turn, 10 to 20 degrees), plus a braking term against the turning
   *     speed (kd = 0.25 x kp) that can briefly reverse the wheels, which is
   *     what stops momentum carrying it past the angle.
   *   - A gentle start: power builds up at 1.2 per second (full 50% in
   *     about 0.35 s) instead of jumping straight to the chosen effort.
   *   - A learned minimum power. The power at which the gyro first sees the
   *     robot turning is the grip of this floor; 1.4 x that becomes the
   *     minimum for the rest of the turn, so the slow final approach never
   *     drops below what it takes to keep moving. As a backup, every 0.05 s
   *     without 0.15 degrees of progress adds 3%. A fixed minimum cannot work
   *     on every floor: too low stalls (seen on the robot at 10% and 20%),
   *     too high overshoots and swings.
   *   - Inside 0.5 degrees the power is cut; done after 3 readings in a row.
   *   - Afterwards it settles for 0.2 s, rereads the gyro and nudges (up to
   *     20 times) if still more than 0.5 degrees off, e.g. from coasting.
   *   - Every angle is scaled by the turn calibration (default 100%).
   *   - Spin-up limit, measured by the gyro: if the robot speeds up faster
   *     than 400 deg/s per second (x the acceleration setting) the power is
   *     eased back instead of raised. Added after a robot report of 1274.
   *   - Acceleration limit against wheel slip: power rises at 1.2 per second
   *     x the acceleration setting (slow 0.5, medium 1, fast 1.75) and falls or reverses
   *     at 4 x that. In sim the braking limit also cut nudges by about half.
   *   - Effort 15-100%, a generous timeout, and float() so list items and
   *     text numbers work. If the time runs out it prints how far off it is.
   *
   * Tuned in a simple simulation (motor speed 25-60 cm/s, lag, start-up
   * friction 5-35% power): worst final error about 1 degree, no stalls.
   * Not yet confirmed on the robot.
   */
  function provideTurn(generator) {
    generator.definitions_['import_time'] = 'import time';
    generator.definitions_['import_pid'] = 'from XRPLib.pid import PID';
    provideTurnCalibration(generator);
    provideAccel(generator);
    provideLog(generator);
    const turner = generator.provideFunction_('XrpTurner', [
      'class ' + generator.FUNCTION_NAME_PLACEHOLDER_ + ':',
      '  def __init__(self, effort, slow_zone, tol=0.5):',
      '    self.effort = effort',
      '    self.tol = tol',
      '    self.accel = 1.2 * xrp_accel[0]  # power per second (medium 1.2)',
      '    # Largest spin-up allowed, measured by the gyro (deg/s per second).',
      '    self.max_spinup = 400 * xrp_accel[0]',
      '    self.spinup = 0',
      '    self.kp = effort / slow_zone',
      '    self.kd = self.kp * 0.25',
      '    self.floor = min(0.15, effort)',
      '    self.prev = None',
      '    self.times = 0',
      '    self.error = 0',
      '    self.power = 0',
      '    self.moving = False',
      '    # For the report printed after each turn.',
      '    self.t0 = None',
      '    self.move_ms = 0',
      '    self.grip = 0',
      '    self.peak_power = 0',
      '    self.spin = 0',
      '    self.peak_spin = 0',
      '    self.peak_accel = 0',
      '    self.reversals = 0',
      '    self.trace = []  # first 0.8 s: ms, power %, turning speed',
      '',
      '  def update(self, error):',
      '    now = time.ticks_ms()',
      '    if self.prev is None:',
      '      self.prev = error',
      '      self.last = now',
      '      self.mark = now',
      '      self.best = abs(error)',
      '      self.start = error',
      '      self.t0 = now',
      '    dt = max(time.ticks_diff(now, self.last), 1) / 1000',
      '    rate = (error - self.prev) / dt',
      '    spin = self.spin + 0.3 * (abs(rate) - self.spin)  # smoothed deg/s',
      '    if self.moving:',
      '      self.spinup += 0.3 * ((spin - self.spin) / dt - self.spinup)',
      '      self.peak_accel = max(self.peak_accel, abs(spin - self.spin) / dt)',
      '    self.spin = spin',
      '    self.peak_spin = max(self.peak_spin, spin)',
      '    self.prev = error',
      '    self.last = now',
      '    self.error = error',
      '    if abs(error) < self.tol:',
      '      self.times += 1',
      '    else:',
      '      self.times = 0',
      '    # First movement: remember the power it took as the minimum.',
      '    if not self.moving and abs(self.start - error) > 0.5:',
      '      self.moving = True',
      '      self.move_ms = time.ticks_diff(now, self.t0)',
      '      self.grip = abs(self.power)',
      '      self.floor = min(self.effort, max(self.floor, abs(self.power) * 1.4))',
      '    # Stalled after that? Nudge the minimum up.',
      '    if time.ticks_diff(now, self.mark) >= 50:',
      '      if self.moving and abs(error) > self.tol and self.best - abs(error) < 0.15:',
      '        self.floor = min(self.effort, self.floor + 0.03)',
      '      self.best = abs(error)',
      '      self.mark = now',
      '    if abs(error) < self.tol:',
      '      want = 0',
      '    else:',
      '      out = self.kp * error + self.kd * rate',
      '      if out * error < 0:',
      '        # Braking against the spin: reverse power, never above the effort.',
      '        want = max(-self.effort, min(self.effort, out))',
      '      else:',
      '        want = abs(out)',
      '        if not self.moving:',
      '          # Not moving yet: keep building up (at the acceleration rate)',
      '          # until it does, however small the turn.',
      '          want = self.effort',
      '        if self.spin < 15:',
      '          # Only push with the minimum power once it has slowed right down.',
      '          want = max(self.floor, want)',
      '        want = min(self.effort, want)',
      '        want = want if error > 0 else -want',
      '    # Acceleration limit, so the wheels do not slip: speeding up at',
      '    # accel per second, slowing down or reversing at 4 x accel.',
      '    p = self.power',
      '    up = self.accel * dt',
      '    if want * p >= 0 and abs(want) > abs(p):',
      '      if self.moving and self.spin >= 15 and self.spinup > self.max_spinup:',
      '        # Spinning up faster than the acceleration setting allows (measured',
      '        # by the gyro): ease the power back, but not below 70% of the grip.',
      '        size = max(self.grip * 0.7, abs(p) - 2 * up)',
      '      else:',
      '        size = min(abs(want), max(abs(p), 0.1) + up)',
      '      want = size if want > 0 else -size',
      '    else:',
      '      want = max(p - 4 * up, min(p + 4 * up, want))',
      '    if len(self.trace) < 80 and time.ticks_diff(now, self.t0) <= 800:',
      "      self.trace.append('%d:%d:%d' % (time.ticks_diff(now, self.t0), round(want * 100), round(self.spin)))",
      '    if want * self.power < 0:',
      '      self.reversals += 1',
      '    self.power = want',
      '    self.peak_power = max(self.peak_power, abs(want))',
      '    return want',
      '',
      '  def is_done(self):',
      '    return self.times >= 3',
    ]);
    // XRPLib's pivot keeper (kp 0.25 on the left+right encoder sum), but its
    // correction, which comes off both wheels, is capped at half the turning
    // power. Uncapped, at the low power of the final approach it could starve
    // one wheel, so the robot finished the turn slowly on the other one.
    const pivot = generator.provideFunction_('XrpPivot', [
      'class ' + generator.FUNCTION_NAME_PLACEHOLDER_ + ':',
      '  def __init__(self, turner):',
      '    self.pid = PID(kp=0.25)',
      '    self.turner = turner',
      '',
      '  def update(self, error):',
      '    limit = 0.5 * max(abs(self.turner.power), self.turner.floor)',
      '    return max(-limit, min(limit, self.pid.update(error)))',
      '',
      '  def is_done(self):',
      '    return True',
    ]);
    return generator.provideFunction_('xrp_turn', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(degrees, percent=50):',
      '  degrees = float(degrees) * xrp_turn_cal[0]',
      '  try:',
      '    xrp_odo[0] = None  # a turn: the next drive straight starts afresh',
      '  except NameError:',
      '    pass',
      '  effort = max(15, min(100, float(percent))) / 100',
      '  imu = drivetrain.imu',
      '  goal = imu.get_yaw() + degrees if imu else None',
      '  heading = ' + turner + '(effort, max(10, min(20, abs(degrees) / 2)))',
      '  seconds = 2 + abs(degrees) / (60 * effort)',
      '  done = drivetrain.turn(degrees, max_effort=effort, timeout=seconds,',
      '                         main_controller=heading, secondary_controller=' + pivot + '(heading))',
      '  if not done:',
      "    print('turn ' + str(degrees) + ': gave up ' + str(round(heading.error, 1)) + ' degrees short')",
      '  # Let it settle, then nudge up to 20 times if still more than 0.5 degrees off.',
      '  nudges = 0',
      '  before = None',
      '  for attempt in range(20):',
      '    if goal is None:',
      '      break',
      '    time.sleep(0.2)',
      '    left = goal - imu.get_yaw()',
      '    if abs(left) <= 0.5:',
      '      break',
      '    # Crossed over the target and either within 1 degree or no closer than',
      '    # before: the smallest step the robot can make is bigger than what is',
      '    # left, so stop rather than hunt back and forth.',
      '    if before is not None and left * before < 0 and (abs(left) < 1 or abs(left) > 0.8 * abs(before)):',
      '      break',
      '    before = left',
      '    nudges += 1',
      '    fix = ' + turner + '(min(effort, 0.5), 10)',
      '    fix.floor = min(fix.effort, heading.floor)  # start from the grip the turn learned',
      '    # Nudges are too small to slip, and need firm braking so they do not',
      '    # overshoot: at least medium acceleration whatever the setting.',
      '    fix.accel = max(fix.accel, 1.2)',
      '    fix.max_spinup = max(fix.max_spinup, 400)',
      '    drivetrain.turn(left, max_effort=min(effort, 0.5), timeout=2,',
      '                    main_controller=fix, secondary_controller=' + pivot + '(fix))',
      '  try:',
      '    xrp_head[0] = goal  # the next drive straight holds exactly this heading',
      '    xrp_side[0] = 0     # and starts a new line from here',
      '  except NameError:',
      '    pass',
      '  # One line per turn in the Console, to see how it went on this floor.',
      '  # Also saved on the robot, so a run without the cable can be read later.',
      '  h = heading',
      "  line = 'turn %d: moved after %d ms at %d%%, peak %d%% power, %d deg/s, spin-up %d deg/s2, %d reversals, %d nudges, %.1f off' % (",
      '        round(degrees), h.move_ms, round(h.grip * 100), round(h.peak_power * 100), h.peak_spin,',
      '        h.peak_accel, h.reversals, nudges, (goal - imu.get_yaw()) if imu else 0)',
      '  print(line)',
      '  try:',
      "    with open('turnlog.txt', 'a') as f:",
      "      f.write(line + '\\n')",
      '      if not xrp_trace_done[0]:',
      '        # The first turn of each run also records its start, every 10 ms,',
      '        # as time ms:power %:turning speed deg/s.',
      '        xrp_trace_done[0] = True',
      '        for i in range(0, len(h.trace), 10):',
      "          f.write('  trace ' + ' '.join(h.trace[i:i + 10]) + '\\n')",
      '  except OSError:',
      '    pass',
      '  return done',
    ]);
  }

  /**
   * Turn calibration, shared by every turn block. The gyro's idea of 90
   * degrees can differ slightly from the robot's real 90 degrees; this scales
   * every requested angle. Stored in a one-item list so the calibration block
   * works inside a function too (no `global` needed).
   */
  function provideTurnCalibration(generator) {
    generator.definitions_['xrp_turn_cal'] = 'xrp_turn_cal = [1.0]';
  }

  python.forBlock['xrp_drive_turn_calibrate'] = function (block, generator) {
    provideTurnCalibration(generator);
    const percent = generator.valueToCode(block, 'PERCENT', Order.NONE) || '100';
    return `xrp_turn_cal[0] = float(${percent}) / 100\n`;
  };

  /**
   * One acceleration setting for every movement that runs to a finish:
   * turn, drive straight, and the Mecanum library's moves and turns.
   * Extra slow 0.125, slow 0.25, medium 0.5, fast 1.0, extra fast 1.75.
   * Medium (0.5) is also what a program without the block uses. Extra slow
   * was confirmed on the robot as smooth and accurate for turns and drives.
   * Stored in a one-item list so the block works inside functions too.
   */
  function provideAccel(generator) {
    generator.definitions_['xrp_accel'] = 'xrp_accel = [0.5]';
  }

  python.forBlock['xrp_drive_accel'] = function (block, generator) {
    provideAccel(generator);
    const level = { '0.125': '0.125', '0.25': '0.25', '0.5': '0.5', '1.0': '1.0', '1.75': '1.75' }[block.getFieldValue('LEVEL')] || '0.5';
    // The Mecanum library, if the program uses it, has its own copy.
    return `xrp_accel[0] = ${level}\n` +
      'try:\n' +
      `  mecanum.accel = ${level}\n` +
      'except NameError:\n' +
      '  pass\n';
  };

  python.forBlock['xrp_drive_turn'] = function (block, generator) {
    const turn = provideTurn(generator);
    const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '0';
    return `${turn}(${angle})\n`;
  };

  python.forBlock['xrp_drive_turn_effort'] = function (block, generator) {
    const turn = provideTurn(generator);
    const angle = generator.valueToCode(block, 'ANGLE', Order.NONE) || '0';
    const effort = generator.valueToCode(block, 'EFFORT', Order.NONE) || '50';
    return `${turn}(${angle}, ${effort})\n`;
  };

  python.forBlock['xrp_drive_stop'] = function () {
    return 'drivetrain.stop()\n';
  };

  python.forBlock['xrp_drive_set_effort'] = function (block, generator) {
    const effortOf = provideEffort(generator);
    const left = generator.valueToCode(block, 'LEFT', Order.NONE) || '0';
    const right = generator.valueToCode(block, 'RIGHT', Order.NONE) || '0';
    return `drivetrain.set_effort(${effortOf}(${left}), ${effortOf}(${right}))\n`;
  };

  python.forBlock['xrp_drive_set_speed'] = function (block, generator) {
    // Speed is centimetres per second here, not rpm as it is on a single motor.
    const left = generator.valueToCode(block, 'LEFT', Order.NONE) || '0';
    const right = generator.valueToCode(block, 'RIGHT', Order.NONE) || '0';
    return `drivetrain.set_speed(${left}, ${right})\n`;
  };

  python.forBlock['xrp_drive_arcade'] = function (block, generator) {
    const effortOf = provideEffort(generator);
    const speed = generator.valueToCode(block, 'SPEED', Order.NONE) || '0';
    const turn = generator.valueToCode(block, 'TURN', Order.NONE) || '0';
    return `drivetrain.arcade(${effortOf}(${speed}), ${effortOf}(${turn}))\n`;
  };

  python.forBlock['xrp_drive_get_left_encoder'] = function () {
    return ['drivetrain.get_left_encoder_position()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_drive_get_right_encoder'] = function () {
    return ['drivetrain.get_right_encoder_position()', Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_drive_encoder'] = function (block) {
    const side = block.getFieldValue('SIDE') || 'left';
    return [`drivetrain.get_${side}_encoder_position()`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_drive_reset_encoders'] = function () {
    return 'drivetrain.reset_encoder_position()\n';
  };
}
