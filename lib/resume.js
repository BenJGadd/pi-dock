// Coming back to the same Pi conversation after the window closes.
//
// Closing or reloading the window ends Pi (see endSession in ../extension.js), so the next start
// is a new process. What makes it feel like the same session is Pi's own `--session <file>`: Pi
// keeps every conversation as a file, and starting on that file continues it. The only question is
// which file, and that is what the state file here answers: one small JSON per workspace folder,
// written by the Pi extension in ../pi/pi-dock-session.js each time Pi starts or switches a
// session, read here before each start.
//
// The state lives under $XDG_STATE_HOME (else ~/.local/state), where a machine keeps things that
// should survive a reboot but are not configuration.
//
// No VS Code here, so `node --test` can check it.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** The environment variable naming the state file for the Pi that Pi Dock starts. */
const STATE_ENV = 'PI_DOCK_SESSION_STATE';

/**
 * Where the state files go.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home]
 * @returns {string}
 */
function stateDir(env = process.env, home = os.homedir()) {
  return path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'pi-dock');
}

/**
 * The state file for one workspace folder.
 *
 * @param {string} workspace Full path of the folder, which decides the name.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home]
 * @returns {string} The same folder always gets the same path.
 */
function statePath(workspace, env = process.env, home = os.homedir()) {
  const id = crypto.createHash('sha256').update(workspace).digest('hex').slice(0, 16);
  return path.join(stateDir(env, home), `${id}.json`);
}

/**
 * @typedef {object} SessionState
 * @property {string} sessionFile Pi's session file, absolute.
 * @property {string} sessionId Pi's id for it.
 * @property {string} updatedAt ISO time of the last write.
 */

/**
 * Reads a state file.
 *
 * @param {string} file
 * @returns {SessionState|null} Null when missing, unreadable, or not the expected shape.
 */
function readState(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!state || typeof state.sessionFile !== 'string' || !state.sessionFile || typeof state.sessionId !== 'string') return null;
    return { sessionFile: state.sessionFile, sessionId: state.sessionId, updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : '' };
  } catch (_) {
    return null;
  }
}

/**
 * Writes a state file. Written beside its final name and renamed, so a reader never sees half a
 * file. The folder is created readable only by you.
 *
 * @param {string} file
 * @param {{ sessionFile: string, sessionId: string }} state
 * @param {Date} [now]
 */
function writeState(file, state, now = new Date()) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ sessionFile: state.sessionFile, sessionId: state.sessionId, updatedAt: now.toISOString() }, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * Removes a state file, so the next start is a fresh session. Missing is fine.
 *
 * @param {string} file
 */
function clearState(file) {
  fs.rmSync(file, { force: true });
}

/**
 * The arguments that put Pi back in its last session: `--session <file>` when the setting is on,
 * a session is recorded and its file still exists; nothing otherwise.
 *
 * @param {object} args
 * @param {boolean} args.resume The `piDock.resume` setting.
 * @param {SessionState|null} args.state From readState.
 * @param {(file: string) => boolean} [args.exists] Replaceable for tests.
 * @returns {string[]}
 */
function resumeArgs({ resume, state, exists = fs.existsSync }) {
  if (!resume || !state || !exists(state.sessionFile)) return [];
  return ['--session', state.sessionFile];
}

module.exports = { STATE_ENV, stateDir, statePath, readState, writeState, clearState, resumeArgs };
