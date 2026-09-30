/**
 * XRP Blocks — Lesson Manager
 *
 * Manages the procedural tutorial panel displayed above the Blockly workspace.
 * Handles step navigation, progress display, toolbox filtering, and the
 * styled exit-confirmation dialog.
 *
 * All IDE-generated strings use Blockly.Msg for i18n support.
 * Lesson content (title, steps) is authored in the lesson JSON and not translated.
 *
 * Expected lesson JSON format:
 * {
 *   "title": "Lesson 1: Drive Straight",
 *   "steps": ["Step 1 text...", "Step 2 text..."],
 *   "toolbox": {
 *     "Events": [],                              // all blocks in Events shown
 *     "Drive": ["xrp_drive_straight"]            // only this block in Drive shown
 *   }
 * }
 * If "toolbox" is omitted or {}, all categories are shown.
 */

export class LessonManager {
  /**
   * @param {Object} options
   * @param {Function} options.onToolboxChange - Called with (toolboxFilter) when lesson loads/exits.
   * @param {Function} options.onLoadTemplate  - Called with (templateState) when lesson has a template.
   *   Should load the state into the Blockly workspace.
   * @param {Function} options.onResize - Called after panel shows/hides so Blockly can resize.
   */
  constructor({ onToolboxChange, onLoadTemplate, onResize }) {
    this.onToolboxChange = onToolboxChange;
    this.onLoadTemplate = onLoadTemplate;
    this.onResize = onResize;

    this.currentLesson = null;
    this.currentStep = 0;

    this._panel = document.getElementById('lesson-panel');
    this._confirmDialog = null;

    this._buildConfirmDialog();
    this._bindStaticElements();
  }

  // ── Public API ──

  /**
   * Load a lesson object and show the panel.
   * @param {Object} lesson - Parsed lesson JSON
   * @returns {boolean} true if loaded successfully
   */
  load(lesson) {
    if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
      console.error('[LessonManager] Invalid lesson: must have a non-empty steps array.');
      return false;
    }

    this.currentLesson = lesson;
    this.currentStep = 0;

    // Apply toolbox filter
    this.onToolboxChange?.(lesson.toolbox || null);

    // Load template workspace state if provided
    if (lesson.template && typeof lesson.template === 'object') {
      this.onLoadTemplate?.(lesson.template);
    }

    this._render();
    this._showPanel();

