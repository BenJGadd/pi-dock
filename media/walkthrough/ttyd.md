# ttyd

ttyd runs your `pi` command as a real terminal and serves it over a local websocket, which the sidebar connects to. It listens on loopback only, on a random port, behind a random URL path.

- macOS: `brew install ttyd`
- Debian and Ubuntu: `sudo apt install ttyd`
- Anything else: a binary from [ttyd's releases](https://github.com/tsl0922/ttyd/releases)

If ttyd is somewhere not on your PATH, set `piDock.ttydPath` to its full path.
