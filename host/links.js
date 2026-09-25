// Paths in the output: which are files, and opening the one Ctrl+clicked.
//
// The page finds what looks like a path and asks which of them are files (page/links.js);
// only those are underlined, as in VS Code's own terminal, so "e.g." and "example.com" stay plain.
// The one clicked is posted here and opened at its line. Both resolve against the folder Pi runs
// in.

'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { workspaceCwd } = require('./settings');

/**
 * @param {object} deps
 * @param {import('vscode').OutputChannel} deps.output
 * @param {(message: import('../types').ResolvedMessage) => void} deps.post Sends a message to the page.
 * @returns {{
 *   resolve: (message: import('../types').ResolveMessage) => void,
 *   open: (message: import('../types').OpenMessage) => Promise<void>,
 * }}
 */
function createLinks({ output, post }) {
  /** Whether a path names a file, taken from the folder Pi runs in. */
  const isFile = (given) => {
    try {
      return fs.statSync(path.resolve(workspaceCwd(), given)).isFile();
    } catch (_) {
      return false;
    }
  };

  /**
   * Answers the page: of these paths, which are files. Asked once per path per page, so the cost is
   * one stat per distinct path the output has shown.
   *
   * @param {import('../types').ResolveMessage} message
   */
  function resolve({ id, paths }) {
    if (typeof id !== 'number' || !Array.isArray(paths)) return;
    const found = {};
    for (const given of paths) if (typeof given === 'string' && given) found[given] = isFile(given);
    post({ type: 'resolved', id, found });
  }

  /**
   * Opens a path that was Ctrl+clicked in the output, at its line, as VS Code's own terminal does.
   *
   * A relative path is taken from the folder Pi runs in. A path that does not exist is logged and
   * ignored: Pi's output is full of things that look like paths, and a popup for each would be
   * worse than nothing happening.
   *
   * @async
   * @param {import('../types').OpenMessage} message
   * @returns {Promise<void>}
   */
  async function open({ path: given, line = 1, column = 1 }) {
    if (typeof given !== 'string' || !given) return;
    const file = path.resolve(workspaceCwd(), given);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return output.appendLine(`[pi-dock] not a file, not opened: ${file}`);
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const position = document.validatePosition(new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1)));
      await vscode.window.showTextDocument(document, { preview: true, preserveFocus: false, selection: new vscode.Range(position, position) });
    } catch (err) {
      output.appendLine(`[pi-dock] could not open ${file}: ${err && err.message ? err.message : err}`);
    }
  }

  return { resolve, open };
}

module.exports = { createLinks };
