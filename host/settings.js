// Reading the user's settings, in one go and as a plain object, so everything one page is built from
// agrees on the same values even if a setting changes halfway through.

'use strict';

const os = require('os');
const vscode = require('vscode');

/**
 * Reads every piDock.* setting. Empty paths and lists are filled in here so callers need not check.
 *
 * @returns {import('../types').Settings}
 */
function readSettings() {
  const cfg = vscode.workspace.getConfiguration('piDock');
  return {
    command: cfg.get('command'),
    persist: cfg.get('persist'),
    dtachPath: cfg.get('dtachPath') || 'dtach',
    ttydPath: cfg.get('ttydPath') || 'ttyd',
    fontSize: cfg.get('fontSize') || undefined,
    fontFamily: cfg.get('fontFamily'),
    theme: cfg.get('theme'),
    clientOptions: cfg.get('clientOptions'),
    escapeActions: cfg.get('escapeActions') || [],
    extraArgs: cfg.get('extraArgs'),
  };
}

/**
 * Returns the folder Pi runs in, which also names the session (lib/session.js).
 *
 * @returns {string} The first workspace folder, or your home folder if none is open.
 */
function workspaceCwd() {
  const folders = vscode.workspace.workspaceFolders || [];
  return folders.length ? folders[0].uri.fsPath : os.homedir();
}

module.exports = { readSettings, workspaceCwd };
