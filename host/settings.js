// The user's settings: read in one go as a plain object, so everything one page is built from
// agrees on the same values even if a setting changes halfway through; and applied when they
// change, with the cheapest thing that works for each.

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
    resume: cfg.get('resume', true),
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
 * Returns the folder Pi runs in, which also names the dtach session (lib/dtach.js).
 *
 * @returns {string} The first workspace folder, or your home folder if none is open.
 */
function workspaceCwd() {
  const folders = vscode.workspace.workspaceFolders || [];
  return folders.length ? folders[0].uri.fsPath : os.homedir();
}

// Settings only the page cares about. Changing one rebuilds the page, which keeps Pi running and
// restores its screen, exactly as moving the sidebar does.
const PAGE_SETTINGS = ['fontSize', 'fontFamily', 'theme', 'clientOptions'];
// Settings that decide how ttyd starts. Applying one means a new ttyd, which ends Pi, so it is offered.
const SERVER_SETTINGS = ['command', 'persist', 'dtachPath', 'ttydPath', 'extraArgs'];

/**
 * Applies each changed setting with the cheapest thing that works: new shortcuts are sent to the
 * running page, a changed program is checked again, a look is a rebuilt page, and a new way of
 * starting Pi is offered as a restart rather than forced.
 *
 * @param {object} deps
 * @param {{ isOpen: () => boolean, render: () => Promise<void>, refreshKeys: () => Promise<void> }} deps.page
 * @param {() => Promise<void>} deps.restart
 * @param {() => void} deps.checkSetup
 * @returns {import('vscode').Disposable}
 */
function watchChanges({ page, restart, checkSetup }) {
  return vscode.workspace.onDidChangeConfiguration(async (change) => {
    const changed = (names) => names.some((name) => change.affectsConfiguration(`piDock.${name}`));
    if (change.affectsConfiguration('piDock.escapeActions')) await page.refreshKeys();
    if (changed(['command', 'dtachPath', 'ttydPath'])) checkSetup();
    if (changed(PAGE_SETTINGS)) await page.render();
    if (changed(SERVER_SETTINGS)) await offerRestart();
  });

  /** Asks before ending Pi. Saying no changes nothing: the setting applies at the next start. */
  async function offerRestart() {
    if (!page.isOpen()) return; // nothing running yet, so the setting is used from the start
    const answer = await vscode.window.showInformationMessage(
      'Pi Dock: that setting applies when Pi starts. Restart Pi now?',
      'Restart Pi',
      'Later',
    );
    if (answer === 'Restart Pi') await restart();
  }
}

module.exports = { readSettings, workspaceCwd, watchChanges };
