Vendored, unmodified, pinned. Nothing here updates itself.

These are the exact builds VS Code 1.116 ships for its own terminal (`@xterm/xterm` 6.1.0-beta.197). That line is the only one with the Kitty keyboard protocol (`vtExtensions.kittyKeyboard`), which Pi uses to tell modifier chords apart, and it draws its own scrollbar. The stable 6.0.0 has neither.

| File | Package | Version |
| --- | --- | --- |
| `xterm.js`, `xterm.css` | `@xterm/xterm` | 6.1.0-beta.197 |
| `addon-fit.js` | `@xterm/addon-fit` | 0.12.0-beta.197 |
| `addon-webgl.js` | `@xterm/addon-webgl` | 0.20.0-beta.197 |
| `addon-serialize.js` | `@xterm/addon-serialize` | 0.15.0-beta.197 |

All MIT (`LICENSE.txt`). To upgrade, replace the files from the npm tarballs
(`https://registry.npmjs.org/@xterm/<name>/-/<name>-<version>.tgz`, `lib/` and `css/`) and run `npm test`.
