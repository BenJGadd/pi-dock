'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('every file the manifest points at exists, and the icon keeps its licence beside it', () => {
  const views = Object.values(pkg.contributes.views).flat();
  const files = [pkg.main, pkg.icon, ...pkg.contributes.viewsContainers.activitybar.map((c) => c.icon), ...views.map((v) => v.icon).filter(Boolean)];
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), `${f} is referenced by package.json but missing`);
  assert.ok(fs.existsSync(path.join(root, 'media', 'pi-icon-LICENSE.txt')), 'the icon is copied from an MIT project and needs its licence');
});

test('the activity bar icon is a single-colour SVG that takes its colour from the host', () => {
  const svg = fs.readFileSync(path.join(root, pkg.contributes.viewsContainers.activitybar[0].icon), 'utf8');
  assert.match(svg, /<svg[\s>]/);
  assert.ok(!/fill="#/.test(svg), 'a hard-coded fill would ignore the theme');
});

test('there is exactly one action in the view title, and it is the restart icon', () => {
  const actions = pkg.contributes.menus['view/title'];
  assert.deepStrictEqual(actions.map((a) => a.command), ['piDock.restart']);
  assert.strictEqual(pkg.contributes.commands.find((c) => c.command === 'piDock.restart').icon, '$(debug-restart)');
});

test('no explicit activation events: VS Code derives them from the views and commands this manifest contributes', () => {
  assert.ok(!('activationEvents' in pkg));
  const [major, minor] = pkg.engines.vscode.replace(/[^0-9.]/g, '').split('.').map(Number);
  assert.ok(major > 1 || minor >= 74, 'implicit onView/onCommand activation needs VS Code 1.74 or newer');
  assert.ok(pkg.contributes.views && pkg.contributes.commands.length > 0, 'there must be a view or command left to activate on');
});

test('the extension icon is a PNG of at least 128px, as the marketplace requires', () => {
  const png = fs.readFileSync(path.join(root, pkg.icon));
  assert.strictEqual(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.ok(png.readUInt32BE(16) >= 128 && png.readUInt32BE(20) >= 128, 'width and height must both be at least 128');
});

test('the manifest names its repository, which vsce warns about when missing', () => {
  assert.strictEqual(pkg.repository.type, 'git');
  assert.match(pkg.repository.url, /^https:\/\/github\.com\/[^/]+\/pi-dock\.git$/);
});

// Nothing in the extension host can be loaded here (`require('vscode')` only exists inside an
// editor), so the wiring between the files is checked by reading them instead.
const sources = ['extension.js', 'types.js', 'host/settings.js', 'host/server.js', 'host/keys.js', ...fs.readdirSync(path.join(root, 'lib')).map((f) => `lib/${f}`)];
const requiresIn = (file) => [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/require\('(\.[^']+)'\)/g)].map((m) => m[1]);

test('every file one module requires from another exists', () => {
  for (const file of sources) {
    for (const target of requiresIn(file)) {
      const resolved = path.resolve(path.dirname(path.join(root, file)), `${target}.js`);
      assert.ok(fs.existsSync(resolved), `${file} requires ${target}, which is missing`);
    }
  }
});

test('lib/ stays free of vscode, so plain Node can test it; host/ is where the editor is used', () => {
  for (const file of sources.filter((f) => f.startsWith('lib/'))) {
    assert.ok(!/require\('vscode'\)/.test(fs.readFileSync(path.join(root, file), 'utf8')), `${file} must not require vscode`);
  }
  assert.ok(/require\('vscode'\)/.test(fs.readFileSync(path.join(root, 'host/server.js'), 'utf8')));
});

test('the packaged extension ships the code and the vendored terminal, and leaves the tests out', () => {
  const ignored = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  assert.ok(ignored.includes('test/**'), 'the tests are not part of the extension');
  for (const dir of ['host', 'lib', 'media']) assert.ok(!ignored.some((p) => p.startsWith(dir)), `${dir}/ must be packaged`);
});

test('types.js is comments only: requiring it has no runtime behaviour at all', () => {
  assert.deepStrictEqual(require('../types'), {}, 'the typedefs must stay free of code, so any layer can refer to them');
});

test('the vendored xterm still switches reflow off for a windowsPty that is not conpty', () => {
  // lib/options.js sets windowsPty for this side effect alone. If an xterm upgrade changes the rule,
  // this fails rather than the resize quietly going back to flashing.
  const src = fs.readFileSync(path.join(root, 'media', 'xterm', 'xterm.js'), 'utf8');
  assert.match(src, /_isReflowEnabled\(\)\{[\s\S]{0,200}?windowsPty[\s\S]{0,200}?conpty/);
});
