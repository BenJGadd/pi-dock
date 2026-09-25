# Pi Dock, in detail

Everything the README leaves out: how it works, the keys, what Pi sees, remote windows, security,
the layout of the code, and how to work on it. The README is the short version.

Pi Dock does not reach into Pi or into VS Code. Pi runs as the real program in a real terminal,
the sidebar draws that terminal, and nothing here parses what Pi prints. That is why a new Pi or
a new VS Code changes nothing here.

## How it works

Four parts, each replaceable on its own:

- **xterm.js** draws the terminal. It is the same engine, at the same version, that VS Code uses
  for its own terminal, vendored in `page/xterm/`.
- **ttyd** runs your `pi` command as a real terminal and serves it over a websocket.
- **dtach** holds that terminal open, so Pi survives the sidebar being moved.
- **Pi Dock** starts ttyd, connects the page to it, and passes keys and resizes along.

No dependencies, no native modules, nothing compiled. Pi runs in your workspace folder with your
own configuration, extensions and skills.

## Install

1. **ttyd**: `brew install ttyd`, `sudo apt install ttyd`, or a binary from
   [its releases](https://github.com/tsl0922/ttyd).
2. **dtach**: `brew install dtach`, `sudo apt install dtach`. Not available on Windows; without it
   Pi restarts when the sidebar moves.
3. **Pi**, so that `pi` works in a terminal.
4. **The extension**: `codium --install-extension pi-dock-<version>.vsix`, or Extensions → `…` →
   *Install from VSIX*.

Click the π icon in the activity bar, or press `Ctrl+Alt+P` (`Cmd+Alt+P` on a Mac). The same key
takes you back to the editor. **Help ▸ Welcome ▸ Set up Pi Dock** checks each program and ticks it
when it is found; **Pi Dock: Check Setup** does the same from the palette.

## Sessions

**Moving the sidebar keeps Pi running.** VS Code destroys the page when you drag the view. Pi runs
under dtach, so the new page reattaches to the same Pi, screen and history intact.

**Closing or reloading the window ends the Pi process, not the conversation.** Pi Dock loads a
small extension into Pi (`pi/pi-dock-session.js`) that records which session file is open, each
time a session starts or you switch with `/new`, `/resume` or `/fork`. The record lives in
`~/.local/state/pi-dock/<workspace hash>.json`, or under `$XDG_STATE_HOME`. The next start passes
that file to Pi with `--session`. If the file is gone, Pi starts fresh. With `piDock.resume` off,
every start is a new conversation.

One session per workspace folder. When Pi exits, the sidebar says so and waits for Enter; it never
restarts in a loop.

Three commands end the running Pi and start it on a session of your choosing:

- **Pi Dock: Resume Session…** lists this folder's saved conversations, newest first, by name or by
  the first thing you said, and restarts Pi on the one you pick.
- **Pi Dock: Fork Session…** does the same on a copy.
- **Pi Dock: New Session** forgets the recorded session and starts plain.

**Pi Dock: Restart Pi** starts over on the same conversation.

## Pi in the panel

**Terminal ▸ New Terminal ▸ Pi** runs the same `piDock.command` in VS Code's own terminal, in the
workspace folder, with the same environment and the same session-recording extension. It starts
plain rather than resuming. Whichever Pi started last is the one the sidebar comes back to. No ttyd
and no dtach are involved; the panel is VS Code's to keep alive.

## Look

Nothing to configure. The sidebar is a web page, and VS Code publishes every theme colour to it,
so the terminal reads them directly and follows the VS Code terminal.

- All 16 ANSI colours, the cursor and the selection. The background is the sidebar's unless your
  theme sets `terminal.background`.
- Theme changes apply at once, no restart.
- Font, size, line height, cursor style, blinking and scrollback come from `terminal.integrated.*`.
  A font you do not have installed is skipped.
- 24-bit colour, and GPU rendering with a fallback.
- An emoji is two cells wide, as it is for Pi and for VS Code's terminal, which is what keeps
  Pi's scrollbar straight on a row with one. `terminal.integrated.unicodeVersion` decides here too.
- Shift+Enter and other modifier chords reach Pi, as in VS Code's terminal.

## Keys

While the sidebar has focus, every key goes to Pi, including chords VS Code normally takes.

The exceptions are in `piDock.escapeActions`. You list **commands**, not shortcuts. Pi Dock looks
up each command's shortcuts in VS Code's own keybindings, including your `keybindings.json`, so a
command you rebind keeps its escape. Each command you add costs Pi a key. The defaults on Linux:

- `workbench.action.showCommands` (F1, Ctrl+Shift+P) *(default)*: Pi uses it to cycle the model
  backward.
- `workbench.action.quickOpen` (Ctrl+P, Ctrl+E): cycle the model forward, end of line.
- `workbench.action.toggleSidebarVisibility` (Ctrl+B): cursor left.
- `workbench.action.togglePanel` (Ctrl+J): newline.
- `workbench.action.zoomOut` (Ctrl+-): undo.

Copy, paste and page scrolling work on whatever shortcuts VS Code has them on. `piDock.toggle` is
in the default list, so `Ctrl+Alt+P` leaves the terminal for the editor; it is on no Pi key.
Escape stays Pi's: the page cannot tell an empty Pi input from a full one.

Keep the list short. Anything that wants to read or drive Pi belongs in a Pi package, where it
works in any terminal and cannot break the sidebar.

**Worth knowing.** The shortcuts are read from a VS Code file that is not documented. If that ever
stops working, Pi Dock warns you and falls back to F1 as the only way out. Keys are matched by
physical position, so a punctuation shortcut on a non-US layout may land on a different key than
it does in VS Code. Tested on VS Code 1.116 on Linux; macOS is untested.

## Pasting images

Paste an image, such as a screenshot from the clipboard, into the terminal. It is saved under the
temp folder (`/tmp/pi-dock/` on Linux) and typed into Pi as
`@/tmp/pi-dock/20260922-143501-3f9a2c1b.png`, which Pi reads as an attachment. PNG, JPEG, GIF and
WebP up to 20 MB; anything else is logged and dropped. Files older than a day are removed when the
extension next starts. Text pastes are unchanged.

## Opening paths

Hold Ctrl (Cmd on a Mac) and click a path in Pi's output, and the file opens in the editor, at the
line when one is given. This works for `src/foo.js` as it appears in Pi's own tool blocks, for
`src/foo.js:12`, `./a.py:3:7` and `/etc/hosts:1`, and for a line marker of the form
`@src/foo.js#L10-L20`.

As in VS Code's own terminal, only a path that names a file is a link. The page finds what is
shaped like a path, and the extension checks each one against the folder Pi runs in, once, so
`e.g.` and `example.com` stay plain. A plain click stays with Pi. Paths are underlined only while
the modifier is held.

## Settings

- `piDock.command` (`["pi"]`): what to run, as an argument list.
- `piDock.resume` (`true`): continue this folder's last session at each start.
- `piDock.persist` (`true`): keep Pi alive when the sidebar moves, using dtach.
- `piDock.ttydPath`, `piDock.dtachPath` (`"ttyd"`, `"dtach"`): where the two programs are, if not
  on PATH.
- `piDock.fontSize`, `piDock.fontFamily`: overrides for `terminal.integrated.fontSize` and
  `terminal.integrated.fontFamily`.
- `piDock.theme` (`{}`): single colours to override, such as `{"background": "#181818"}`.
- `piDock.clientOptions` (`{}`): extra
  [xterm.js options](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/).
- `piDock.escapeActions`: the VS Code commands whose shortcuts should not go to Pi.
- `piDock.extraArgs` (`[]`): extra arguments for ttyd.

Fonts and colours apply at once. A changed command or path offers to restart Pi.

## What Pi sees

Every Pi that Pi Dock starts, in the sidebar or through the terminal profile, gets three
environment variables and one extension:

- `COLORTERM=truecolor`.
- `PI_DOCK=<Pi Dock's version>`, so a tool can tell it is running inside the editor.
- `PI_DOCK_SESSION_STATE=<the state file for this folder>`.
- `-e pi/pi-dock-session.js`, the extension that writes that file.

For other extensions, `piDock.setBadge(value, tooltip)` puts `value` on the Pi icon in the activity
bar with `tooltip` on hover; `0` clears it. It is hidden from the command palette, and is there for
an extension that knows when Pi is waiting for you.

## Remote

With Remote SSH, WSL or a container, the extension runs on the remote (`extensionKind:
workspace`). ttyd, dtach and Pi run there, in the remote workspace folder, and the sidebar page on
your machine reaches ttyd through the port VS Code forwards. Sessions and Ctrl+clicked paths are
the remote's. A pasted image is written to the remote's temp folder, which is where Pi reads it.
The terminal profile runs on the remote too. Nothing is known not to work; it has only been tested
locally.

## Security

ttyd listens on loopback only, on a random port, behind a random 32-character URL path, and
accepts one client. Anything else running as you could reach it, in the same way it could already
run `pi`.

The four settings that decide what runs, `piDock.command`, `piDock.ttydPath`, `piDock.dtachPath`
and `piDock.extraArgs`, are machine scope: only your user settings, or the remote's, can set them,
never a folder's `.vscode/settings.json`. A cloned repository cannot point the sidebar at a script
of its own. The log shows ttyd's command line with the URL token replaced.

## Layout

One file per feature, so a change touches one place.

**`extension.js`** is the wiring: it builds each feature once, registers what VS Code should know
about, and routes each page message to the feature that owns it.

**`host/`** is the VS Code side:

- `page.js`: the sidebar page, built from the running ttyd, rebuilt on demand, restored from its
  own snapshot.
- `server.js`: the ttyd process, one per window, and the end of the Pi it kept alive.
- `settings.js`: reads the `piDock.*` settings and the workspace folder, and applies each setting
  as it changes.
- `sessions.js`: which session the next start joins: resume, fork, new.
- `keys.js`: resolves the escape chords from VS Code's keybindings.
- `images.js`, `links.js`: pasted images are saved and mentioned; Ctrl+clicked paths open.
- `badge.js`, `toggle.js`: the number on the Pi icon; one key between the editor and Pi.
- `setup.js`, `profile.js`: the setup walkthrough checks; the terminal profile.
- `log.js`: the output channel, mirrored to a file when `PI_DOCK_LOG` names one.

**`lib/`** has no VS Code in it, so plain Node can test it: mentions, images, resume state, session
listing, the dtach session, ttyd arguments, the page's HTML, xterm options, chords.

**`page/`** is the web page itself, one file per feature, loaded in the order `lib/webview.js`
lists them:

- `theme.js`: VS Code's colours and fonts, read from the page.
- `keys.js`: which keys Pi gets, the page handles, or VS Code should have.
- `paste.js`, `links.js`: the page side of image paste and clickable paths.
- `snapshot.js`: the screen handed to the next page when the sidebar moves.
- `socket.js`: the websocket to ttyd and its message format.
- `main.js`: wires the page files and starts the terminal; loads last.
- `xterm/`: the vendored xterm.js, which only the page loads.

**`pi/pi-dock-session.js`** is the small extension that runs inside Pi and records the session.

**`media/`** is what VS Code shows about the extension: the icons and the walkthrough pages.

## Development

`npm test` runs the tests under plain Node. `npm run package` builds the `.vsix`. To update the
vendored xterm.js, see `page/xterm/README.md`.

The README's pictures are real runs: a scratch VSCodium profile with this extension alone, a fresh
Pi on a local model, and a sample folder, driven under Xvfb by a screenshot harness that is kept
outside this repository so that none of its tooling ships.

## Credits

The Pi mark (`media/pi.svg`, and the glyph inside `media/icon.png`) is Pi's own badge by Earendil
Inc., the square mark published at <https://pi.dev/favicon.svg>, reproduced unchanged in shape.
Everything else in the icon is original to Pi Dock.
