'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decodeDataUrl, refusal } = require('../lib/images');

const png = 'data:image/png;base64,' + Buffer.from('not really a png').toString('base64');

test('unknown kinds, empty images and oversized ones are refused with a reason', () => {
  assert.strictEqual(refusal(decodeDataUrl(png)), null);
  assert.match(refusal(null), /not a base64/);
  assert.match(refusal(decodeDataUrl('data:image/svg+xml;base64,PHN2Zz4=')), /unsupported image type image\/svg\+xml/);
  assert.match(refusal(decodeDataUrl('data:image/png;base64,')), /empty/);
  assert.match(refusal(decodeDataUrl(png), 4), /over the 4 byte limit/);
});

