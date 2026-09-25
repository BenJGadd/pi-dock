'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { xtermOptions, unicodeVersion } = require('../lib/options');

const build = (terminal, editor, settings) => xtermOptions({ terminal: (k) => terminal[k], editor: (k) => editor[k], settings });

test('Kitty keyboard follows terminal.integrated.enableKittyKeyboardProtocol, and is on when VS Code does not say', () => {
  assert.deepStrictEqual(build({}, {}, {}).vtExtensions, { kittyKeyboard: true });
  assert.deepStrictEqual(build({ enableKittyKeyboardProtocol: true }, {}, {}).vtExtensions, { kittyKeyboard: true });
  assert.deepStrictEqual(build({ enableKittyKeyboardProtocol: false }, {}, {}).vtExtensions, { kittyKeyboard: false });
});

test('reflow is turned off, because Pi repaints on resize and the rewrap only shows a wrong frame', () => {
  const options = xtermOptions({ terminal: () => undefined, editor: () => undefined, settings: { clientOptions: {} } });
  assert.deepStrictEqual(options.windowsPty, { backend: 'winpty', buildNumber: 1 });
});


test('the width table is Unicode 11 unless terminal.integrated.unicodeVersion says 6, so an emoji is two cells as it is for Pi', () => {
  assert.strictEqual(unicodeVersion(() => undefined), '11');
  assert.strictEqual(unicodeVersion(() => '11'), '11');
  assert.strictEqual(unicodeVersion(() => '6'), '6');
});

test('proposed API is allowed, because the width table is set through one and the page is blank without it', () => {
  assert.strictEqual(build({}, {}, {}).allowProposedApi, true);
});
