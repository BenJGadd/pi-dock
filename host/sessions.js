// Which Pi session the next start joins: the last one in this folder, or one the person picked.
//
// A start is always a new Pi process (extension.js endSession says why), so the conversation
// continues only because the process is told which one. Three places decide: Resume Session and
// Fork Session, for one start; Pi's own `-c` (lib/resume.js) for every start after that; and New
// Session, which makes the one start that follows plain.

'use strict';

const vscode = require('vscode');
const { workspaceCwd } = require('./settings');
const { resumeArgs } = require('../lib/resume');
const { extensionFlags } = require('../lib/extensions');
const { sessionDir, listSessions } = require('../lib/sessions');

/**
 * @param {object} deps
 * @param {() => string[]} deps.piExtensions The Pi extensions to load with `-e` (host/extensions.js).
 * @param {() => Promise<void>} deps.restart Ends Pi and starts it again; the next start reads
 *   `startCommand`.
 * @returns {{
 *   startCommand: (settings: import('../types').Settings) => string[],
 *   started: () => void,
 *   newSession: () => Promise<void>,
 *   resumeSession: () => Promise<void>,
 *   forkSession: () => Promise<void>,
 * }}
 */
function createSessions({ restart, piExtensions }) {
  /** @type {string[]} arguments for the next Pi start only, from Resume Session or Fork Session */
  let nextStartArgs = [];

  /** Whether the next start is plain: no `-c`, from New Session. */
  let plainNext = false;

  /**
   * The command for the next Pi: `piDock.command`, then the one-shot arguments from Resume Session
   * or Fork Session, or nothing after New Session, or failing those `-c` (lib/resume.js, when
   * `piDock.resume` is on), then `-e` for each Pi extension an installed VS Code extension carries
   * (host/extensions.js).
   *
   * @param {import('../types').Settings} settings
   * @returns {string[]}
   */
  function startCommand(settings) {
    const base = settings.command && settings.command.length ? settings.command : ['pi'];
    const session = nextStartArgs.length ? nextStartArgs : plainNext ? [] : resumeArgs({ resume: settings.resume });
    return [...base, ...session, ...extensionFlags(piExtensions())];
  }

  /** A start happened (or was not needed): the one-shot arguments are spent. */
  function started() {
    nextStartArgs = [];
    plainNext = false;
  }

  /**
   * "Pi Dock: New Session": starts Pi plain. The fresh session is then the newest in the folder,
   * so the next window start comes back to it rather than the old.
   *
   * @async
   * @returns {Promise<void>}
   */
  async function newSession() {
    nextStartArgs = [];
    plainNext = true;
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
    newSession,
    resumeSession: () => pickSession('Resume', ['--session']),
    forkSession: () => pickSession('Fork', ['--fork']),
  };
}

module.exports = { createSessions };
