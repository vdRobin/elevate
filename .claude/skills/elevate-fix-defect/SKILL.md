---
name: elevate-fix-defect
description: Safely fix a bug or known defect in the Elevate repo (appcore Angular app, desktop Electron main, shared @elevate/shared library) with a minimal, style-preserving change and a regression spec. Use this whenever the user wants to fix a bug, "make the app better", clean up mistakes, harden sync/backup/restore/recalculation, stop data loss, fix a crash or a stuck spinner, remove upstream telemetry or endpoints from the fork, or asks "what should I fix first" in this repo — even if they don't name a specific defect. Contains a prioritised catalog of confirmed defects with file and line.
---

# Fix a defect in Elevate

The goal is to make the app more reliable without changing its DNA: same Angular 14 NgModule structure, same promise-chain style, same DI-by-abstract-class pattern, same LokiJS data layer. A good fix here is small, local, tested, and invisible to a reader skimming the file — it looks like the original author wrote it carefully.

## 1. Pick the defect

If the user names a bug, find it. If they ask what to fix, or "make it better", open `references/defect-catalog.md` and propose the top unfixed items in priority order. Priorities follow user impact:

- **P0 fork hygiene** — the fork still reports errors, telemetry and athlete data to the original author's services and would auto-update from upstream releases. Fix these before shipping any build of the fork.
- **P1 data safety and stuck states** — data loss on restore, locks that never release, spinners that never stop.
- **P1 Garmin import blockers** — the file scanner ignores uppercase `.FIT` files that Garmin devices write.
- **P2 security and privacy**, then **P2 correctness**, then **P3 cleanups**.

Before editing, re-read the cited lines: the catalog was written at commit `df9e2ceb` and code may have moved. If the defect is already fixed, mark it so in the catalog and move on.

## 2. Understand the blast radius

Most defects live in code that compiles into two apps (see `CLAUDE.md`). Before changing a file:

- Check whether a `desktop-*` and `extension-*` sibling exists and whether it has the same flaw.
- If the file is in `appcore/modules/shared`, it also runs in Electron main (`desktop/`) and the web extension. Grep all three projects for the symbol.
- If the defect involves stored data, decide whether existing users' databases need a desktop migration (`appcore/src/app/desktop/migration/`).

## 3. Write the regression spec first

A failing spec proves the bug and keeps it fixed. Put it next to the file, matching neighbours:

- **appcore**: Jest + jasmine2 API (`spyOn(...).and.returnValue(...)`, `done` callbacks). Configure `TestBed` with `CoreModule`, `SharedModule` and the matching target module (`desktop-target.module` or `extension-target.module` — not the placeholder `target.module`), and provide `{ provide: DataStore, useClass: TestingDataStore }`.
- **desktop**: Jest + ts-jest in node environment; tsyringe `container.resolve(...)`; fixtures under `src/connectors/*/fixtures`.
- **webextension**: Karma + Jasmine under `webextension/specs/`.

For "stuck state" bugs, the spec should make the failing dependency reject and assert the flag or subject is released (for example `isRecalculating` back to `false`, `isSyncing$` emitting `false`, the progress subject erroring).

## 4. Make the smallest fix that matches house style

- Keep promise chains; add a `.catch` or move the reset into a `.finally`-equivalent branch rather than converting the function to `async/await`. New code may use `async/await` when a whole new function is written.
- Keep explicit `@Inject()` on every constructor parameter and the `public`/`private`/`protected` modifiers.
- Throw `WarningException` for expected, user-visible failures; let real bugs propagate to the global `ElevateErrorHandler`.
- Clone before mutating anything returned by a DAO or a static `DEFAULT_MODEL` (`_.cloneDeep`).
- Do not rename public members, routes or collection names: routes are UI labels, collection names are on-disk data.
- Prettier settings: width 120, double quotes, no trailing commas, `arrowParens: avoid`.

If the right fix is architectural (for example a correlation id in `IpcTunnel`), do it in its own change, keep the old call signature working, and say so to the user.

## 5. Verify

Run the `elevate-verify` skill (or its script) for the projects you touched. At minimum: the new spec passes and fails without the fix, type checks pass for both targets when appcore or shared code changed, and the full suite of each touched project still passes. If dependencies are not installed, say that the change is unverified rather than claiming it works.

## 6. Report and record

Tell the user what was wrong in one or two sentences, what you changed, and how it was verified. Update `references/defect-catalog.md`: mark the item fixed with the date, or adjust it if you found the description inaccurate. Do not commit unless the user asks.
