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
});

test('no explicit activation events: VS Code derives them from the views and commands this manifest contributes', () => {
  assert.ok(!('activationEvents' in pkg));
  const [major, minor] = pkg.engines.vscode.replace(/[^0-9.]/g, '').split('.').map(Number);
  assert.ok(major > 1 || minor >= 74, 'implicit onView/onCommand activation needs VS Code 1.74 or newer');
  assert.ok(pkg.contributes.views && pkg.contributes.commands.length > 0, 'there must be a view or command left to activate on');
});

test('the toggle chord is bound, and its command is escaped by default so the chord leaves the terminal', () => {
  // Two bindings on one chord: the toggle everywhere, and a plain "back to the editor" while the
  // view itself has focus, which does not depend on the page noticing that it lost focus.
  assert.deepStrictEqual(pkg.contributes.keybindings.map((k) => k.command), ['piDock.toggle', 'workbench.action.focusActiveEditorGroup']);
  assert.strictEqual(pkg.contributes.keybindings[1].when, 'focusedView == piDock.terminal');
  assert.ok(pkg.contributes.configuration.properties['piDock.escapeActions'].default.includes('piDock.toggle'));
});

test('every step waits for a key this extension publishes, and none of them speaks before a page opens', () => {
  // A key that is already true the first time a walkthrough opens never ticks its step, so the
  // checks stay silent until then. Getting this wrong is invisible in the tests that matter to
  // the code and obvious to anyone who has the programs installed, which is why it is asserted
  // here rather than left to a screenshot.
  const steps = pkg.contributes.walkthroughs[0].steps;
  const setup = fs.readFileSync(path.join(root, 'host/setup.js'), 'utf8');
  assert.strictEqual(steps.length, 4);
  for (const step of steps) {
    assert.strictEqual(step.completionEvents.length, 1, `${step.id} completes on one thing`);
    const [event] = step.completionEvents;
    assert.ok(event.startsWith('onContext:'), `${step.id} completes on a context key`);
    assert.ok(setup.includes(`'${event.slice('onContext:'.length)}'`), `${event} is not published by the check`);
  }
  assert.match(setup, /setContext', key, pageSeen && found/, 'a program key says nothing until a page is open');
  assert.match(setup, /setContext', SIDEBAR_KEY, pageSeen && sidebarOpened\(\)/, 'nor does the sidebar key');
  assert.match(setup, /onDidChangeTabs/, 'and a page opening is what makes them speak');
});

// Nothing in the extension host can be loaded here (`require('vscode')` only exists inside an
// editor), so the wiring between the files is checked by reading them instead.
const sources = ['extension.js', 'types.js', ...['host', 'lib'].flatMap((dir) => fs.readdirSync(path.join(root, dir)).map((f) => `${dir}/${f}`))];
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

test('the package carries only what the extension needs to run and what the editor shows about it', () => {
  const ignored = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const left of ['test/**', 'tools/**', 'docs/**', 'media/screenshots/**', 'types.js']) assert.ok(ignored.includes(left), `${left} is not part of the extension`);
  for (const dir of ['host/', 'lib/', 'page/', 'pi/', 'media/walkthrough']) assert.ok(!ignored.some((p) => p.startsWith(dir)), `${dir} must be packaged`);
  assert.ok(!/require\('\.\.?\/types'\)/.test(fs.readFileSync(path.join(root, 'extension.js'), 'utf8')), 'types.js is comments, so leaving it out costs nothing');
});

test('the vendored xterm still switches reflow off for a windowsPty that is not conpty', () => {
  // lib/options.js sets windowsPty for this side effect alone. If an xterm upgrade changes the rule,
  // this fails rather than the resize quietly going back to flashing.
  const src = fs.readFileSync(path.join(root, 'page', 'xterm', 'xterm.js'), 'utf8');
  assert.match(src, /_isReflowEnabled\(\)\{[\s\S]{0,200}?windowsPty[\s\S]{0,200}?conpty/);
});

test('the VS Code badge in the README states the floor the manifest enforces', () => {
  // The badge is what a person reads; engines.vscode is what the editor refuses to install below.
  // They drifted once: a badge said 1.90 over a manifest that said 1.75.
  const floor = pkg.engines.vscode.replace(/^\^/, '').replace(/\.0$/, '');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.ok(readme.includes(`VS%20Code-${floor}%2B-`), `the README badge must say VS Code ${floor}+`);
  assert.ok(readme.includes(`VS Code ${floor} or newer`), 'and its alt text must agree');
  assert.ok(readme.includes(`VSCodium-${floor}%2B-`), 'VSCodium shares the floor, so its badge says the same');
});
