'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isInstalled } = require('../lib/executable');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidock-exe-'));
const write = (name, mode) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, '#!/bin/sh\ntrue\n', { mode });
  return file;
};
const runnable = write('pi', 0o755);
const notRunnable = write('pi-no-x', 0o644);
fs.mkdirSync(path.join(dir, 'pi-dir'));

test('a bare name is found on PATH, and only there', () => {
  assert.strictEqual(isInstalled('pi', { PATH: dir }, 'linux'), true);
  assert.strictEqual(isInstalled('pi', { PATH: '/nowhere' }, 'linux'), false);
  assert.strictEqual(isInstalled('pi', {}, 'linux'), false, 'no PATH at all must not throw');
});

test('PATH is searched in order, and empty entries are skipped', () => {
  assert.strictEqual(isInstalled('pi', { PATH: `/nowhere:${dir}` }, 'linux'), true);
  assert.strictEqual(isInstalled('pi', { PATH: `::${dir}:` }, 'linux'), true);
});

test('a name with a slash is taken as a path and not looked up on PATH', () => {
  assert.strictEqual(isInstalled(runnable, { PATH: '/nowhere' }, 'linux'), true);
  assert.strictEqual(isInstalled('/nonexistent/pi', { PATH: dir }, 'linux'), false);
});

test('a file that exists but cannot be run counts as missing', () => {
  assert.strictEqual(isInstalled(notRunnable, {}, 'linux'), false);
  assert.strictEqual(isInstalled('pi-no-x', { PATH: dir }, 'linux'), false);
});

test('a directory of the right name is not a program', () => {
  assert.strictEqual(isInstalled('pi-dir', { PATH: dir }, 'linux'), false);
});

test('nothing is a program', () => {
  for (const nothing of ['', undefined, null]) assert.strictEqual(isInstalled(nothing, { PATH: dir }, 'linux'), false);
});

test('on Windows a bare name is tried with each PATHEXT ending, and there is no execute bit', () => {
  const exe = write('pic.EXE', 0o644); // no execute bit: Windows does not have one
  assert.strictEqual(isInstalled('pic', { PATH: dir, PATHEXT: '.COM;.EXE' }, 'win32'), true);
  assert.strictEqual(isInstalled('pic', { PATH: dir, PATHEXT: '.COM' }, 'win32'), false);
  assert.strictEqual(isInstalled(exe, {}, 'win32'), true, 'a name that already has an ending is used as it is');
  assert.strictEqual(isInstalled('pic', { PATH: dir }, 'win32'), true, 'PATHEXT has a sensible default');
});

test('on Windows a backslash also means "this is a path"', () => {
  assert.strictEqual(isInstalled('C:\\nowhere\\pi.exe', { PATH: dir }, 'win32'), false);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
