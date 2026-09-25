'use strict';

const test = require('node:test');
const assert = require('node:assert');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { persistentCommand } = require('../lib/dtach');
const { isInstalled } = require('../lib/executable');

test('persistent command attaches-or-creates, repaints on attach, and steals no keys', () => {
  assert.deepStrictEqual(
    persistentCommand({ dtachPath: 'dtach', socket: '/s', command: ['pi', '-c'] }),
    ['dtach', '-A', '/s', '-r', 'winch', '-E', '-z', 'pi', '-c'],
  );
});

// Needs the real tools; skipped where they are not installed.
const real = isInstalled('dtach') && !cp.spawnSync('pkill', ['--version'], { stdio: 'ignore' }).error;

