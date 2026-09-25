// Finding Pi's saved conversations for a folder, so one can be resumed or forked from a quick pick.
//
// Pi keeps each conversation as a JSONL file under ~/.pi/agent/sessions/<folder>/, where <folder>
// is the working directory with its leading slash removed and every slash, backslash and colon
// turned into a dash, wrapped in `--` (pi 0.87.0, dist/core/session-manager.js:293). The first
// line of a file is a `session` entry; a `session_info` entry, if any, carries the name given with
// `/name` (session-manager.js:915-922), and Pi itself takes the latest one (line 516).
//
// Only enough of each file is read to find the name and the first thing the person said. Nothing
// here changes a file.
//
// No VS Code here, so `node --test` can check it.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/** How much of one file is read: enough for any header and the first message, not a whole day. */
const MAX_HEAD_BYTES = 256 * 1024;
/** How much of the first user message is kept for the quick pick. */
const EXCERPT_CHARS = 80;

/**
 * Where Pi keeps the sessions of one folder.
 *
 * Pi's agent folder is `~/.pi/agent` unless `PI_CODING_AGENT_DIR` names another, and the Pi in the
 * sidebar is started with this process's environment, so the same variable decides for both.
 * Measured before this looked at it: with the variable set, Pi saved every session where it was
 * told to and Resume Session reported no saved sessions at all.
 *
 * @param {string} cwd The folder Pi runs in, as Pi Dock passes it to ttyd.
 * @param {string} [home] Defaults to the home folder.
 * @param {NodeJS.ProcessEnv} [env] Defaults to this process's environment.
 * @returns {string}
 */
function sessionDir(cwd, home = os.homedir(), env = process.env) {
  const safe = `--${path.resolve(cwd).replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
  const agent = env.PI_CODING_AGENT_DIR || path.join(home, '.pi', 'agent');
  return path.join(agent, 'sessions', safe);
}

/**
 * Reads the start of a session file and pulls out what the quick pick shows.
 *
 * @param {string} file Full path.
 * @returns {{ id: string, name: string|undefined, excerpt: string|undefined, startedAt: string|undefined }|null}
 *   Null when the file does not start with a `session` entry, which means it is not one of Pi's.
 */
function readSessionHead(file) {
  let text;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(MAX_HEAD_BYTES);
      const read = fs.readSync(fd, buffer, 0, MAX_HEAD_BYTES, 0);
      text = buffer.toString('utf8', 0, read);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    return null;
  }
  const lines = text.split('\n');
  lines.pop(); // the last line may be cut mid-entry by the byte limit
  let header = null;
  let name;
  let excerpt;
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (_) {
      continue;
    }
    if (!header) {
      if (!entry || entry.type !== 'session') return null;
      header = entry;
      continue;
    }
    if (entry.type === 'session_info') name = (entry.name || '').trim() || undefined; // latest wins; empty clears
    if (!excerpt && entry.type === 'message' && entry.message && entry.message.role === 'user') excerpt = userText(entry.message);
  }
  if (!header) return null;
  return { id: String(header.id || ''), name, excerpt, startedAt: header.timestamp };
}

/**
 * The text of a user message, shortened for a list.
 *
 * @param {{ content?: unknown }} message
 * @returns {string|undefined}
 */
function userText(message) {
  const content = message.content;
  const parts = typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter((p) => p && p.type === 'text').map((p) => p.text) : [];
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS - 1)}…` : text;
}

/**
 * Lists the sessions in one folder, newest first.
 *
 * @param {string} dir From sessionDir.
 * @returns {{ file: string, id: string, name: string|undefined, excerpt: string|undefined, modified: Date }[]}
 *   Empty when the folder does not exist. Files that are not sessions are left out.
 */
function listSessions(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl'));
  } catch (_) {
    return [];
  }
  const sessions = [];
  for (const name of names) {
    const file = path.join(dir, name);
    const head = readSessionHead(file);
    if (!head) continue;
    let modified;
    try {
      modified = fs.statSync(file).mtime;
    } catch (_) {
      continue;
    }
    sessions.push({ file, id: head.id, name: head.name, excerpt: head.excerpt, modified });
  }
  return sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

module.exports = { MAX_HEAD_BYTES, EXCERPT_CHARS, sessionDir, readSessionHead, listSessions };
