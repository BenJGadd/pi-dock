'use strict';

const test = require('node:test');
const assert = require('node:assert');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sessionSocket, persistentCommand, killSession } = require('../lib/session');
const { isInstalled } = require('../lib/executable');

test('one socket per workspace, stable, inside the runtime dir', () => {
  const a = sessionSocket('/work/a', '/run/user/1');
  assert.strictEqual(a, sessionSocket('/work/a', '/run/user/1'));
  assert.notStrictEqual(a, sessionSocket('/work/b', '/run/user/1'));
  assert.match(a, /^\/run\/user\/1\/pi-dock-[0-9a-f]{16}\.sock$/);
});

test('persistent command attaches-or-creates, repaints on attach, and steals no keys', () => {
  assert.deepStrictEqual(
    persistentCommand({ dtachPath: 'dtach', socket: '/s', command: ['pi', '-c'] }),
    ['dtach', '-A', '/s', '-r', 'winch', '-E', '-z', 'pi', '-c'],
  );
});

// Needs the real tools; skipped where they are not installed.
const real = isInstalled('dtach') && !cp.spawnSync('pkill', ['--version'], { stdio: 'ignore' }).error;

test('killSession ends the session and everything running in it, and removes the socket', { skip: !real }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidock-'));
  const socket = sessionSocket('/kill/test', dir);
  // A wrapper that launches Pi's stand-in as a child, like a shell-script `pi` would.
  cp.spawnSync('dtach', ['-n', socket, '-E', '-z', 'sh', '-c', 'sleep 5000; true']);
  const alive = () => cp.spawnSync('pgrep', ['-f', '--', `^dtach .*${socket.replace(/[.]/g, '\\.')}`], { encoding: 'utf8' }).stdout.trim() !== '';
  const sleeping = () => cp.spawnSync('pgrep', ['-f', '--', 'sleep 5000'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).length;
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(alive() && fs.existsSync(socket), 'session should be running');

  assert.strictEqual(killSession(socket, 'dtach'), true);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!alive(), 'master should be gone');
  assert.ok(!fs.existsSync(socket), 'socket should be removed');
  assert.strictEqual(sleeping(), 0, 'nothing may survive the master, wrapper or child');
  fs.rmSync(dir, { recursive: true, force: true });
});
