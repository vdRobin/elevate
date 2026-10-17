---
name: elevate-verify
description: Verify changes in the Elevate repo before calling them done — type checks, Jest/Karma tests and optional production builds for appcore (both desktop and extension targets), desktop (Electron main) and webextension, chosen from the files that changed. Use this after any code change in this repo, before committing, when the user asks "does it work", "run the tests", "check both builds", or when another Elevate skill says to verify. Also explains how to read failures that come from the two-target build setup.
---

# Verify Elevate changes

One source tree builds two apps, and `appcore/modules/shared` runs in three runtimes, so a change can pass in the project you edited and break another. This skill runs the right checks for what changed and reports honestly what was and was not verified.

## Run it

```bash
.claude/skills/elevate-verify/scripts/verify.sh            # projects inferred from changed files
.claude/skills/elevate-verify/scripts/verify.sh --quick    # type checks + Jest specs related to changed files
.claude/skills/elevate-verify/scripts/verify.sh --build    # add production builds (desktop-prod, extension-prod, electron)
.claude/skills/elevate-verify/scripts/verify.sh --all      # every project
.claude/skills/elevate-verify/scripts/verify.sh appcore desktop --dry-run   # show commands only
```

How projects are chosen: changes under `appcore/` select appcore, `desktop/` selects desktop, `webextension/` selects webextension, and any change under `appcore/modules/shared/` selects all three. Docs, `.claude/` and Markdown files are ignored. The script ends with a PASS / FAIL / SKIP summary. Exit code `0` means everything that ran passed, `1` a failure, `2` nothing could run, typically because `node_modules` is missing.

Use `--quick` while iterating and the default run before saying a task is finished. Add `--build` when templates, Angular modules, `angular.json`, routing, or desktop packaging changed: the desktop dev build runs without AOT, so template errors only appear in production builds.

## When dependencies are missing

The script skips projects without `node_modules`. Do not install dependencies silently: `npm install` at the root installs all three projects, takes a while, and runs `postinstall` scripts. Ask the user, or tell them the change is unverified. Never report a skipped check as passing.

## Reading failures

- **"No provider for X" in an appcore spec:** the spec imports the placeholder `target.module` (or none). Import `desktop-target.module` or `extension-target.module` and provide `{ provide: DataStore, useClass: TestingDataStore }`.
- **Type check passes but the app fails to inject at runtime:** `type:check` compiles the placeholder modules, which bind nothing. Check that the service is listed in the right `providers` array for each target.
- **Error in `desktop` after a change to `appcore/modules/shared`:** desktop compiles shared code through path aliases and runs it in Node. Look for DOM or Angular imports leaking into shared code.
- **Cannot find `build_metadata.json`:** generate it with `npm run build:metadata` in `desktop/`. The script does this automatically.
- **Karma cannot start Chrome:** webextension tests need Chrome or Chromium. See the README appendix for a `browsers.karma.conf.js` that uses Chromium headless.
- **Prettier check fails:** run `npx prettier --write <files>` at the root. The pre-commit hook formats staged files too.

## Manual checks the script cannot do

Unit tests do not cover Electron IPC, maps, charts or real files. When a change touches those, ask the user to run the desktop app (`cd desktop && npm start`, then `npm run launch:dev:app` in a second terminal) or load the extension unpacked from `webextension/dist`, and name the exact screen and action to check.