    return true;
  }

  /**
   * Show the exit confirmation dialog. If confirmed, exits the lesson.
   */
  confirmExit() {
    this._showConfirmDialog(() => this._doExit());
  }

  // ── Private: Exit ──

  _doExit() {
    this.currentLesson = null;
    this.currentStep = 0;
    this.onToolboxChange?.(null);
    this._hidePanel();
  }

  // ── Private: Confirmation Dialog ──

  /**
   * Build a custom styled confirmation dialog and append it to body.
   * The dialog is reused across calls; its text is always refreshed from Blockly.Msg.
   */
  _buildConfirmDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'lesson-confirm-overlay';
    overlay.className = 'lesson-confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'lesson-confirm-title');

    overlay.innerHTML = `
      <div class="lesson-confirm-dialog" role="document">
        <div class="lesson-confirm-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 class="lesson-confirm-title" id="lesson-confirm-title"></h2>
        <p class="lesson-confirm-body"></p>
        <div class="lesson-confirm-actions">
          <button class="lesson-confirm-btn lesson-confirm-btn--no" id="lesson-confirm-no"></button>
          <button class="lesson-confirm-btn lesson-confirm-btn--yes" id="lesson-confirm-yes"></button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._confirmDialog = overlay;

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._hideConfirmDialog();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('lesson-confirm-overlay--visible')) {
        this._hideConfirmDialog();
      }
    });
  }

  _showConfirmDialog(onConfirm) {
    if (!this._confirmDialog) return;

    // Refresh translatable text from Blockly.Msg each time (language may have changed)
    this._confirmDialog.querySelector('.lesson-confirm-title').textContent =
      Blockly.Msg['LESSON_CONFIRM_TITLE'] || 'Exit lesson?';
    this._confirmDialog.querySelector('.lesson-confirm-body').textContent =
      Blockly.Msg['LESSON_CONFIRM_BODY'] || 'Are you sure you want to exit?';

    const noBtn = this._confirmDialog.querySelector('#lesson-confirm-no');
    const yesBtn = this._confirmDialog.querySelector('#lesson-confirm-yes');

    noBtn.textContent = Blockly.Msg['LESSON_CONFIRM_NO'] || 'Keep going';
    yesBtn.textContent = Blockly.Msg['LESSON_CONFIRM_YES'] || 'Exit lesson';

    // Wire up buttons (replace to avoid duplicate listeners)
    const newNo = noBtn.cloneNode(true);
    const newYes = yesBtn.cloneNode(true);
    noBtn.replaceWith(newNo);
    yesBtn.replaceWith(newYes);

    newNo.addEventListener('click', () => this._hideConfirmDialog());
    newYes.addEventListener('click', () => {
      this._hideConfirmDialog();
      onConfirm?.();
    });

    // Show with animation
    this._confirmDialog.classList.add('lesson-confirm-overlay--visible');
    // Focus the "keep going" button by default (safe choice)
    requestAnimationFrame(() => newNo.focus());
  }

  _hideConfirmDialog() {
    this._confirmDialog?.classList.remove('lesson-confirm-overlay--visible');
  }

  // ── Private: Panel rendering ──

  _bindStaticElements() {
    if (!this._panel) {
      console.error('[LessonManager] #lesson-panel element not found in DOM.');
      return;
    }

    this._titleEl = this._panel.querySelector('.lesson-panel__title');
    this._progressBar = this._panel.querySelector('.lesson-panel__progress-fill');
    this._stepCountEl = this._panel.querySelector('.lesson-panel__step-count');
    this._stepTextEl = this._panel.querySelector('.lesson-panel__step-text');
    this._prevBtn = this._panel.querySelector('#btn-lesson-prev');
    this._nextBtn = this._panel.querySelector('#btn-lesson-next');
    this._closeBtn = this._panel.querySelector('#btn-lesson-close');

    this._prevBtn?.addEventListener('click', () => this._navigate(-1));
    this._nextBtn?.addEventListener('click', () => this._navigate(1));
    this._closeBtn?.addEventListener('click', () => this.confirmExit());
  }

  _render() {
    const lesson = this.currentLesson;
    if (!lesson) return;

    const total = lesson.steps.length;
    const stepIndex = this.currentStep;
    const progress = total === 1 ? 100 : Math.round((stepIndex / (total - 1)) * 100);

    // Title (lesson-authored content — no translation)
    if (this._titleEl) {
      this._titleEl.textContent = lesson.title || 'Lesson';
    }

    // Progress bar
    if (this._progressBar) {
      this._progressBar.style.width = `${progress}%`;
    }

    // Step count — uses i18n template "Step %1 of %2"
    if (this._stepCountEl) {
      const tpl = Blockly.Msg['LESSON_STEP_OF'] || 'Step %1 of %2';
      this._stepCountEl.textContent = tpl
        .replace('%1', stepIndex + 1)
        .replace('%2', total);
    }

    // Step text — lesson-authored HTML content, no translation
    if (this._stepTextEl) {
      this._stepTextEl.innerHTML = lesson.steps[stepIndex] || '';
      this._stepTextEl.classList.remove('lesson-step--animating');
      void this._stepTextEl.offsetWidth; // force reflow
      this._stepTextEl.classList.add('lesson-step--animating');
    }

    // Previous button
    if (this._prevBtn) {
      this._prevBtn.disabled = stepIndex === 0;
      const prevLabel = this._prevBtn.querySelector('span');
      if (prevLabel) prevLabel.textContent = Blockly.Msg['LESSON_BTN_PREV'] || 'Previous';
    }

    // Next / Finish button
    if (this._nextBtn) {
      const isLast = stepIndex === total - 1;
      const label = isLast
        ? (Blockly.Msg['LESSON_BTN_FINISH'] || 'Finish')
        : (Blockly.Msg['LESSON_BTN_NEXT'] || 'Next');

      this._nextBtn.innerHTML = isLast
        ? `<span>${label}</span> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<span>${label}</span> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

      this._nextBtn.classList.toggle('lesson-panel__btn--finish', isLast);
    }

    // Close button aria label & tooltip
    if (this._closeBtn) {
      const label = Blockly.Msg['LESSON_ARIA_EXIT'] || 'Exit lesson';
      this._closeBtn.setAttribute('aria-label', label);
      this._closeBtn.setAttribute('data-tooltip', Blockly.Msg['LESSON_TIP_EXIT'] || label);
    }
  }

  _navigate(delta) {
    if (!this.currentLesson) return;
    const total = this.currentLesson.steps.length;
    const next = this.currentStep + delta;
    if (next < 0) return;
    if (next >= total) {
      // Final "Finish" click — exit without confirmation (lesson complete)
      this._doExit();
      return;
    }
    this.currentStep = next;
    this._render();
  }

  _showPanel() {
    if (!this._panel) return;
    this._panel.classList.remove('lesson-panel--hidden');
    requestAnimationFrame(() => {
      this._panel.style.maxHeight = '220px';
      this._panel.style.opacity = '1';
    });
    setTimeout(() => this.onResize?.(), 320);
  }

  _hidePanel() {
    if (!this._panel) return;
    this._panel.style.maxHeight = '0';
    this._panel.style.opacity = '0';
    setTimeout(() => {
      this._panel.classList.add('lesson-panel--hidden');
      this.onResize?.();
    }, 320);
  }
}
