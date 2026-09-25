'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mentionToken } = require('../lib/mentions');

const cwd = path.resolve('/work/app');
const file = (rel) => path.join(cwd, rel);
const noDirs = () => false;
const dirs = (...names) => (p) => names.includes(p);

test('a directory ends in a slash, as Pi completes it; the workspace folder itself is its own full path', () => {
  assert.strictEqual(mentionToken(file('src'), cwd, dirs(file('src'))), '@src/');
  assert.strictEqual(mentionToken(cwd, cwd, dirs(cwd)), `@${cwd.split(path.sep).join('/')}/`);
});

test('a path with a space is wrapped the way Pi wraps it: @"…"', () => {
  assert.strictEqual(mentionToken(file('my docs/notes.md'), cwd, noDirs), '@"my docs/notes.md"');
  assert.strictEqual(mentionToken(file('my docs'), cwd, dirs(file('my docs'))), '@"my docs/"');
  assert.strictEqual(mentionToken(file('a，b.txt'), cwd, noDirs), '@"a，b.txt"', 'CJK punctuation also separates words in Pi');
  assert.strictEqual(mentionToken(file('日本語.txt'), cwd, noDirs), '@日本語.txt', 'CJK letters need no quotes');
});

