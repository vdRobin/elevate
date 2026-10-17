# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Mono-repo with three npm projects plus a root wrapper. Each has its own `package.json` and `node_modules`; root `npm install` runs `postinstall` that installs all three. Node >= 16. Trunk-based: `main` on the `origin` remote (the fork) is the trunk (see Branching below).

- `appcore/` — Angular 14 SPA (TypeScript 4.8, `strict: false`) shared by both products, plus the shared library `appcore/modules/shared` (`@elevate/shared`).
- `desktop/` — Electron main process (tsyringe DI, rollup bundle, electron-builder packaging). Loads the appcore build in its window.
- `webextension/` — Manifest V3 Chrome extension for strava.com (webpack). Serves the appcore build as its options page `app/index.html`.

Detailed appcore architecture docs (data layer, flows, IPC channels, known defects, playbooks) live in `appcore/docs/architecture/` — start with `ai-guide.html`.

The plan for the fork (phases, feature tracks, status per item) is in `ROADMAP.md`. Update its status column when an item lands.

This checkout is a clone of the fork (`origin` remote: `vdRobin/elevate`; `upstream` remote: the original `thomaschampagne/elevate`). Several runtime endpoints and identifiers still point at upstream services; see the P0 items in `.claude/skills/elevate-fix-defect/references/defect-catalog.md`.

Project skills in `.claude/skills/`: `elevate-fix-defect` (prioritised defect catalog), `elevate-verify` (`scripts/verify.sh` runs the right checks for changed files), `elevate-garmin-import`, `elevate-maps-gpx`, `elevate-ml-features`, `elevate-ai-assistant`.

## Commands

Root (runs across projects):
```bash
npm test                       # desktop + appcore + webextension tests
npm run type:check:desktop     # appcore + desktop tsc
npm run type:check:extension   # appcore + webextension tsc
npm run validate:desktop       # type check, tests, desktop prod build
```

appcore (run inside `appcore/`):
```bash
npm test                                  # Jest (jest-preset-angular, jasmine2 runner, jsdom), coverage HTML
npx jest src/app/shared/services/athlete/athlete.service.spec.ts   # single spec file
npx jest -t "should add a dated athlete settings"                   # by test name
npm run type:check
npm run lint                               # angular-eslint --fix
npx ng build --configuration=desktop-prod  # or desktop | extension | extension-prod
```
Jest `roots` is `src/` only: specs under `modules/shared` are not run by appcore. Some appcore code `require`s `desktop/build_metadata.json`; generate it with `npm run build:metadata` in `desktop/` if missing.

desktop (run inside `desktop/`):
```bash
npm start                  # watch-builds electron + appcore into desktop/dist
npm run launch:dev:app     # in a second terminal, once dist/app exists
npm test                   # Jest (ts-jest, node env); maps @elevate/shared to ../appcore/modules/shared
npx jest src/connectors/file/file.connector.spec.ts   # single spec
npm run build:prod
npm run build:package:win | build:package:linux | build:package:mac   # installers in desktop/package/
```

webextension (run inside `webextension/`):
```bash
npm start      # watch-builds into webextension/dist; load unpacked from chrome://extensions
npm test       # Karma + Jasmine, HeadlessChrome, specs in specs/
npm run package
```
Karma runs the whole suite; focus temporarily with `fdescribe`/`fit`. To use Chromium instead of Chrome, create `webextension/browsers.karma.conf.js` (see README appendix).

Formatting: Prettier (print width 120, double quotes, no trailing commas, `arrowParens: avoid`) runs on staged files in the pre-commit hook when root dependencies are installed. Root `npm run prettier` formats everything.

Git hooks (`core.hooksPath=.husky`, set by root `npm install` via `scripts/git-hooks/install.js`; logic in `scripts/git-hooks/`, mirrored in `lefthook.yml`):
- pre-commit blocks staged secrets (keys, tokens, `.env`/key files). Mark a false positive with a `secret-scan: allow` comment on the line.
- commit-msg requires Conventional Commits (`feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`, optional scope, optional `!`), header ≤ 72 characters, blank line before the body, body lines ≤ 100 characters (URLs and trailers exempt).
- pre-push refuses pushes to (and deletion of) `main`, `master` and `develop` (`git config hooks.protectedBranches` to change). Changes reach `main` only through pull requests.
- Don't add husky or lefthook back as npm dependencies: their install steps overwrite `.husky/*`.

## Branching (trunk-based)

- `main` is the only long-lived branch and stays releasable: every change merged into it passes `npm test` and both type checks. There are no `develop`, `release/*` or `hotfix/*` branches on the fork.
- Branch from an up-to-date `main` and name the branch after the Conventional Commit type: `git fetch origin && git switch -c fix/recalc-stuck origin/main`.
- Keep branches short-lived (a day or two) and to one logical change. Split larger work into several pull requests; keep unfinished features unreachable (unrouted, behind a setting or a debug flag) rather than holding a long branch.
- Update a branch by rebasing (`git rebase origin/main`), not by merging `main` into it.
- Make every change on that branch, push it to `origin` and open a pull request against the fork, since `gh` otherwise targets upstream: `gh pr create --repo vdRobin/elevate --base main`. Pull requests are Rebase-merged, then the branch is deleted.
- **Never merge anything into `main` yourself**: no merging or rebasing into `main`, no commits or pushes to `main`, no `gh pr merge`. Open the pull request and leave the merge to the user.
- Releases are tags on `main` in upstream's format (`7.2.3`, `7.3.0-beta.1`). A fix for a released version is an ordinary branch off `main` followed by a new tag.
- Upstream (`upstream` remote) still uses git-flow on `develop`. Bring its changes in on a branch (`git fetch upstream && git switch -c chore/sync-upstream origin/main && git merge upstream/develop`) and merge that pull request with a merge commit, not a squash, so later upstream merges keep a common ancestor.

