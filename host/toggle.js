// One key for both directions between the editor and Pi, as Ctrl+` is for VS Code's terminal.
//
// The page reports whether it has keyboard focus (page/main.js posts `focus`), which is what
// decides which way the key goes.

'use strict';

const vscode = require('vscode');

/**
 * @param {object} deps
 * @param {string} deps.viewId The sidebar view, whose `.focus` command VS Code provides.
 * @returns {{
 *   focus: () => Thenable<unknown>,
 *   toggle: () => Thenable<unknown>,
 *   pageFocused: (message: import('../types').FocusMessage) => void,
 * }}
 */
function createToggle({ viewId }) {
  /** Whether the page has keyboard focus, as it last reported. */
  let focused = false;

  function focus() {
    return vscode.commands.executeCommand(`${viewId}.focus`);
  }

  /** To Pi when the editor has focus, back to the editor when Pi has it. */
  function toggle() {
    return focused ? vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup') : focus();
  }

  /** @param {import('../types').FocusMessage} message */
  function pageFocused(message) {
    focused = Boolean(message.focused);
  }

  return { focus, toggle, pageFocused };
}

module.exports = { createToggle };
