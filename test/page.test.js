'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PAGE_SCRIPTS, XTERM_SCRIPTS, terminalHtml } = require('../lib/webview');

const page = path.join(__dirname, '..', 'page');
const config = { wsUrl: 'ws://127.0.0.1:1/t/ws', options: {}, theme: {}, keys: { escape: [], terminal: {} }, restore: null };

test('every page script exists, and the page loads them after xterm, in the listed order', () => {
  for (const file of [...XTERM_SCRIPTS, ...PAGE_SCRIPTS]) assert.ok(fs.existsSync(path.join(page, file)), `${file} is missing under page/`);
  const html = terminalHtml({ cspSource: 'https://x', asset: (file) => `https://x/${file}`, config });
  const loaded = [...html.matchAll(/<script src="https:\/\/x\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepStrictEqual(loaded, [...XTERM_SCRIPTS, ...PAGE_SCRIPTS]);
  assert.deepStrictEqual(fs.readdirSync(page).filter((f) => f.endsWith('.js')).sort(), [...PAGE_SCRIPTS].sort(), 'every script under page/ is loaded, and nothing else');
});

test('the page files share one scope, so no two declare the same top-level name', () => {
  const owner = new Map();
  for (const file of PAGE_SCRIPTS) {
    const source = fs.readFileSync(path.join(page, file), 'utf8');
    for (const [, name] of source.matchAll(/^(?:const|let|var|function|class)\s+([\w$]+)/gm)) {
      assert.ok(!owner.has(name), `${name} is declared in both ${owner.get(name)} and ${file}`);
      owner.set(name, file);
    }
  }
  assert.ok(owner.size > 40, 'the helpers are still there');
});

