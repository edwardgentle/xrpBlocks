/**
 * XRP Blocks — Unsupported Browser Modal
 *
 * Shown once on launch when the browser supports neither WebSerial nor Web
 * Bluetooth (e.g. Safari, Firefox), so the user can't connect to the XRP.
 * Reuses the connection-modal styling.
 *
 * Usage:
 *   import { UnsupportedModal } from './ui/unsupported-modal.js';
 *   UnsupportedModal.show();
 */

export class UnsupportedModal {
  /** Show the unsupported-browser modal. Dismissed via close / "Got it" / overlay / Escape. */
  static show() {
    const modal = document.getElementById('unsupported-modal');
    if (!modal) return;

    const closeBtn = document.getElementById('unsupported-modal-close');
    const okBtn    = document.getElementById('unsupported-modal-ok');

    modal.classList.add('visible');
    document.body.classList.add('modal-open');

    const close = () => {
      modal.classList.remove('visible');
      document.body.classList.remove('modal-open');
      cleanup();
    };

    const onOverlay = (e) => { if (e.target === modal) close(); };
    const onKey     = (e) => { if (e.key === 'Escape') close(); };

    const cleanup = () => {
      closeBtn?.removeEventListener('click', close);
      okBtn?.removeEventListener('click', close);
      modal.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
    };

    closeBtn?.addEventListener('click', close);
    okBtn?.addEventListener('click', close);
    modal.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
  }
}
