/**
 * XRP Blocks — Python Preview Panel
 * Shows generated Python code with simple syntax highlighting.
 */

export class PythonPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this._code = '';
  }

  /**
   * Update the displayed Python code
   */
  update(pythonCode) {
    this._code = pythonCode;
    this.container.innerHTML = this._highlight(pythonCode);
  }

  /**
   * Get the current Python code as plain text
   */
  getCode() {
    return this._code;
  }

  /**
   * Copy code to clipboard
   */
  async copyToClipboard() {
    try {
      await navigator.clipboard.writeText(this._code);
      return true;
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = this._code;
      textArea.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    }
  }

  /**
   * Simple Python syntax highlighting (regex-based, lightweight)
   */
  _highlight(code) {
    if (!code.trim()) {
      return '<span class="comment"># Drag blocks to start coding!\n# Your Python code will appear here.</span>';
    }

    const keywords = ['from', 'import', 'def', 'return', 'if', 'elif', 'else', 'for', 'while',
      'break', 'continue', 'pass', 'True', 'False', 'None', 'and', 'or', 'not', 'in',
      'is', 'class', 'try', 'except', 'finally', 'with', 'as', 'yield', 'lambda',
      'global', 'nonlocal', 'assert', 'del', 'raise'];

    // Single pass over the raw code: each character is classified exactly
    // once, so tokens can never nest inside or corrupt one another.
    const tokenRegex = new RegExp(
      '(#.*$)' +                            // comment
      '|("[^"]*"|\'[^\']*\')' +             // string
      `|\\b(${keywords.join('|')})\\b` +    // keyword
      '|\\b(\\d+\\.?\\d*)\\b' +             // number
      '|\\b([a-zA-Z_]\\w*)(?=\\s*\\()' +    // function call
      '|([()[\\]{}.,:;+\\-*/%=<>!&|^~]+)',  // punctuation/operators
      'gm'
    );

    const escapeHtml = (s) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return code.replace(tokenRegex, (match, comment, string, keyword, number, func, punct) => {
      if (comment) return `<span class="comment">${escapeHtml(comment)}</span>`;
      if (string) return `<span class="string">${escapeHtml(string)}</span>`;
      if (keyword) return `<span class="keyword">${keyword}</span>`;
      if (number) return `<span class="number">${number}</span>`;
      if (func) return `<span class="function">${func}</span>`;
      return `<span class="punctuation">${escapeHtml(punct)}</span>`;
    });
  }
}
