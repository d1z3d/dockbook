## 1. Scratch dev script

- [x] 1.1 Add a `dev:welcome` script to `package.json` that wipes and recreates a scratch directory (e.g. `.dockbook-scratch`) at the repo root, then runs `node bin/dockbook.js dev` with that directory as `cwd` (no `dockbook.config.js` present there), mirroring the `cd`-into-directory style already used by the `dev`/`build`/`preview` scripts.
- [x] 1.2 Add the scratch directory (e.g. `.dockbook-scratch/`) to `.gitignore`.

## 2. Verify

- [x] 2.1 Run `npm run dev:welcome`, confirm the welcome/folder-picker screen (`assets/welcome.html`) loads at `http://localhost:<port>` instead of an already-configured site.
- [x] 2.2 Confirm `npm run dev` still behaves as before (serves `example/` directly, no welcome screen).
