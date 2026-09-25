'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { STATE_ENV, readState, resumeArgs } = require('../lib/resume');

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pi-dock-resume-'));

test('resume arguments: only with the setting on, a recorded session, and its file still there', () => {
  const state = { sessionFile: '/s/1.jsonl', sessionId: 'abc', updatedAt: '' };
  assert.deepStrictEqual(resumeArgs({ resume: true, state, exists: () => true }), ['--session', '/s/1.jsonl']);
  assert.deepStrictEqual(resumeArgs({ resume: true, state, exists: () => false }), []);
  assert.deepStrictEqual(resumeArgs({ resume: false, state, exists: () => true }), []);
  assert.deepStrictEqual(resumeArgs({ resume: true, state: null, exists: () => true }), []);
});

test('the Pi extension writes the state on session_start, and stays quiet without the variable', async () => {
  const dir = scratch();
  const file = path.join(dir, 'state.json');
  const load = async () => (await import(`${pathToFileURL(path.join(__dirname, '..', 'pi', 'pi-dock-session.js')).href}?t=${Date.now()}`)).default;
  const handlers = {};
  const pi = { on: (name, handler) => { handlers[name] = handler; } };

  const saved = process.env[STATE_ENV];
  delete process.env[STATE_ENV];
  try {
    (await load())(pi);
    assert.deepStrictEqual(Object.keys(handlers), [], 'nothing registered without PI_DOCK_SESSION_STATE');

    process.env[STATE_ENV] = file;
    (await load())(pi);
    assert.deepStrictEqual(Object.keys(handlers), ['session_start']);
    const ctx = (sessionFile, sessionId) => ({ sessionManager: { getSessionFile: () => sessionFile, getSessionId: () => sessionId } });
    await handlers.session_start({ type: 'session_start', reason: 'startup' }, ctx('/s/2.jsonl', 'id2'));
    assert.strictEqual(readState(file).sessionFile, '/s/2.jsonl');
    assert.strictEqual(readState(file).sessionId, 'id2');
    await handlers.session_start({ type: 'session_start', reason: 'new' }, ctx(undefined, 'id3')); // --no-session
    assert.strictEqual(readState(file).sessionFile, '/s/2.jsonl', 'an unsaved session leaves the last saved one recorded');
    await handlers.session_start({ type: 'session_start', reason: 'resume' }, ctx('/s/4.jsonl', 'id4'));
    assert.strictEqual(readState(file).sessionFile, '/s/4.jsonl');
  } finally {
    if (saved === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = saved;
  }
});
