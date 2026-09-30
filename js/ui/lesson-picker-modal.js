/**
 * XRP Blocks — Lesson Picker Modal
 *
 * Lists every lesson stored on the server under /lessons (discovered via
 * lessons/index.json, since a static host can't be directory-listed) plus an
 * "Upload" option that behaves like the previous lesson-file picker.
 *
 * Usage:
 *   import { LessonPickerModal } from './ui/lesson-picker-modal.js';
 *   const lesson = await LessonPickerModal.pick(); // parsed lesson JSON | null
 */

export class LessonPickerModal {
  /**
   * Show the lesson picker and return a Promise that resolves to:
   *  - the parsed lesson object the user picked (server-hosted or uploaded)
   *  - null if the user dismissed the modal without choosing
   *
   * @returns {Promise<Object|null>}
   */
  static pick() {
    return new Promise((resolve) => {
      const modal = document.getElementById('lesson-modal');
      const listEl = document.getElementById('lesson-modal-list');
      const closeBtn = document.getElementById('lesson-modal-close');
      const uploadBtn = document.getElementById('lesson-modal-upload');
      const errorEl = document.getElementById('lesson-modal-error');

      if (!modal || !listEl) {
        resolve(null);
        return;
      }

      let settled = false;
      const close = (result) => {
        if (settled) return;
        settled = true;
        modal.classList.remove('visible');
        document.body.classList.remove('modal-open');
        cleanup();
        resolve(result);
      };

      const onClose = () => close(null);
      const onOverlay = (e) => { if (e.target === modal) close(null); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      const onUpload = () => this._pickFromFile(
        (lesson) => close(lesson),
        () => this._flashError(errorEl)
      );

      const cleanup = () => {
        closeBtn?.removeEventListener('click', onClose);
        modal.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
        uploadBtn?.removeEventListener('click', onUpload);
      };

      closeBtn?.addEventListener('click', onClose);
      modal.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);
      uploadBtn?.addEventListener('click', onUpload);

      if (errorEl) errorEl.hidden = true;
      modal.classList.add('visible');
      document.body.classList.add('modal-open');

      this._populateList(listEl, (lesson) => close(lesson));
    });
  }

  /**
   * Fetch lessons/index.json, then fetch each listed lesson to read its
   * title, and render one item per valid lesson.
   */
  static async _populateList(listEl, onPick) {
    listEl.innerHTML = `<div class="lesson-modal__status">${Blockly.Msg['MSG_LESSONS_LOADING'] || 'Loading lessons…'}</div>`;

    let files;
    try {
      const res = await fetch('lessons/index.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`index.json ${res.status}`);
      files = await res.json();
      if (!Array.isArray(files)) throw new Error('index.json is not an array');
    } catch (err) {
      console.error('[LessonPickerModal] Failed to load lessons/index.json:', err);
      listEl.innerHTML = `<div class="lesson-modal__status lesson-modal__status--error">${Blockly.Msg['MSG_LESSONS_LOAD_ERROR'] || 'Failed to load lessons from the server.'}</div>`;
      return;
    }

    if (files.length === 0) {
      listEl.innerHTML = `<div class="lesson-modal__status">${Blockly.Msg['MSG_LESSONS_EMPTY'] || 'No lessons found on the server.'}</div>`;
      return;
    }

    const entries = await Promise.all(files.map(async (file) => {
      try {
        const res = await fetch(`lessons/${file}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${file} ${res.status}`);
        const lesson = await res.json();
        if (!lesson || !Array.isArray(lesson.steps)) throw new Error(`${file} is not a valid lesson`);
        return { file, lesson };
      } catch (err) {
        console.error('[LessonPickerModal] Failed to load lesson:', err);
        return null;
      }
    }));

    const valid = entries.filter(Boolean);

    if (valid.length === 0) {
      listEl.innerHTML = `<div class="lesson-modal__status lesson-modal__status--error">${Blockly.Msg['MSG_LESSONS_EMPTY'] || 'No lessons found on the server.'}</div>`;
      return;
    }

    listEl.innerHTML = '';
    for (const { file, lesson } of valid) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'lesson-item';
      item.innerHTML = `
        <span class="lesson-item__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </span>
        <span class="lesson-item__label"></span>
      `;
      item.querySelector('.lesson-item__label').textContent = lesson.title || file;
      item.addEventListener('click', () => onPick(lesson));
      listEl.appendChild(item);
    }
  }

  static _pickFromFile(onPick, onError) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const lesson = JSON.parse(text);
        if (!lesson || !Array.isArray(lesson.steps)) throw new Error('Invalid lesson file');
        onPick(lesson);
      } catch (err) {
        console.error('[LessonPickerModal] Failed to read uploaded lesson file:', err);
        onError?.();
      }
    };
    input.click();
  }

  static _flashError(errorEl) {
    if (!errorEl) return;
    errorEl.textContent = Blockly.Msg['MSG_LESSON_FILE_ERROR'] || 'Failed to read lesson file';
    errorEl.hidden = false;
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => { errorEl.hidden = true; }, 3500);
  }
}
