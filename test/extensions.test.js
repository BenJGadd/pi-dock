'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { declaredExtensions, extensionFlags } = require('../lib/extensions');

const root = path.resolve('/ext/a');
const ext = (extensionPath, pi) => ({ extensionPath, packageJSON: pi === undefined ? {} : { pi } });

test('a manifest may offer only its own files: relative paths resolve inside it, escapes and missing files are dropped, repeats once', () => {
  const present = new Set([path.join(root, 'pi', 'one.js'), path.join(root, 'two.ts')]);
  const exists = (file) => present.has(file);
  const found = declaredExtensions(
    [
      ext(root, { extensions: ['pi/one.js', 'two.ts', '../outside.js', 'missing.js', 'pi/one.js', 7, ''] }),
      ext('/ext/b', { extensions: 'pi/one.js' }), // not an array
      ext('/ext/c'), // nothing declared
    ],
    exists,
  );
  assert.deepStrictEqual(found, [path.join(root, 'pi', 'one.js'), path.join(root, 'two.ts')]);
  assert.deepStrictEqual(extensionFlags(found), ['-e', found[0], '-e', found[1]]);
});
