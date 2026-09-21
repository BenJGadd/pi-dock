'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { xtermOptions } = require('../lib/options');

const build = (terminal, editor, settings) => xtermOptions({ terminal: (k) => terminal[k], editor: (k) => editor[k], settings });

test('font family: terminal.integrated first, then editor, then piDock overrides', () => {
  assert.strictEqual(build({ fontFamily: 'A' }, { fontFamily: 'B' }, {}).fontFamily, 'A');
  assert.strictEqual(build({}, { fontFamily: 'B' }, {}).fontFamily, 'B');
  assert.strictEqual(build({ fontFamily: 'A' }, {}, { fontFamily: 'C' }).fontFamily, 'C');
  assert.ok(!('fontFamily' in build({}, {}, {})));
});

test('maps the terminal settings VS Code renders from', () => {
  const t = { fontSize: 14, lineHeight: 1, letterSpacing: 0, fontWeight: 'normal', fontWeightBold: 'bold', scrollback: 1000, minimumContrastRatio: 4.5, drawBoldTextInBrightColors: true, cursorStyle: 'line', cursorBlinking: false };
  const { cursorBlinking, ...rest } = t; // the VS Code setting is consumed, not passed through
  assert.deepStrictEqual(build(t, {}, {}), { ...rest, cursorStyle: 'bar', cursorBlink: false, vtExtensions: { kittyKeyboard: true }, windowsPty: { backend: 'winpty', buildNumber: 1 } });
});

test('cursor blinking is the boolean terminal setting; letterSpacing 0 is kept, empty values are not', () => {
  assert.strictEqual(build({ cursorBlinking: true }, {}, {}).cursorBlink, true);
  assert.strictEqual(build({}, {}, {}).cursorBlink, false);
  assert.strictEqual(build({ letterSpacing: 0, fontWeight: '' }, {}, {}).letterSpacing, 0);
  assert.ok(!('fontWeight' in build({ fontWeight: '' }, {}, {})));
});

test('piDock.fontSize overrides, clientOptions win over everything', () => {
  assert.strictEqual(build({ fontSize: 14 }, {}, { fontSize: 16 }).fontSize, 16);
  assert.strictEqual(build({ fontSize: 14 }, {}, {}).fontSize, 14);
  assert.strictEqual(build({ fontSize: 14 }, {}, { fontSize: 16, clientOptions: { fontSize: 20, scrollback: 5 } }).fontSize, 20);
});

test('Kitty keyboard follows terminal.integrated.enableKittyKeyboardProtocol, and is on when VS Code does not say', () => {
  assert.deepStrictEqual(build({}, {}, {}).vtExtensions, { kittyKeyboard: true });
  assert.deepStrictEqual(build({ enableKittyKeyboardProtocol: true }, {}, {}).vtExtensions, { kittyKeyboard: true });
  assert.deepStrictEqual(build({ enableKittyKeyboardProtocol: false }, {}, {}).vtExtensions, { kittyKeyboard: false });
});

test('reflow is turned off, because Pi repaints on resize and the rewrap only shows a wrong frame', () => {
  const options = xtermOptions({ terminal: () => undefined, editor: () => undefined, settings: { clientOptions: {} } });
  assert.deepStrictEqual(options.windowsPty, { backend: 'winpty', buildNumber: 1 });
});

test('clientOptions still wins, so reflow can be put back without editing the extension', () => {
  const options = xtermOptions({ terminal: () => undefined, editor: () => undefined, settings: { clientOptions: { windowsPty: {} } } });
  assert.deepStrictEqual(options.windowsPty, {});
});
