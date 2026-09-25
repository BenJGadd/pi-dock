// Saving a pasted image where Pi can read it.
//
// A page inside VS Code cannot write files, so an image pasted into the terminal arrives here as a
// data URL. It is written under the temp folder, and its path is typed into Pi as `@/tmp/...png`.
// Pi does not expand the mention itself: the model reads the path with Pi's `read` tool, which sends
// jpg, png, gif, webp and bmp files on as images (pi 0.87.0, dist/core/tools/read.js:37). Files
// older than a day are removed on the next start.
//
// No VS Code here, so `node --test` can check it.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** The image kinds Pi reads, and the file ending each one gets. */
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };

/** Larger than this is refused: nobody means to hand a model a 20 MB screenshot. */
const MAX_BYTES = 20 * 1024 * 1024;

/** How long a saved image is kept. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Where images go: one folder for all windows, in the temp directory.
 *
 * @param {string} [tmp] Defaults to the system temp folder.
 * @returns {string}
 */
const imageDir = (tmp = os.tmpdir()) => path.join(tmp, 'pi-dock');

/**
 * Splits a data URL into its type and bytes.
 *
 * @param {string} dataUrl e.g. `data:image/png;base64,iVBOR...`
 * @returns {{ mime: string, bytes: Buffer }|null} Null when it is not a base64 data URL.
 */
function decodeDataUrl(dataUrl) {
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]*)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  return { mime: match[1].toLowerCase(), bytes: Buffer.from(match[2].replace(/\s/g, ''), 'base64') };
}

/**
 * The name for one image: when it was pasted, a few characters of its hash so two pastes in the same
 * second do not collide, and the ending for its kind.
 *
 * @param {string} mime One of EXTENSIONS' keys.
 * @param {Buffer} bytes
 * @param {Date} [now]
 * @returns {string} e.g. `20260922-143501-3f9a2c1b.png`
 */
function imageFileName(mime, bytes, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  return `${stamp}-${hash}.${EXTENSIONS[mime]}`;
}

/**
 * Checks an image before it is written.
 *
 * @param {{ mime: string, bytes: Buffer }|null} decoded From decodeDataUrl.
 * @param {number} [maxBytes]
 * @returns {string|null} Why it is refused, or null when it is fine.
 */
function refusal(decoded, maxBytes = MAX_BYTES) {
  if (!decoded) return 'not a base64 data URL';
  if (!EXTENSIONS[decoded.mime]) return `unsupported image type ${decoded.mime}`;
  if (decoded.bytes.length === 0) return 'empty image';
  if (decoded.bytes.length > maxBytes) return `${decoded.bytes.length} bytes is over the ${maxBytes} byte limit`;
  return null;
}

/**
 * Writes a pasted image to the image folder.
 *
 * @param {string} dataUrl
 * @param {object} [options]
 * @param {string} [options.dir] Defaults to imageDir().
 * @param {number} [options.maxBytes]
 * @param {Date} [options.now]
 * @returns {string} The file written.
 * @throws {Error} With the reason, when the image is refused.
 */
function saveImage(dataUrl, { dir = imageDir(), maxBytes = MAX_BYTES, now = new Date() } = {}) {
  const decoded = decodeDataUrl(dataUrl);
  const why = refusal(decoded, maxBytes);
  if (why) throw new Error(why);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, imageFileName(decoded.mime, decoded.bytes, now));
  fs.writeFileSync(file, decoded.bytes, { mode: 0o600 });
  return file;
}

/**
 * Removes images older than a day. A missing folder is fine.
 *
 * @param {string} [dir]
 * @param {number} [maxAgeMs]
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {string[]} The files removed.
 */
function pruneOld(dir = imageDir(), maxAgeMs = MAX_AGE_MS, now = Date.now()) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const removed = [];
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) {
        fs.rmSync(file, { force: true });
        removed.push(file);
      }
    } catch (_) {
      // gone already, or not this extension's to touch
    }
  }
  return removed;
}

module.exports = { EXTENSIONS, MAX_BYTES, MAX_AGE_MS, imageDir, decodeDataUrl, imageFileName, refusal, saveImage, pruneOld };
