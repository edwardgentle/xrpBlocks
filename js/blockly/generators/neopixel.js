/**
 * XRP Blocks — Python generators for the NeoPixel strip blocks.
 *
 * All blocks share one `strip` object. Any block creates it lazily, so a
 * program still works if the learner forgets the setup block; the setup
 * block simply fixes the pin and the pixel count.
 */

const IMPORT_KEY = 'import_neopixelstrip';
const INSTANCE_KEY = 'neopixelstrip_instance';

function ensureStrip(generator, pin, count) {
  generator.definitions_[IMPORT_KEY] = 'from NeoPixelStrip import NeoPixelStrip, colour';
  if (pin !== undefined) {
    generator.definitions_[INSTANCE_KEY] =
      `strip = NeoPixelStrip(pin=${pin}, count=${count})`;
  } else if (!generator.definitions_[INSTANCE_KEY]) {
    generator.definitions_[INSTANCE_KEY] = 'strip = NeoPixelStrip()';
  }
}

export function registerNeoPixelGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  python.forBlock['xrp_np_setup'] = function (block, generator) {
    const count = generator.valueToCode(block, 'COUNT', Order.NONE) || '10';
    ensureStrip(generator, block.getFieldValue('PIN'), count);
    return '';
  };

  python.forBlock['xrp_np_brightness'] = function (block, generator) {
    ensureStrip(generator);
    const percent = generator.valueToCode(block, 'PERCENT', Order.NONE) || '30';
    return `strip.set_brightness(${percent})\n`;
  };

  python.forBlock['xrp_np_colour'] = function (block, generator) {
    ensureStrip(generator);
    const name = block.getFieldValue('NAME');
    return [`colour('${name}')`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_np_rgb'] = function (block, generator) {
    ensureStrip(generator);
    const r = generator.valueToCode(block, 'RED', Order.NONE) || '0';
    const g = generator.valueToCode(block, 'GREEN', Order.NONE) || '0';
    const b = generator.valueToCode(block, 'BLUE', Order.NONE) || '0';
    return [`(${r}, ${g}, ${b})`, Order.ATOMIC];
  };

  python.forBlock['xrp_np_set_pixel'] = function (block, generator) {
    ensureStrip(generator);
    const index = generator.valueToCode(block, 'INDEX', Order.NONE) || '0';
    const col = generator.valueToCode(block, 'COLOUR', Order.NONE) || "colour('off')";
    return `strip.set_pixel(${index}, ${col})\n`;
  };

  python.forBlock['xrp_np_fill'] = function (block, generator) {
    ensureStrip(generator);
    const col = generator.valueToCode(block, 'COLOUR', Order.NONE) || "colour('off')";
    return `strip.fill(${col})\n`;
  };

  python.forBlock['xrp_np_clear'] = function (block, generator) {
    ensureStrip(generator);
    return 'strip.clear()\n';
  };

  python.forBlock['xrp_np_rainbow'] = function (block, generator) {
    ensureStrip(generator);
    const offset = generator.valueToCode(block, 'OFFSET', Order.NONE) || '0';
    return `strip.rainbow(${offset})\n`;
  };

  python.forBlock['xrp_np_shift'] = function (block, generator) {
    ensureStrip(generator);
    const step = generator.valueToCode(block, 'STEP', Order.NONE) || '1';
    return `strip.shift(${step})\n`;
  };

  python.forBlock['xrp_np_show'] = function (block, generator) {
    ensureStrip(generator);
    return 'strip.show()\n';
  };

  python.forBlock['xrp_np_auto_show'] = function (block, generator) {
    ensureStrip(generator);
    return `strip.set_auto_show(${block.getFieldValue('MODE')})\n`;
  };

  python.forBlock['xrp_np_count'] = function (block, generator) {
    ensureStrip(generator);
    return ['strip.count', Order.MEMBER];
  };
}
