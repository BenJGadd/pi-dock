'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseLinks } = require('../page/links');

const only = (text) => {
  const links = parseLinks(text);
  assert.strictEqual(links.length, 1, `expected one link in ${JSON.stringify(text)}, got ${JSON.stringify(links)}`);
  return links[0];
};

test('a bare path is a link too, as in the terminal: what pi prints in every tool block', () => {
  // The extension says afterwards whether each is a file; here it is shape only.
  assert.deepStrictEqual(only('read src/util.ts'), { start: 5, end: 16, path: 'src/util.ts', line: 1, column: 1 });
  assert.strictEqual(only('edit src/util.ts.').path, 'src/util.ts', 'a full stop after it is the sentence, not the path');
  assert.strictEqual(only('see README.md, then').path, 'README.md');
  assert.strictEqual(only('the file (src/app.ts) is').path, 'src/app.ts');
  assert.strictEqual(only("'src/app.ts'").path, 'src/app.ts');
  assert.strictEqual(only('@src/util.ts').path, 'src/util.ts', "pi's own @ comes off");
  assert.strictEqual(only('/etc/hosts').path, '/etc/hosts');
  assert.strictEqual(only('e.g. this').path, 'e.g', 'shaped like a file: the extension will say it is not one');
});

test('the @path#L marker, single line and a range, and never also the path inside it', () => {
  assert.deepStrictEqual(only('see @src/foo.js#L3 there'), { start: 4, end: 18, path: 'src/foo.js', line: 3, column: 1 });
  assert.deepStrictEqual(only('@lib/x.js#L10-L20'), { start: 0, end: 17, path: 'lib/x.js', line: 10, column: 1 });
  assert.strictEqual(only('@a/b#L5-9').line, 5);
});

test('refused: times, URLs, bare words and numbers, colons inside words', () => {
  for (const text of ['at 12:30', 'https://example.com/x/y:1', 'ratio 3:4', 'a:1', 'error:12', 'foo::bar:3', '12:30:45', 'hello world', 'v1.5 released']) {
    assert.deepStrictEqual(parseLinks(text), [], text);
  }
});

