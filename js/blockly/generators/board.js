/**
 * XRP Blocks — Python generators for Board blocks
 */

export function registerBoardGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  python.forBlock['xrp_start'] = function () {
    // Must return a truthy string so Blockly traverses to the next connected block
    return '\n';
  };

  python.forBlock['xrp_led_on'] = function () {
    return 'board.led_on()\n';
  };

  python.forBlock['xrp_led_off'] = function () {
    return 'board.led_off()\n';
  };

  python.forBlock['xrp_led_blink'] = function (block, generator) {
    generator.definitions_['import_time'] = 'import time';
    // XRPLib's own board.led_blink() takes ONE argument, a frequency in Hz,
    // and starts a background timer. This block promises "blink N times,
    // waiting D seconds", so calling led_blink(N, D) raised a TypeError and
    // the program stopped. Blink it here instead and return when it is done.
    const blink = generator.provideFunction_('xrp_led_blink', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(times, delay):',
      '  for _ in range(int(times)):',
      '    board.led_on()',
      '    time.sleep(delay)',
      '    board.led_off()',
      '    time.sleep(delay)',
    ]);
    const count = generator.valueToCode(block, 'COUNT', Order.NONE) || '3';
    const delay = generator.valueToCode(block, 'DELAY', Order.NONE) || '0.5';
    return `${blink}(${count}, ${delay})\n`;
  };

  python.forBlock['xrp_rgb_led'] = function (block, generator) {
    const red = generator.valueToCode(block, 'RED', Order.NONE) || '0';
    const green = generator.valueToCode(block, 'GREEN', Order.NONE) || '0';
    const blue = generator.valueToCode(block, 'BLUE', Order.NONE) || '0';
    return `board.set_rgb_led(${red}, ${green}, ${blue})\n`;
  };

  python.forBlock['xrp_rgb_colour'] = function (block, generator) {
    // Match the NeoPixel library's named colours without requiring its driver.
    const colours = {
      red: [255, 0, 0], orange: [255, 80, 0], yellow: [255, 200, 0],
      green: [0, 255, 0], cyan: [0, 255, 255], blue: [0, 0, 255],
      purple: [128, 0, 255], magenta: [255, 0, 255], pink: [255, 80, 120],
      white: [255, 255, 255], off: [0, 0, 0],
    };
    const rgb = colours[block.getFieldValue('COLOUR')] || colours.off;
    const brightness = generator.valueToCode(block, 'BRIGHTNESS', Order.NONE) || '30';
    const setColour = generator.provideFunction_('xrp_rgb_colour', [
      'def ' + generator.FUNCTION_NAME_PLACEHOLDER_ + '(red, green, blue, brightness):',
      '  scale = max(0, min(100, brightness)) / 100',
      '  board.set_rgb_led(int(red * scale), int(green * scale), int(blue * scale))',
    ]);
    return `${setColour}(${rgb.join(', ')}, ${brightness})\n`;
  };

  python.forBlock['xrp_wait_seconds'] = function (block, generator) {
    const seconds = generator.valueToCode(block, 'SECONDS', Order.NONE) || '1';
    generator.definitions_['import_time'] = 'import time';
    // Wrapped in float(...): a very common source value here is a list item
    // (e.g. "wait item i of TEST seconds") and Scratch-style lists hold
    // whatever the user typed into the "add"/"insert" text shadow as a
    // plain string ('0.2', not 0.2) unless they swap in a Number block —
    // MicroPython's time.sleep() raises TypeError on a string and silently
    // kills the whole program before anything after it runs. float() is a
    // no-op on an already-numeric value and safely coerces a numeric string.
    return `time.sleep(float(${seconds}))\n`;
  };

  python.forBlock['xrp_print'] = function (block, generator) {
    const text = generator.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `print(${text})\n`;
  };
}
