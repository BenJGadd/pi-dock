// Handing the terminal to the next page.
//
// Dragging the sidebar destroys this page and builds another joined to the same Pi. Pi switched on
// the terminal features it needs once, at startup, and they belong to the page that was there
// then. So each page keeps a copy of the screen with the extension, and the next page starts from
// it. The serialize add-on carries the screen and most terminal modes; the Kitty keyboard flags it
// does not, so they are mirrored here.
//
// Needs nothing from the other page files; page/main.js uses it.

'use strict';

/**
 * Keeps a copy of the Kitty keyboard protocol's flags, which programs use to ask for more detail
 * about key presses.
 *
 * The protocol keeps a stack per screen: add a set (CSI > flags u), take one off (CSI < n u), or
 * change the top one (CSI = flags ; mode u). xterm.js tracks this but offers no way to read it back,
 * so a page replacing this one could not inherit it. See restoreSnapshot.
 *
 * @returns {{
 *   push: (screen: string, flags: number) => void,
 *   pop: (screen: string, count: number) => void,
 *   set: (screen: string, flags: number, mode: number) => void,
 *   reset: () => void,
 *   state: () => import('../types').KittyState,
 * }}
 */
function kittyTracker() {
  const stacks = { normal: [], alternate: [] };
  return {
    push(screen, flags) {
      if (stacks[screen].length < 16) stacks[screen].push(flags); // a program must not grow it forever
    },
    pop(screen, count) {
      stacks[screen].splice(Math.max(0, stacks[screen].length - count));
    },
    set(screen, flags, mode) {
      const stack = stacks[screen];
      if (!stack.length) stack.push(0);
      const top = stack.length - 1;
      stack[top] = mode === 3 ? stack[top] & ~flags : mode === 2 ? stack[top] | flags : flags; // 1 replace, 2 add, 3 remove
    },
    reset() {
      stacks.normal.length = 0;
      stacks.alternate.length = 0;
    },
    state: () => ({ normal: [...stacks.normal], alternate: [...stacks.alternate] }),
  };
}

const SNAPSHOT_MS = 800; // no more than one snapshot this often, while output keeps coming
const SNAPSHOT_MAX_CHARS = 2000000; // bigger than this and only recent history is kept
const SNAPSHOT_FALLBACK_LINES = 500; // how much history to keep when the whole lot is too big

/**
 * Watches the Kitty flags go by and keeps a copy.
 *
 * @param {*} term
 * @returns {ReturnType<typeof kittyTracker>}
 */
function mirrorKittyFlags(term) {
  const kitty = kittyTracker();
  const screen = () => term.buffer.active.type;
  // Returning false means the handler only looked — xterm.js still handles the sequence itself.
  term.parser.registerCsiHandler({ prefix: '>', final: 'u' }, (params) => (kitty.push(screen(), params[0] || 0), false));
  term.parser.registerCsiHandler({ prefix: '<', final: 'u' }, (params) => (kitty.pop(screen(), params[0] || 1), false));
  term.parser.registerCsiHandler({ prefix: '=', final: 'u' }, (params) => (kitty.set(screen(), params[0] || 0, params[1] || 1), false));
  return kitty;
}

/**
 * Returns the terminal as text, small enough to hand over.
 *
 * Almost always the whole thing. A session past the limit gets recent history instead, because
 * sending nothing leaves the extension holding the last copy that fitted, which every later page
 * then restores, growing staler for as long as the session lives.
 *
 * @param {*} serialize The serialize add-on.
 * @returns {string|null} Null only if even the shortened version is too big to send.
 */
function snapshotText(serialize) {
  const whole = serialize.serialize();
  if (whole.length < SNAPSHOT_MAX_CHARS) return whole;
  const recent = serialize.serialize({ scrollback: SNAPSHOT_FALLBACK_LINES });
  return recent.length < SNAPSHOT_MAX_CHARS ? recent : null;
}

/**
 * Keeps a copy of the terminal with the extension, so the next page carries on where this one left
 * off.
 *
 * Dragging the sidebar destroys this page and builds another joined to the same Pi. Pi switched on
 * the terminal features it needs once, at startup, and they belong to the page that was there then.
 * Starting the new page from this copy gives them back.
 *
 * @param {object} args
 * @param {*} args.term
 * @param {*} args.serialize The serialize add-on.
 * @param {ReturnType<typeof kittyTracker>} args.kitty
 * @param {(message: { type: string, snapshot: import('../types').Snapshot|null }) => void} args.post
 *   Sends a message to the extension.
 */
function postSnapshots({ term, serialize, kitty, post }) {
  let timer = 0;
  term.onWriteParsed(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      const serialized = snapshotText(serialize);
      if (serialized) post({ type: 'snapshot', snapshot: { serialized, kitty: kitty.state(), buffer: term.buffer.active.type } });
    }, SNAPSHOT_MS);
  });
}

/**
 * Starts from the copy the last page left behind.
 *
 * The serialize add-on covers the screen, its history and most terminal settings, but not the Kitty
 * flags, so those are replayed here. Per screen, because each has its own stack and the serialized
 * part may switch screens on the way through.
 *
 * @param {*} term
 * @param {import('../types').Snapshot} restore
 */
function restoreSnapshot(term, restore) {
  const push = (flags) => term.write(`\x1b[>${flags}u`);
  restore.kitty.normal.forEach(push);
  term.write(restore.serialized);
  if (restore.buffer === 'alternate') restore.kitty.alternate.forEach(push);
}

if (typeof module !== 'undefined') {
  module.exports = { kittyTracker };
}
