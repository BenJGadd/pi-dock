// Telling VS Code which of the three programs are installed, for the walkthrough and a command.
//
// Each check is one context key, and the walkthrough's steps complete on those keys. The checks
// look the programs up on PATH without running them (lib/executable.js), against the paths in the
// settings, so a user who sets `piDock.ttydPath` sees that step turn green.
//
// The awkward part is *when* to say it, and it is worth writing down because the obvious way is
// wrong. A step completes when its key changes to true while the walkthrough is listening, and the
// walkthrough only begins listening when one is first opened in that window. A key that is already
// true by then is filed as an answer that has been heard, and the step is never ticked, whatever
// any later check says. Measured on VSCodium 1.116: a window with all three programs installed
// showed every step unticked, and "Check again" did not change it, because the check had run at
// activation, long before anyone opened the page. The people who had everything installed were the
// only ones who could never see a tick.
//
// So nothing is claimed until there is somebody to hear it. Until a page opens every key is
// published false, which is honest — nothing has been asked yet — and the first page to open makes
// them say what the checks found. That change is what ticks the steps. From then on the keys track
// the truth, so a program installed while the page is open ticks its step at the next check.
//
// Two other ways were measured and do not work. A step cannot be completed by running a command
// (`onCommand:`): a command an extension both registers and executes is handled inside the
// extension host and never reaches the workbench, so nothing hears it. And a key that merely blinks
// false and true again at activation is still too early, for the same reason as above.

'use strict';

const vscode = require('vscode');
const { isInstalled } = require('../lib/executable');

/** Each program, where its path is read from, and the key that says it was found. */
const CHECKS = [
  { name: 'ttyd', key: 'piDock.hasTtyd', program: (settings) => settings.ttydPath },
  { name: 'dtach', key: 'piDock.hasDtach', program: (settings) => settings.dtachPath },
  { name: 'pi', key: 'piDock.hasPi', program: (settings) => (settings.command && settings.command[0]) || 'pi' },
];

/** The last step is not a program to look up but a thing you did: the sidebar has been drawn. */
const SIDEBAR_KEY = 'piDock.sidebarSeen';

/** Whether a walkthrough has been opened in this window, which is when the keys start speaking. */
let pageSeen = false;

/**
 * Runs the checks and publishes them.
 *
 * @param {import('../types').Settings} settings
 * @param {() => boolean} [sidebarOpened] Whether the sidebar has been drawn in this window.
 * @returns {{ name: string, program: string, found: boolean }[]} What was checked, for a message.
 */
function checkSetup(settings, sidebarOpened = () => false) {
  const results = CHECKS.map(({ name, key, program }) => {
    const found = isInstalled(program(settings));
    void vscode.commands.executeCommand('setContext', key, pageSeen && found);
    return { name, program: program(settings), found };
  });
  void vscode.commands.executeCommand('setContext', SIDEBAR_KEY, pageSeen && sidebarOpened());
  return results;
}

/**
 * Says the checks again once a page is there to hear them.
 *
 * The walkthrough is an editor this API cannot name: it arrives as a tab with no input, as the
 * settings editor and the release notes do. Any of those is close enough — being wrong costs three
 * lookups on PATH — and being right is the difference between a page of ticks and a page of empty
 * circles.
 *
 * @param {object} deps
 * @param {() => import('../types').Settings} deps.readSettings
 * @param {() => boolean} deps.sidebarOpened
 * @returns {import('vscode').Disposable}
 */
function watchWalkthrough({ readSettings, sidebarOpened }) {
  return vscode.window.tabGroups.onDidChangeTabs((event) => {
    if (!event.opened.some((tab) => !tab.input)) return;
    pageSeen = true;
    checkSetup(readSettings(), sidebarOpened);
  });
}

/**
 * The "Pi Dock: Check Setup" command: runs the checks again and says what it found.
 *
 * @param {() => import('../types').Settings} readSettings
 * @param {() => boolean} [sidebarOpened]
 * @returns {Promise<void>}
 */
async function reportSetup(readSettings, sidebarOpened) {
  const results = checkSetup(readSettings(), sidebarOpened);
  const missing = results.filter((r) => !r.found);
  if (missing.length === 0) {
    vscode.window.showInformationMessage('Pi Dock: ttyd, dtach and pi are all installed.');
    return;
  }
  const answer = await vscode.window.showWarningMessage(
    `Pi Dock: could not find ${missing.map((r) => `${r.name} ("${r.program}")`).join(', ')}.`,
    'Open Walkthrough',
  );
  if (answer === 'Open Walkthrough') {
    await vscode.commands.executeCommand('workbench.action.openWalkthrough', 'BenJGadd.pi-dock#piDock.setup', false);
  }
}

module.exports = { CHECKS, SIDEBAR_KEY, checkSetup, reportSetup, watchWalkthrough };
