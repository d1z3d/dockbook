## Why

`npm run dev` in this repo always runs against `example/` (or the repo root), both of which already have a `dockbook.config.js`. That means the first-run "welcome" screen — where a user without a config picks a documentation folder — can never be exercised from this repo, even though the flow is already implemented (`cmdDevSetup` in `bin/dockbook.js`, served from `assets/welcome.html`). There's currently no way to manually check that screen without moving/deleting an existing config by hand.

## What Changes

- Add an `npm run dev:welcome` script that starts `bin/dockbook.js dev` inside a scratch directory that has no `dockbook.config.js`, so `cmdDev` falls into `cmdDevSetup` and serves the welcome/folder-picker screen.
- The scratch directory is recreated (wiped and remade) each time the script runs, so leftover state (e.g. a config written by a previous run through the picker) never carries over.
- Add the scratch directory to `.gitignore` so it's never committed.
- No change to the existing `npm run dev` script or its behavior against `example/`.

## Capabilities

This is a dev-tooling-only change (an npm script plus a `.gitignore` entry). It does not alter any user-observable behavior of `dockbook` itself — the welcome-screen flow it exercises already exists and is unchanged. No capability specs are added or modified; `skip_specs: true` is set in `.openspec.yaml`.

## Impact

- `package.json`: new `dev:welcome` script.
- `.gitignore`: new entry for the scratch directory (e.g. `.dockbook-scratch/`).
- No changes to `bin/dockbook.js`, `src/`, or `assets/`.
