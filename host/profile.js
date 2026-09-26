// A "Pi" terminal profile, for people who want Pi in the panel rather than the sidebar.
//
// New Terminal ▸ Pi runs the same `piDock.command` in the same folder, with the same environment
// and the same Pi extensions as the sidebar, in VS Code's own terminal. No ttyd and
// no dtach: a panel terminal is VS Code's to keep alive, and it does. It does not resume on its
// own: a new panel terminal is a deliberate second Pi, and whichever Pi started last is the one
// the sidebar comes back to.

'use strict';

const vscode = require('vscode');
const { readSettings, workspaceCwd } = require('./settings');
const { extensionFlags } = require('../lib/extensions');

const PROFILE_ID = 'piDock.profile';

/**
 * Registers the profile. VS Code asks for it each time the person picks "Pi" in the terminal menu.
 *
 * @param {string} version Pi Dock's version, which Pi sees as PI_DOCK.
 * @param {() => string[]} piExtensions The Pi extensions to load with `-e` (host/extensions.js).
 * @returns {import('vscode').Disposable}
 */
function registerProfile(version, piExtensions) {
  return vscode.window.registerTerminalProfileProvider(PROFILE_ID, {
    provideTerminalProfile() {
      const command = readSettings().command;
      const [shellPath, ...shellArgs] = command && command.length ? command : ['pi'];
      const cwd = workspaceCwd();
      return new vscode.TerminalProfile({
        name: 'Pi',
        shellPath,
        shellArgs: [...shellArgs, ...extensionFlags(piExtensions())],
        cwd,
        env: { COLORTERM: 'truecolor', PI_DOCK: version },
        iconPath: new vscode.ThemeIcon('hubot'),
      });
    },
  });
}

module.exports = { PROFILE_ID, registerProfile };