## Big-picture architecture

### One Angular source tree, two apps
appcore is compiled per target using `fileReplacements` in `appcore/angular.json`. Three placeholder files are swapped:
- `src/environments/environment.ts` → `environment.desktop[.prod].ts` or `environment.prod.ts` (`buildTarget`, `backendBaseUrl`, log level, debug flags)
- `src/app/boot/target-boot.module.ts` → `desktop-boot.module.ts` / `extension-boot.module.ts` (imported by `AppModule`: error handler, `AppLoadService`, `AppService`, menu items, shell widget components)
- `src/app/shared/modules/target/target.module.ts` → `desktop-target.module.ts` / `extension-target.module.ts` (imported by `SharedModule`: `DataStore`, `ActivityService`, `SyncService`, `AthleteService`, `UserSettingsService`, `VersionsProvider`, etc.)

The placeholders contain no providers, so the IDE, `type:check` and Jest see an app with nothing bound. Specs must import `desktop-target.module` or `extension-target.module` directly and provide `{ provide: DataStore, useClass: TestingDataStore }`. Most specs only cover the desktop graph.

Abstract classes are the DI tokens; consumers `@Inject(AbstractType)` and annotate with the concrete `Desktop*`/`Extension*` type only in target-specific code. Services are module-provided (not `providedIn: 'root'`), so a new service must be added to `SharedModule`, a target module, a boot module, or its feature module. Shell widgets (top bar, sync bar, update bar, sync menu, more menu, recalculate bar, splash) are abstract components resolved through injection tokens and created dynamically in `AppComponent` anchor directives.

Code under `src/app/desktop/` and `src/app/extension/` is target-only and must only be referenced from that target's modules. Routing (`shared/modules/routing/*-routing.module.ts`) is hash-based and fully lazy; route names in `shared/models/app-routes.ts` double as UI titles via `_.startCase`.

### Shared library across three runtimes
`appcore/modules/shared` (models, enums, sync events, exceptions, the IPC contract in `electron/`, and the compute engine in `sync/compute/` such as `ActivityComputer`) is consumed by appcore, desktop main and the webextension through `@elevate/shared/*` tsconfig path aliases. Keep it free of Angular and of Node-only APIs (`fs` is aliased to an empty stub in appcore). Changing `Activity` or compute code affects all three projects.

### Data
All athlete data is one LokiJS in-memory database owned by the Angular app (`src/app/shared/data-store/data-store.ts`), persisted to IndexedDB on desktop (incremental adapter) and to `chrome.storage.local` on the extension (custom adapter shared with extension scripts, which signal changes via `CoreMessages.ON_EXTERNAL_DB_CHANGE`). Access goes components → services → DAOs (`BaseDao<T>`, one per collection) → `DataStore`. Things to know:
- Reads return live Loki objects; mutate clones, then `update`/`put`.
- `findOne` on an empty singleton collection inserts the DAO default in memory.
- Every write calls `saveDatabase` for the whole database.
- Streams (per-second sensor data) are stored apart in `streams`, lz-string compressed.
- `startTimestamp` fields are seconds; sync date times are milliseconds.
- Small config also lives in `localStorage` and, on desktop, in main-process `ipc.storage.json` (installed version, recalculation flag) via `IpcStorageService`.

Activities embed an `athleteSnapshot` resolved from dated athlete settings (exactly one entry with `since: null`). When settings change, snapshots become inconsistent and the app offers a recalculation.

### Desktop renderer ↔ main
The preload script (`desktop/src/pre-loading/pre-loader.ts`) exposes `window.api` (`BridgeApi`). Both sides use `IpcTunnel` from `@elevate/shared/electron` with channel names from the `Channel` enum and positional array payloads. Sync runs in main (Strava API and file connectors, compute workers), but the database lives in the renderer: main calls back with `findActivity`/`findStreams` and pushes `syncEvent`s that `DesktopSyncService` upserts. Recalculation sends `computeActivity` to main per activity. Backups stream chunks over IPC to a `.elv` file.

### Desktop migrations
On startup `DesktopLoadService` runs `DesktopMigrationService.upgrade()`. To add one: create `src/app/desktop/migration/upgrade_X_Y_Z/` with a class extending `DesktopMigration` (pre-release names use `$`, e.g. `Upgrade_7_0_0$beta_3`), set `version`, `description`, `requiresRecalculation`, operate on raw Loki collections idempotently, and append it to `DesktopRegisteredMigrations.LIST` in `desktop-registered-migrations.ts`. Emulate an upgrade by lowering `version` in `ipc.storage.json` in the user data folder. Restored backups set the installed version to the backup's, so migrations upgrade them on next start.

### Errors
The per-target `ElevateErrorHandler` shows `WarningException` (from `@elevate/shared/exceptions`) as a snackbar with an optional action; other errors open a dialog with the stack, and desktop production reports to Sentry. Services throw `WarningException` for expected user-facing failures. Dialog `title`/`content` are rendered as trusted HTML, so escape dynamic values.

### Debug aids
- Desktop dev build shows a debug ribbon (wipe activities, reload, restart) and exposes `window.db` and `window.data`.
- Desktop dev only: set localStorage `DEBUG_EST_VS_REAL_WATTS=true` to compare estimated vs real power.
- The desktop `desktop` (dev) build has AOT disabled; build `desktop-prod` or `extension` to catch template errors.
