## Context

Both places `npm run dev` can run from — the repo root and `example/` — already have a `dockbook.config.js`. `cmdDev` in `bin/dockbook.js` only serves the welcome/folder-picker screen (`cmdDevSetup`, backed by `assets/welcome.html`) when `findConfigPath(cwd)` returns `null`. See `proposal.md - Why` for the full motivation.

## Goals / Non-Goals

**Goals:**
- Give a repeatable, one-command way to exercise the welcome screen from this repo, using a `cwd` that genuinely has no config.
- Leave the existing `dev`/`build`/`preview` scripts and their behavior against `example/` untouched.

**Non-Goals:**
- Changing `cmdDevSetup`, `assets/welcome.html`, or any other part of the welcome-screen implementation — it already works and isn't being modified.
- Adding a CLI flag (e.g. `dockbook dev --setup`) to force the setup screen even when a config exists — considered and rejected for this change (see Decisions) since a scratch directory achieves the goal without touching `bin/dockbook.js`.

## Decisions

- **Scratch directory instead of a CLI flag.** A plain directory with no `dockbook.config.js` is the natural way to hit the existing `findConfigPath(cwd) === null` branch — no code path in `bin/dockbook.js` needs to change. A `--setup` flag was considered (see the earlier explore-mode discussion) but would need to decide what happens when a config already exists (overwrite it? refuse?) — unnecessary complexity for what is just a manual verification aid.
- **Recreate the scratch directory on every run.** `rm -rf .dockbook-scratch && mkdir .dockbook-scratch && cd .dockbook-scratch && node ../bin/dockbook.js dev`. Picking a folder through the browser UI writes a `dockbook.config.js` into that scratch directory (via `POST /__dockbook_api/init`), which would make the *next* run skip the welcome screen if the directory weren't wiped first. Wiping guarantees the screen shows every time.
- **New script alongside the existing `dev`, not a modification to it.** Keeps the fast local-iteration loop (`npm run dev` against `example/docs`) exactly as it is; `dev:welcome` is purely additive.

## Risks / Trade-offs

- [Running `dev:welcome` and `dev`/`preview` at the same time would collide on the default port] → Both use `DEFAULTS.port` (4000) with no port override in this change; this is a pre-existing limitation of the CLI (no `--port` flag) and out of scope here. Stop one server before starting the other.
- [`rm -rf .dockbook-scratch` runs unconditionally] → Scoped to a literal, gitignored directory name at the repo root, created fresh by the same script; no risk to other files.
