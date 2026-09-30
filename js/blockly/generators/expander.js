/**
 * XRP Blocks — Python generators for the PCF8575 I/O expander blocks.
 *
 * All blocks share one `expander` object. Any expander block creates it
 * lazily, so a program still works if the learner forgets the setup block;
 * the setup block simply pins the address down.
 */

const IMPORT_KEY = 'import_pcf8575';
const INSTANCE_KEY = 'pcf8575_instance';

function ensureExpander(generator, address) {
  generator.definitions_[IMPORT_KEY] = 'from PCF8575 import PCF8575, INPUT, OUTPUT';
  if (address) {
    generator.definitions_[INSTANCE_KEY] = `expander = PCF8575(address=${address})`;
  } else if (!generator.definitions_[INSTANCE_KEY]) {
    generator.definitions_[INSTANCE_KEY] = 'expander = PCF8575()';
  }
}

export function registerExpanderGenerators(pythonModule) {
  const python = pythonModule.pythonGenerator;
  const Order = pythonModule.Order;

  python.forBlock['xrp_pcf_setup'] = function (block, generator) {
    ensureExpander(generator, block.getFieldValue('ADDR'));
    return '';
  };

  python.forBlock['xrp_pcf_pin_mode'] = function (block, generator) {
    ensureExpander(generator);
    const pin = block.getFieldValue('PIN');
    const mode = block.getFieldValue('MODE'); // 'OUTPUT' or 'INPUT'
    return `expander.pin_mode(${pin}, ${mode})\n`;
  };

  python.forBlock['xrp_pcf_led'] = function (block, generator) {
    ensureExpander(generator);
    const pin = block.getFieldValue('PIN');
    const on = block.getFieldValue('STATE') === 'ON' ? 'True' : 'False';
    return `expander.led(${pin}, ${on})\n`;
  };

  python.forBlock['xrp_pcf_all_off'] = function (block, generator) {
    ensureExpander(generator);
    return 'expander.all_off()\n';
  };

  python.forBlock['xrp_pcf_button'] = function (block, generator) {
    ensureExpander(generator);
    const pin = block.getFieldValue('PIN');
    return [`expander.button(${pin})`, Order.FUNCTION_CALL];
  };

  python.forBlock['xrp_pcf_set_pin'] = function (block, generator) {
    ensureExpander(generator);
    const pin = block.getFieldValue('PIN');
    const level = block.getFieldValue('LEVEL') === 'HIGH' ? 'True' : 'False';
    return `expander.set_pin(${pin}, ${level})\n`;
  };

  python.forBlock['xrp_pcf_read_pin'] = function (block, generator) {
    ensureExpander(generator);
    const pin = block.getFieldValue('PIN');
    return [`expander.get_pin(${pin})`, Order.FUNCTION_CALL];
  };
}
