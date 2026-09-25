'use strict';

const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const cp = require('child_process');
const { buildArgs, ttydEnv, freePort, waitForPort } = require('../lib/ttyd');

const base = { port: 1234, token: 'tok', platform: 'linux' };
const args = (settings, extra) => buildArgs({ ...base, settings, ...extra });

test('binds loopback only, one client, token path', () => {
  const a = args({});
  assert.deepStrictEqual(a.slice(a.indexOf('-m'), a.indexOf('-m') + 2), ['-m', '1']);
  assert.strictEqual(a[a.indexOf('-i') + 1], 'lo');
  assert.strictEqual(a[a.indexOf('-b') + 1], '/tok');
  const mac = buildArgs({ ...base, settings: {}, platform: 'darwin' });
  assert.strictEqual(mac[mac.indexOf('-i') + 1], 'lo0');
});

test('waitForPort resolves when listening and rejects on early failure', async () => {
  const port = await freePort();
  const srv = net.createServer().listen(port, '127.0.0.1');
  await waitForPort(port, () => null, 2000);
  srv.close();
  await assert.rejects(waitForPort(await freePort(), () => new Error('died'), 2000), /died/);
});

/*
 * Why COLORTERM is set. Pi's only truecolor hint for a terminal it does not recognise is
 * COLORTERM=truecolor|24bit, and ttyd sets only TERM=xterm-256color, so without it Pi quantises
 * its theme to xterm's 256 stock colours: message and tool boxes come out as saturated
 * #00005f navy and #005f00 green instead of the theme's muted backgrounds.
 *
 * Measured with the real Pi (0.85.1) under a pty, counting colour escape sequences at startup:
 *
 *   environment              24-bit (38;2 / 48;2)   256-colour (38;5 / 48;5)
 *   no COLORTERM                       0                     168
 *   COLORTERM=truecolor              168                       0
 */

test('COLORTERM reaches the command through the real ttyd', { skip: cp.spawnSync('ttyd', ['-v'], { stdio: 'ignore' }).error }, async () => {
  const port = await freePort();
  const ttyd = cp.spawn('ttyd', buildArgs({ settings: { command: ['sh', '-c', 'echo COLORTERM=[$COLORTERM] TERM_PROGRAM=[$TERM_PROGRAM]'] }, port, token: 'tok' }), {
    env: ttydEnv({ PATH: process.env.PATH, COLORTERM: 'inherited-and-wrong', TERM_PROGRAM: '' }),
    stdio: 'ignore',
  });
  try {
    await waitForPort(port, () => null, 5000);
    const seen = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/tok/ws`, ['tty']);
      ws.binaryType = 'arraybuffer';
      let text = '';
      ws.onopen = () => ws.send(JSON.stringify({ AuthToken: '', columns: 80, rows: 24 }));
      ws.onmessage = (m) => {
        const bytes = new Uint8Array(m.data);
        if (String.fromCharCode(bytes[0]) === '0') text += new TextDecoder().decode(bytes.subarray(1));
        if (text.includes('TERM_PROGRAM=')) { ws.close(); resolve(text); }
      };
      ws.onerror = () => reject(new Error('websocket failed'));
      setTimeout(() => reject(new Error(`no output; got ${JSON.stringify(text)}`)), 5000);
    });
    assert.match(seen, /COLORTERM=\[truecolor\]/);
    assert.match(seen, /TERM_PROGRAM=\[\]/);
  } finally {
    ttyd.kill();
  }
});

