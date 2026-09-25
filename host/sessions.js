// Which Pi session the next start joins: the one recorded last time, or one the person picked.
//
// A start is always a new Pi process (extension.js endSession says why), so the conversation
// continues only because the process is pointed at a session file. Three places decide which:
// Resume Session and Fork Session, for one start; the state file lib/resume.js keeps, for every
// start after that; and New Session, which forgets the state so the start is plain. The state is
// written by a small Pi extension shipped in pi/, which every Pi started here is given.

'use strict';

const vscode = require('vscode');
const { workspaceCwd } = require('./settings');
const { statePath, readState, resumeArgs, clearState } = require('../lib/resume');
const { sessionDir, listSessions } = require('../lib/sessions');

/**
 * @param {object} deps
 * @param {import('vscode').ExtensionContext} deps.context Where pi/ is, for the extension path.
 * @param {() => Promise<void>} deps.restart Ends Pi and starts it again; the next start reads
 *   `startCommand`.
 * @returns {{
 *   startCommand: (settings: import('../types').Settings) => string[],
 *   started: () => void,
 *   extensionPath: () => string,
 *   newSession: () => Promise<void>,
 *   resumeSession: () => Promise<void>,
 *   forkSession: () => Promise<void>,
 * }}
 */
function createSessions({ context, restart }) {
  /** @type {string[]} arguments for the next Pi start only, from Resume Session or Fork Session */
  let nextStartArgs = [];

  /** The state file for this workspace's Pi session. */
  const stateFile = () => statePath(workspaceCwd());

  /** The Pi extension shipped in pi/ that writes that file. */
  const extensionPath = () => vscode.Uri.joinPath(context.extensionUri, 'pi', 'pi-dock-session.js').fsPath;

  /**
   * The command for the next Pi: `piDock.command`, then the one-shot arguments from Resume Session
   * or Fork Session, or failing those `--session <file>` for the session recorded at the last start
   * (lib/resume.js, when `piDock.resume` is on and the file still exists), then the extension that
   * records the session for the start after this one. Pi reads `-e` alongside its other flags.
   *
   * @param {import('../types').Settings} settings
   * @returns {string[]}
   */
  function startCommand(settings) {
    const base = settings.command && settings.command.length ? settings.command : ['pi'];
    const session = nextStartArgs.length ? nextStartArgs : resumeArgs({ resume: settings.resume, state: readState(stateFile()) });
    return [...base, ...session, '-e', extensionPath()];
  }

  /** A start happened (or was not needed): the one-shot arguments are spent. */
  function started() {
    nextStartArgs = [];
  }

  /**
   * "Pi Dock: New Session": forgets the recorded session and starts Pi plain, so the next window
   * start comes back to this fresh one rather than the old.
   *
   * @async
   * @returns {Promise<void>}
   */
  async function newSession() {
    clearState(stateFile());
    nextStartArgs = [];
    await restart();
  }

  /**
   * Offers Pi's saved sessions for this folder and restarts Pi on the chosen one.
   *
   * @async
   * @param {'Resume'|'Fork'} verb For the prompt.
   * @param {string[]} flag `['--session']` or `['--fork']`; the file follows it.
   * @returns {Promise<void>}
   */
  async function pickSession(verb, flag) {
    const sessions = listSessions(sessionDir(workspaceCwd()));
    if (sessions.length === 0) {
      vscode.window.showInformationMessage(`Pi Dock: no saved Pi sessions for ${workspaceCwd()}.`);
      return;
    }
    const chosen = await vscode.window.showQuickPick(
      sessions.map((session) => ({
        label: session.name || session.excerpt || session.id,
        description: session.modified.toLocaleString(),
        detail: session.name && session.excerpt ? session.excerpt : undefined,
        session,
      })),
      { placeHolder: `${verb} which session? This ends the Pi that is running now.`, matchOnDescription: true, matchOnDetail: true },
    );
    if (!chosen) return;
    nextStartArgs = [...flag, chosen.session.file];
    await restart();
  }

  return {
    startCommand,
    started,
    extensionPath,
    newSession,
    resumeSession: () => pickSession('Resume', ['--session']),
    forkSession: () => pickSession('Fork', ['--fork']),
  };
}

module.exports = { createSessions };
