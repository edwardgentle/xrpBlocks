/**
 * XRP Blocks — Connection Picker Modal
 *
 * Presents a choice between USB (WebSerial) and Bluetooth (Web Bluetooth).
 * Each option card is greyed-out if the API is not supported by the current browser.
 *
 * Usage:
 *   import { ConnectionModal } from './ui/connection-modal.js';
 *   const mode = await ConnectionModal.pick(); // 'usb' | 'bluetooth' | null
 */

export class ConnectionModal {
  /**
   * Show the connection picker and return a Promise that resolves to:
   *  - 'usb'       — user chose WebSerial
   *  - 'bluetooth' — user chose Bluetooth
   *  - null        — user dismissed the modal without choosing
   *
   * @returns {Promise<'usb'|'bluetooth'|null>}
   */
  static pick() {
    return new Promise(resolve => {
      const modal = document.getElementById('connection-modal');
      const usbBtn = document.getElementById('conn-opt-usb');
      const btBtn  = document.getElementById('conn-opt-bt');
      const closeBtn = document.getElementById('conn-modal-close');

      if (!modal) {
        // Fallback: modal HTML missing, default to USB
        resolve('usb');
        return;
      }

      // Reflect browser capability
      const usbSupported = 'serial' in navigator;
      const btSupported  = 'bluetooth' in navigator;

      usbBtn.disabled = !usbSupported;
      usbBtn.classList.toggle('conn-opt--unsupported', !usbSupported);
      document.getElementById('conn-opt-usb-badge').style.display =
        usbSupported ? 'none' : 'flex';

      btBtn.disabled  = !btSupported;
      btBtn.classList.toggle('conn-opt--unsupported', !btSupported);
      document.getElementById('conn-opt-bt-badge').style.display =
        btSupported ? 'none' : 'flex';

      // Show modal
      modal.classList.add('visible');
      document.body.classList.add('modal-open');

      // Helper to close and resolve
      const close = (result) => {
        modal.classList.remove('visible');
        document.body.classList.remove('modal-open');
        cleanup();
        resolve(result);
      };

      const onUsb = () => close('usb');
      const onBt  = () => close('bluetooth');
      const onClose = () => close(null);
      const onOverlay = (e) => { if (e.target === modal) close(null); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };

      const cleanup = () => {
        usbBtn.removeEventListener('click', onUsb);
        btBtn.removeEventListener('click', onBt);
        closeBtn.removeEventListener('click', onClose);
        modal.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
      };

      usbBtn.addEventListener('click', onUsb);
      btBtn.addEventListener('click', onBt);
      closeBtn.addEventListener('click', onClose);
      modal.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);
    });
  }
}
