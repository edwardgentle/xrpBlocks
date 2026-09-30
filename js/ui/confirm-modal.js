/**
 * XRP Blocks — Confirmation Modal
 *
 * A yes/no dialog in the same style as the connection picker, used before
 * anything that overwrites work on the robot.
 *
 * Usage:
 *   import { ConfirmModal } from './ui/confirm-modal.js';
 *   const ok = await ConfirmModal.ask({
 *     title: 'Save to the robot?',
 *     body: 'This replaces main.py on the XRP.',
 *     confirmLabel: 'Save to XRP',
 *     cancelLabel: 'Cancel',
 *   });
 */

export class ConfirmModal {
  /**
   * Show the dialog and resolve true only if the user confirms. Dismissing it
   * with the close button, the Escape key or a click on the backdrop all
   * resolve false, so a cancel is always the safe default.
   *
   * @param {{title?: string, body?: string, detail?: string,
   *          confirmLabel?: string, cancelLabel?: string}} options
   * @returns {Promise<boolean>}
   */
  static ask({ title, body, detail, confirmLabel, cancelLabel } = {}) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const bodyEl = document.getElementById('confirm-modal-body');
      const detailEl = document.getElementById('confirm-modal-detail');
      const okBtn = document.getElementById('confirm-modal-ok');
      const cancelBtn = document.getElementById('confirm-modal-cancel');
      const closeBtn = document.getElementById('confirm-modal-close');

      if (!modal || !okBtn || !cancelBtn) {
        // Markup missing: fall back to the browser's own dialog rather than
        // silently going ahead with a destructive action.
        resolve(window.confirm(`${title || ''}\n\n${body || ''}`.trim()));
        return;
      }

      if (title) titleEl.textContent = title;
      if (body) bodyEl.textContent = body;
      if (detailEl) {
        detailEl.textContent = detail || '';
        detailEl.hidden = !detail;
      }
      if (confirmLabel) okBtn.textContent = confirmLabel;
      if (cancelLabel) cancelBtn.textContent = cancelLabel;

      modal.classList.add('visible');
      document.body.classList.add('modal-open');

      const close = (result) => {
        modal.classList.remove('visible');
        document.body.classList.remove('modal-open');
        cleanup();
        resolve(result);
      };

      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onOverlay = (e) => { if (e.target === modal) close(false); };
      // Escape cancels. There is deliberately no Enter shortcut: the focused
      // button is Cancel, and a stray keypress must not overwrite the robot.
      const onKey = (e) => { if (e.key === 'Escape') close(false); };

      const cleanup = () => {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn?.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn?.addEventListener('click', onCancel);
      modal.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);

      // Focus Cancel, so a stray Space or Enter does not overwrite the robot.
      cancelBtn.focus();
    });
  }
}
