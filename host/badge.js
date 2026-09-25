// The number on the Pi icon in the activity bar, for other extensions to set.
//
// VS Code keeps a badge on the view object, and builds a new view object every time the sidebar is
// moved, so the last badge is remembered here and put back on each new one.

'use strict';

/**
 * @returns {{
 *   set: (value: number, tooltip?: string) => void,
 *   apply: (view: import('vscode').WebviewView) => void,
 * }}
 */
function createBadge() {
  /** @type {{ value: number, tooltip: string }|undefined} the badge as last set */
  let badge;
  /** @type {import('vscode').WebviewView|null} the view showing it, while there is one */
  let view = null;

  /**
   * Shows a number on the Pi icon, or clears it with 0. The "Pi Dock: Set Badge" command, for other
   * extensions: one that knows Pi is waiting for an answer can say so here.
   *
   * @param {number} value
   * @param {string} [tooltip]
   */
  function set(value, tooltip = '') {
    badge = Number(value) > 0 ? { value: Number(value), tooltip: String(tooltip) } : undefined;
    if (view) view.badge = badge;
  }

  /**
   * Puts the remembered badge on a freshly built view, and keeps that view for later sets.
   *
   * @param {import('vscode').WebviewView} webviewView
   */
  function apply(webviewView) {
    view = webviewView;
    view.badge = badge;
    view.onDidDispose(() => {
      if (view === webviewView) view = null;
    });
  }

  return { set, apply };
}

module.exports = { createBadge };
