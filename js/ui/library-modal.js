/**
 * XRP Blocks — Device Library Modal
 *
 * The "Library" button opens this. It lists what is already added, what is
 * available in the catalogue that ships with the IDE, and two ways to bring in
 * a library from elsewhere: a file on this computer, or a URL.
 *
 * Usage:
 *   await LibraryModal.open({ manager, workspace, onChange, onToast });
 */

import { text } from '../devices/manifest-compiler.js';

const ICON_ADD = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`;

const ICON_REMOVE = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`;

const ICON_CHIP = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>
  </svg>`;

export class LibraryModal {
  /**
   * @param {Object} options
   * @param {import('../devices/library-manager.js').LibraryManager} options.manager
   * @param {Blockly.Workspace} options.workspace
   * @param {function(): void} options.onChange - called after every add or remove
   * @param {function(string, string=): void} [options.onToast]
   * @returns {Promise<void>} resolves when the dialog closes
   */
  static open({ manager, workspace, onChange, onToast = null }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('library-modal');
      const listEl = document.getElementById('library-modal-list');
      const closeBtn = document.getElementById('library-modal-close');
      const uploadBtn = document.getElementById('library-modal-upload');
      const urlInput = document.getElementById('library-modal-url');
      const fetchBtn = document.getElementById('library-modal-fetch');
      const errorEl = document.getElementById('library-modal-error');

      if (!modal || !listEl) {
        resolve();
        return;
      }

      this._manager = manager;
      this._workspace = workspace;
      this._onChange = onChange;
      this._onToast = onToast;
      this._listEl = listEl;
      this._errorEl = errorEl;

      let settled = false;
      const close = () => {
        if (settled) return;
        settled = true;
        modal.classList.remove('visible');
        document.body.classList.remove('modal-open');
        cleanup();
        resolve();
      };

      const onOverlay = (e) => { if (e.target === modal) close(); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      const onUpload = () => this._addFromFile();
      const onFetch = () => this._addFromUrl(urlInput);
      const onUrlKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); this._addFromUrl(urlInput); } };

      const cleanup = () => {
        closeBtn?.removeEventListener('click', close);
        modal.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
        uploadBtn?.removeEventListener('click', onUpload);
        fetchBtn?.removeEventListener('click', onFetch);
        urlInput?.removeEventListener('keydown', onUrlKey);
      };

      closeBtn?.addEventListener('click', close);
      modal.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);
      uploadBtn?.addEventListener('click', onUpload);
      fetchBtn?.addEventListener('click', onFetch);
      urlInput?.addEventListener('keydown', onUrlKey);

      if (errorEl) errorEl.hidden = true;
      modal.classList.add('visible');
      document.body.classList.add('modal-open');

      this._render();
    });
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  static async _render() {
    const manager = this._manager;
    const listEl = this._listEl;
    const lang = manager.lang;

    listEl.innerHTML =
      `<div class="lesson-modal__status">${Blockly.Msg['MSG_LIBRARY_LOADING'] || 'Loading device libraries…'}</div>`;

    await manager.loadCatalogue();

    const installed = manager.installed;
    const available = (manager.catalogue || []).filter((entry) => !manager.has(entry.id));

    listEl.innerHTML = '';

    if (installed.length) {
      listEl.appendChild(this._heading(Blockly.Msg['UI_LIBRARY_INSTALLED'] || 'Added to this IDE'));
      for (const { manifest, origin } of installed) {
        listEl.appendChild(this._row({
          title: text(manifest.name, lang, manifest.id),
          subtitle: this._subtitle(manifest, origin, lang),
          colour: manifest.category?.colour,
          actionLabel: Blockly.Msg['UI_LIBRARY_REMOVE'] || 'Remove',
          actionIcon: ICON_REMOVE,
          actionClass: 'library-item__btn--remove',
          onAction: () => this._remove(manifest.id),
        }));
      }
    }

    if (available.length) {
      listEl.appendChild(this._heading(Blockly.Msg['UI_LIBRARY_AVAILABLE'] || 'Available to add'));
      for (const entry of available) {
        listEl.appendChild(this._row({
          title: text(entry.name, lang, entry.id),
          subtitle: text(entry.description, lang, ''),
          colour: entry.colour,
          actionLabel: Blockly.Msg['UI_LIBRARY_ADD'] || 'Add',
          actionIcon: ICON_ADD,
          actionClass: 'library-item__btn--add',
          onAction: () => this._addFromCatalogue(entry.id),
        }));
      }
    }

    if (!installed.length && !available.length) {
      listEl.innerHTML =
        `<div class="lesson-modal__status">${Blockly.Msg['MSG_LIBRARY_EMPTY'] || 'No device libraries found. Add one from a file or a URL below.'}</div>`;
    }
  }

  static _heading(label) {
    const el = document.createElement('div');
    el.className = 'library-modal__heading';
    el.textContent = label;
    return el;
  }

  static _subtitle(manifest, origin, lang) {
    const description = text(manifest.description, lang, '');
    const blocks = Array.isArray(manifest.blocks) ? manifest.blocks.length : 0;
    const count = blocks === 1
      ? (Blockly.Msg['UI_LIBRARY_ONE_BLOCK'] || '1 block')
      : (Blockly.Msg['UI_LIBRARY_N_BLOCKS'] || '%1 blocks').replace('%1', String(blocks));
    const source = origin?.type === 'url'
      ? (Blockly.Msg['UI_LIBRARY_FROM_URL'] || 'from a URL')
      : origin?.type === 'file'
        ? (Blockly.Msg['UI_LIBRARY_FROM_FILE'] || 'from a file')
        : '';
    return [description, count, source].filter(Boolean).join(' · ');
  }

  static _row({ title, subtitle, colour, actionLabel, actionIcon, actionClass, onAction }) {
    const row = document.createElement('div');
    row.className = 'library-item';
    row.innerHTML = `
      <span class="library-item__icon">${ICON_CHIP}</span>
      <span class="library-item__body">
        <span class="library-item__title"></span>
        <span class="library-item__subtitle"></span>
      </span>
      <button type="button" class="library-item__btn ${actionClass}">
        ${actionIcon}<span class="library-item__btn-label"></span>
      </button>
    `;

    row.querySelector('.library-item__title').textContent = title;
    row.querySelector('.library-item__subtitle').textContent = subtitle || '';
    row.querySelector('.library-item__btn-label').textContent = actionLabel;

    if (colour && /^#[0-9a-fA-F]{6}$/.test(colour)) {
      const icon = row.querySelector('.library-item__icon');
      icon.style.color = colour;
      icon.style.borderColor = `${colour}55`;
      icon.style.background = `${colour}1A`;
    }

    row.querySelector('.library-item__btn').addEventListener('click', onAction);
    return row;
  }

  // ── Actions ────────────────────────────────────────────────────────────

  static async _addFromCatalogue(id) {
    try {
      const manifest = await this._manager.addFromCatalogue(id);
      this._changed(manifest);
    } catch (err) {
      this._showError(err);
    }
    this._render();
  }

  static async _addFromUrl(urlInput) {
    const url = (urlInput?.value || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      this._showError(new Error(Blockly.Msg['MSG_LIBRARY_URL_INVALID'] || 'Enter a full address starting with https://'));
      return;
    }
    try {
      const manifest = await this._manager.addFromUrl(url);
      urlInput.value = '';
      this._changed(manifest);
    } catch (err) {
      this._showError(err, Blockly.Msg['MSG_LIBRARY_FETCH_ERROR']
        || 'Could not fetch that library. Check the address, and that the server allows other sites to read it.');
    }
    this._render();
  }

  static _addFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const manifest = JSON.parse(await file.text());
        this._manager.addFromManifest(manifest, file.name);
        this._changed(manifest);
      } catch (err) {
        this._showError(err);
      }
      this._render();
    };
    input.click();
  }

  static _remove(id) {
    const manager = this._manager;
    const label = manager.label(manager.get(id)?.manifest || { id });
    const result = manager.remove(id, this._workspace);

    if (!result.ok) {
      // Not a fault: the user is being told why, so there is nothing to log.
      this._showMessage(Blockly.Msg['MSG_LIBRARY_IN_USE']
        || 'Those blocks are still being used in your program. Delete them first, then remove the library.');
      this._render();
      return;
    }

    this._onChange?.();
    this._toast((Blockly.Msg['MSG_LIBRARY_REMOVED'] || 'Removed %1').replace('%1', label));
    this._render();
  }

  static _changed(manifest) {
    this._onChange?.();
    const label = this._manager.label(manifest);
    this._toast((Blockly.Msg['MSG_LIBRARY_ADDED'] || 'Added %1').replace('%1', label));
    if (this._errorEl) this._errorEl.hidden = true;
  }

  static _toast(message, type = 'success') {
    if (typeof this._onToast === 'function') this._onToast(message, type);
  }

  static _showError(err, fallback = '') {
    console.error('[LibraryModal]', err);
    this._showMessage(fallback || err?.message || 'Something went wrong.');
  }

  /** Put a message under the dialog's buttons for a few seconds. */
  static _showMessage(message) {
    const el = this._errorEl;
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }
}
