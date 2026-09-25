// A "Pi" terminal profile, for people who want Pi in the panel rather than the sidebar.
//
// New Terminal ▸ Pi runs the same `piDock.command` in the same folder, with the same environment
// and the same session-recording extension as the sidebar, in VS Code's own terminal. No ttyd and
// no dtach: a panel terminal is VS Code's to keep alive, and it does. It does not resume on its
// own: a new panel terminal is a deliberate second Pi, and whichever Pi started last is the one
// the sidebar comes back to.

'use strict';

const vscode = require('vscode');
const { readSettings, workspaceCwd } = require('./settings');
const { statePath } = require('../lib/resume');

const PROFILE_ID = 'piDock.profile';

/**
 * Registers the profile. VS Code asks for it each time the person picks "Pi" in the terminal menu.
 *
 * @param {string} version Pi Dock's version, which Pi sees as PI_DOCK.
 * @param {string} sessionExtension Full path of pi/pi-dock-session.js, loaded with `-e`.
 * @returns {import('vscode').Disposable}
 */
function registerProfile(version, sessionExtension) {
  return vscode.window.registerTerminalProfileProvider(PROFILE_ID, {
    provideTerminalProfile() {
      const command = readSettings().command;
      const [shellPath, ...shellArgs] = command && command.length ? command : ['pi'];
      const cwd = workspaceCwd();
      return new vscode.TerminalProfile({
        name: 'Pi',
        shellPath,
        shellArgs: [...shellArgs, '-e', sessionExtension],
        cwd,
        env: { COLORTERM: 'truecolor', PI_DOCK: version, PI_DOCK_SESSION_STATE: statePath(cwd) },
        iconPath: new vscode.ThemeIcon('hubot'),
      });
    },
  });
}

module.exports = { PROFILE_ID, registerProfile };
