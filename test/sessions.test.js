'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sessionDir, readSessionHead, MAX_HEAD_BYTES } = require('../lib/sessions');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidock-sessions-'));
const line = (entry) => `${JSON.stringify(entry)}\n`;
const header = (id) => line({ type: 'session', version: 3, id, timestamp: '2026-09-22T10:00:00.000Z', cwd: '/w' });
const user = (text) => line({ type: 'message', id: 'm', parentId: null, message: { role: 'user', content: [{ type: 'text', text }] } });
const write = (name, text, mtime) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  fs.utimesSync(file, mtime, mtime);
  return file;
};

test('the session folder is spelled the way pi spells it', () => {
  assert.strictEqual(sessionDir('/home/me/projects/app', '/home/me'), '/home/me/.pi/agent/sessions/--home-me-projects-app--');
  assert.strictEqual(sessionDir('/home/me/projects/app/', '/home/me'), '/home/me/.pi/agent/sessions/--home-me-projects-app--');
  assert.strictEqual(sessionDir('/', '/home/me'), '/home/me/.pi/agent/sessions/----');
  assert.strictEqual(sessionDir('/home/me/projects/app', '/home/me', { PI_CODING_AGENT_DIR: '/tmp/agent' }), '/tmp/agent/sessions/--home-me-projects-app--', 'the folder pi was told to use');
  assert.strictEqual(sessionDir('/home/me/projects/app', '/home/me', {}), '/home/me/.pi/agent/sessions/--home-me-projects-app--', 'and the default without it');
});

test('only the head of a big file is read, and a line cut by the limit is ignored rather than misread', () => {
  const filler = line({ type: 'message', id: 'f', message: { role: 'assistant', content: [{ type: 'text', text: 'y'.repeat(1000) }] } });
  const body = header('id-c') + filler.repeat(Math.ceil(MAX_HEAD_BYTES / filler.length) + 2) + user('too late');
  const head = readSessionHead(write('c.jsonl', body, new Date(4000)));
  assert.strictEqual(head.id, 'id-c');
  assert.strictEqual(head.excerpt, undefined);
});

