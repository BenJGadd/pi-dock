// A Pi extension, loaded by Pi Dock into the Pi it starts, that notes which session Pi is in.
//
// Each time a session starts (Pi starting up, /new, /resume, /fork), this writes the session's file
// and id to the state file Pi Dock named in PI_DOCK_SESSION_STATE. Pi Dock reads that before its
// next start and continues the same session with `--session`. Without the variable, which only
// Pi Dock sets, this does nothing at all, so a Pi started elsewhere never writes.
//
// A Pi running with --no-session has no file to come back to (Pi's getSessionFile answers
// undefined), so nothing is written and the last saved session stays recorded: it is still the
// right one to return to.
//
// Plain JavaScript, so Pi loads it as it is: no build, no dependencies.

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Writes the state beside its final name and renames it, so Pi Dock never reads half a file.
 *
 * @param {string} file
 * @param {{ sessionFile: string, sessionId: string }} state
 */
function writeState(file, state) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
}

export default function (pi) {
  const file = process.env.PI_DOCK_SESSION_STATE;
  if (!file) return;
  // session_start fires for "startup", "reload", "new", "resume" and "fork" (pi 0.87.0,
  // core/extensions/types.d.ts:417-423); ctx.sessionManager is the read-only session manager
  // (:220), whose getSessionFile() is undefined for an unsaved session (:247).
  pi.on("session_start", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager?.getSessionFile?.();
    const sessionId = ctx.sessionManager?.getSessionId?.();
    if (!sessionFile || !sessionId) return;
    try {
      writeState(file, { sessionFile, sessionId });
    } catch {
      // An unwritable state folder costs the next start its resume, nothing more.
    }
  });
}
