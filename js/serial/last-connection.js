const KEY = 'xrp_blocks_last_connection';
let lastDevice = null;
let lastSettings = null;

export function rememberConnection(mode, device) {
  lastDevice = device;
  lastSettings = mode === 'usb'
    ? { mode, info: device.getInfo() }
    : { mode, id: device.id };
  try { localStorage.setItem(KEY, JSON.stringify(lastSettings)); } catch { /* Session only. */ }
}

export async function getLastConnection() {
  let settings = lastSettings;
  if (!settings) {
    try { settings = JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }
  if (!settings) return null;
  if (settings.mode === 'usb' && navigator.serial?.getPorts) {
    const ports = await navigator.serial.getPorts();
    if (lastDevice && ports.includes(lastDevice)) return { mode: 'usb', device: lastDevice };
    // Serial exposes product IDs, not a stable per-device ID. Never guess when
    // multiple authorised ports match (e.g. two identical classroom robots).
    if (!settings.info || settings.info.usbVendorId === undefined) return null;
    const matches = ports.filter(port => {
      const info = port.getInfo();
      return info.usbVendorId === settings.info.usbVendorId &&
        info.usbProductId === settings.info.usbProductId;
    });
    return matches.length === 1 ? { mode: 'usb', device: matches[0] } : null;
  }
  if (settings.mode === 'bluetooth' && navigator.bluetooth) {
    const devices = navigator.bluetooth.getDevices
      ? await navigator.bluetooth.getDevices() : (lastDevice ? [lastDevice] : []);
    const device = devices.find(item => item.id === settings.id);
    return device ? { mode: 'bluetooth', device } : null;
  }
  return null;
}
