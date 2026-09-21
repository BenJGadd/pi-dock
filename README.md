# Pi Dock

The Pi TUI in a VS Code sidebar.

This is designed to have no coupling to Pi's internals or VS Code's terminal renderer. This is a real terminal moved between a PTY and a webview. It never reads or parses Pi's output. The design is built so that nothing breaks when either VS Code or Pi receive updates.

## How it works

Four parts, each replaceable on its own:

- **xterm.js** draws the terminal. Same engine and version VS Code uses for its own terminal, vendored in `media/xterm`.
- **ttyd** runs your `pi` command as a real terminal behind a websocket.
- **dtach** holds that terminal open so Pi survives the sidebar being moved.
- **Pi Dock** starts ttyd, connects the page to it, and passes keys and resizes along.

No dependencies, no native modules, nothing compiled. Pi runs in your workspace folder with your own config, extensions and skills.

## Install

1. **ttyd** — `brew install ttyd`, `sudo apt install ttyd`, or a binary from [its releases](https://github.com/tsl0922/ttyd).
2. **dtach** — `brew install dtach`, `sudo apt install dtach`. Keeps Pi alive when you move the sidebar. Not on Windows; without it Pi just restarts.
3. **Pi**, so that `pi` works in a terminal.
4. **The extension** — `codium --install-extension pi-dock-0.1.0.vsix`, or Extensions → `…` → Install from VSIX.

Click the π icon in the activity bar.

## Visual Style

Nothing to configure. Style mirrors the VS Code terminal. The sidebar is a web page, and VS Code publishes every theme colour to it, so the terminal reads them directly.

- All 16 ANSI colours, cursor, selection. Background matches the sidebar unless your theme sets `terminal.background`.
- Theme changes apply instantly, with no restart.
- Font, size, line height, cursor style, blinking and scrollback come from `terminal.integrated.*`. Fonts you don't have installed are skipped.
- 24-bit colour, and GPU rendering with a fallback.
- Shift+Enter and other modifier chords reach Pi, the same as in VS Code's terminal.

## Sessions

**Moving the sidebar keeps Pi running.** VS Code destroys the page when you drag the view, so Pi runs under dtach and the new page reattaches to it, screen and history intact.

**Closing or reloading the window ends Pi.** Next start gives you a fresh one. Use `["pi", "-c"]` as your command to continue the last conversation.

One session per workspace folder. **Pi Dock: Restart Pi** starts over. When Pi exits, the sidebar says so and waits for Enter; it never respawns in a loop.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `piDock.command` | `["pi"]` | What to run, as an argument list. |
| `piDock.persist` | `true` | Keep Pi alive when the sidebar moves, using dtach. |
| `piDock.dtachPath` / `piDock.ttydPath` | `"dtach"` / `"ttyd"` | Paths, if they aren't on PATH. |
| `piDock.fontSize` | *empty* | Overrides `terminal.integrated.fontSize`. |
| `piDock.fontFamily` | `""` | Overrides `terminal.integrated.fontFamily`. |
| `piDock.theme` | `{}` | Override single colours, e.g. `{"background": "#181818"}`. |
| `piDock.clientOptions` | `{}` | Extra [xterm.js options](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/). |
| `piDock.escapeActions` | `["workbench.action.showCommands"]` | VS Code commands whose shortcuts should not go to Pi. |
| `piDock.extraArgs` | `[]` | Extra arguments for ttyd. |

Changing fonts or colours applies straight away. Changing the command or a path offers to restart Pi.

## Keys

While the sidebar has focus, every key goes to Pi — including chords VS Code normally takes.

The exceptions are in `piDock.escapeActions`. You list **commands**, not shortcuts, and Pi Dock looks up their shortcuts in VS Code's own keybindings, including your `keybindings.json`. Rebind a command in VS Code and its escape moves with it.

Each one you add costs Pi a key. The defaults on Linux:

| Command | Shortcut | What Pi loses |
| --- | --- | --- |
| `workbench.action.showCommands` *(default)* | F1, Ctrl+Shift+P | cycle model backward |
| `workbench.action.quickOpen` | Ctrl+P, Ctrl+E | cycle model forward, end of line |
| `workbench.action.toggleSidebarVisibility` | Ctrl+B | cursor left |
| `workbench.action.togglePanel` | Ctrl+J | newline |
| `workbench.action.zoomOut` | Ctrl+- | undo |

Copy, paste and page scrolling work too, on whatever shortcuts VS Code has them on.

**Worth knowing.** Shortcuts are read from a VS Code file that isn't documented. If that ever stops working, Pi Dock warns you and falls back to F1 as the only way out. Keys are matched by physical position, so a punctuation shortcut on a non-US layout may land on a different key than in VS Code. Tested on VS Code 1.116, Linux. macOS is untested.

## Security

ttyd listens on loopback only, on a random port, behind a random 32-character URL path, and accepts one client. Anything else running as you could reach it, in the same way it could already just run `pi`.

## Development

`npm test` runs the tests under plain Node. `npm run package` builds the `.vsix`. To update the vendored xterm.js, see `media/xterm/README.md`.

Keep `escapeActions` short. Anything that wants to read or drive Pi belongs in a Pi package, where it works in any terminal and can't break the sidebar.

## Credits

The Pi mark (`media/pi.svg`, `media/icon.png`) is from [pi-agent-studio](https://github.com/JohnnyZ93/pi-agent-studio) by JohnnyZ93, MIT. Licence in `media/pi-icon-LICENSE.txt`.
