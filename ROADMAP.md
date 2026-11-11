# Roadmap

Plan for the `vdRobin/elevate` fork, written on 2026-10-17 against version 7.2.2. Technical work comes first: a green baseline, fork hygiene, data safety, and a supported Electron. New features follow. Defect IDs (F1, D1, G1, S1, ...) refer to `.claude/skills/elevate-fix-defect/references/defect-catalog.md`, which holds the file, line and fix sketch for each item. The background is in `appcore/docs/architecture/assessment.html`.

When an item lands, set its status here to `done` with the PR number, and update the catalog entry.

## Scope

- **Personal builds.** The fork's builds are for its owner only. Installed builds update from the fork's own GitHub releases, which CI builds on a tag. No crash reporting.
- **Desktop first.** The Chrome extension only has to keep compiling and passing its tests; it gets no new features.
- **Strava connector unchanged.** It stays as it is; no work is planned on it.
- **Electron now, Angular later.** Electron 27 is end of life and is the security surface, so it moves early. Angular 14 moves to 16 one major at a time once CI and tests are solid, keeping NgModules.
- **Order.** Phases 0–3 come strictly first, then faster recalculation, then the feature tracks: Garmin import (watch over USB and Garmin Connect export), then Maps (MapLibre and a heatmap). ML and AI features stay in Later.
- **Platform:** Linux packaging (`npm run build:package:linux`). macOS signing is out of scope.

## Known baseline problems

Found on 2026-10-17. These are why Phase 0 comes first.

- `npm run type:check:desktop` fails, for two reasons:
  - Desktop compiles `../appcore/modules/shared`, which resolves `electron` types from `appcore/node_modules` (^17), while desktop's own code resolves `^27`. Both are loaded, giving TS6200 and TS2717 errors in `electron.d.ts`.
  - With npm 9.0–9.3 (`install-links=true` by default), `appcore/node_modules/@elevate/shared` is a stale copy instead of a symlink. `app-package.ts` then resolves its `../../../../package.json` import to appcore's package.json, and tests can run against outdated shared code.
- No CI runs tests or type checks. The only workflow is `.github/workflows/codeql.yml`, which uses CodeQL action v2.
- TLS certificate verification is disabled in `desktop/src/clients/http.client.ts` (catalog S5, upstream issue #1250).

## Phase 0: Green baseline and CI

| # | Status | Branch | Change |
|---|--------|--------|--------|
| 0.1 | done (0b5a9f1f) | `build/npm-install-links` | Add `.npmrc` with `install-links=false` to `appcore/` and `webextension/`, so `file:` dependencies are symlinks. Add a root `.nvmrc` (Node 22) and update the Node note in the README. |
| 0.2 | done (f49b5e40, 252bfcf3, 479fb823) | `fix/desktop-type-check` | Make desktop type-check shared code against its own Electron by mapping `"electron": ["./node_modules/electron"]` in `desktop/tsconfig.json` `paths`. If that is not enough, align appcore's `electron` devDependency with desktop's. |
| 0.3 | done (#13) | `ci/pr-checks` | GitHub Actions on pull requests and `main`, Node 22 on ubuntu: root install, `type:check:desktop`, `type:check:extension`, `npm test` (Karma uses the runner's Chrome), and `ng build --configuration=desktop-prod` in `appcore/` to catch AOT template errors. Bump CodeQL to v3. |
| 0.4 | done (#14) | `test/run-shared-specs` | L5: add `<rootDir>/modules/` to the appcore Jest `roots` once its spec passes. |

Exit criterion: CI is green on `main`. Met on 2026-11-11 (run 43087325667).

## Phase 1: Fork hygiene

| Status | Branch | Items | Change |
|--------|--------|-------|--------|
| done (#15) | `fix/disable-upstream-telemetry` | F1, F2, S2 (C8 becomes moot) | Add `sentryDsn: null` and `backendBaseUrl: null` to the desktop environments. Skip `Sentry.init` when the DSN is null, and drop names and OS identifiers from the Sentry context. The fork has no crash reporting, so the DSN stays null. Make `MachineService.checkIn`, `DesktopInsightsService.registerActivities` and `MapTokenService` no-ops when the backend URL is null. |
| done (#17) | `fix/fork-identity` | F3, F4, F5 | Give the fork its own `appId` and `productName`: the desktop app is **Elevator** (`com.vdrobin.elevate`), with its data in its own folder (`~/.config/Elevator` on Linux). Point `publish.owner` and `repository.url` (root and desktop `package.json`) at `vdRobin/elevate`, since the fork publishes its own releases and installed builds must never update to an upstream release. Fork tags must sort above the upstream version they replace (for example `7.3.0`). Keep credit to the original author in LICENSE and About. |
| done (#16) | `fix/remove-upstream-links` | F7 | Remove the Help FAQ fetched from the upstream docs repo (`help.component.ts`), the Discord link (`report.component.ts`) and the Donate/PayPal page (`donate.component.ts`), with their menu entries and routes. F6 is handled by Maps track B1. |
| done (#29) | `ci/release-on-tag` | — | GitHub Actions job on a tag pushed on `main`: build the Linux AppImage (`build:package:linux`) and publish a GitHub release with `latest-linux.yml`, so electron-updater finds it. Needs Phase 0 CI and `fix/fork-identity`. Bump the version to `7.3.0` for the first fork release, and switch the Linux target from `deb` (the current `build.linux.target`) to `AppImage`. |

## Phase 2: Data safety and security

One small pull request per line, each with the regression spec named in the catalog.

| Status | Branch | Items | Change |
|--------|--------|-------|--------|
| done (#34) | `fix/recalc-lock` | D1 | Reset `isRecalculating` and emit `ended` when recalculation fails. |
| done (#35) | `fix/sync-complete-catch` | D4, C1, C6 | Release the syncing state when saving fails; null check for fast sync with an empty database; tag errors with the current connector. |
| done (#38) | `fix/backup-errors` | D5 | Error the backup progress subject on IPC or disk failures. |
| done (#41) | `fix/atomic-restore` | D2 | Stage the restore in memory, validate it on a throwaway Loki, and replace the live data only when every announced document has been read. |
| done (#37) | `fix/worker-crash` | D6 | Handle worker `error` and `exit` events in `desktop/src/worker-service.ts`. |
| done (#39) | `fix/tls-verification` | S5 | Remove `rejectUnauthorized: false` from `http.client.ts`. |
| done (#40) | `fix/escape-error-dialogs` | S1, S4 | Add an `escapeHtml` helper in `modules/shared/tools` and escape dynamic text in trusted dialog HTML; gate `window.db` behind `!environment.production`. |
| open | `fix/csp` | S1 | CSP meta tag in `appcore/src/index.html` (split from `fix/escape-error-dialogs`). Shared by both targets; allow Google Fonts and Mapbox GL's blob workers and tiles. Needs a manual run of the desktop app with the console open (map, fonts, sync, backup) before merge. |
| open | `fix/extension-restore` | D3, D7, C2 | Keep the extension safe: validate before wiping on restore, invalidate the collection cache on reload, wait for the database `LOADED` event. |
| open | — | C3, C4, C7, L1–L4 | Small correctness fixes. |

## Phase 3: Electron upgrade

| Status | Branch | Change |
|--------|--------|--------|
| open | `build/electron-upgrade` | Move desktop from Electron 27 to the current supported stable major, with matching `electron-builder` and `electron-updater`, and the same version for appcore's `electron` types. Check `BrowserWindow` options, the preload bridge and `safeStorage` against Electron's breaking-changes list. Test the Linux package: build, launch the AppImage, run a file sync, a backup and a restore. |
| open | `fix/encrypt-secrets` | S3: move the Strava tokens (`StravaConnectorInfo` in IndexedDB) and other secrets to main, encrypted with Electron `safeStorage`; the renderer keeps only a flag. Same pattern as the AI key in the `elevate-ai-assistant` skill. |

Feature work starts once this phase lands.

## Phase 3.5: Faster recalculation

| Status | Branch | Items | Change |
|--------|--------|-------|--------|
| open | `perf/parallel-recalc` | #1108 | Recalculate several activities at once. Today the renderer (`DesktopActivityService.recalculate`) sends one `computeActivity` request at a time and main computes it in a new worker: send a bounded number of requests concurrently from the renderer and run them on a bounded worker pool in main. Requests go through `invoke`, so responses stay matched (catalog C5 does not apply). Needs D6 (`fix/worker-crash`) so a crashed worker cannot stall the pool. |

## Phase 4: Test floor and Angular (alongside the features)

- Run some specs under `extension-target.module` (backup, restore and sync now have desktop specs from Phase 2).
- Angular 14 → 15 → 16 with `ng update`, one major per pull request (16 drops `ngcc`), keeping NgModules. Replace `toPromise` with `firstValueFrom` on the way.
- Not planned yet: removing flex-layout, turning on `strict`.

## Track A: Garmin import

Guide: `.claude/skills/elevate-garmin-import`. Sources in scope: a watch mounted over USB and a Garmin Connect "Export your data" ZIP.

| # | Status | Branch | Change |
|---|--------|--------|--------|
| A1 | open | `fix/garmin-file-case` | G1, G2: lowercase file extensions in `desktop/src/connectors/file/file.connector.ts` and `un-archiver.ts`, so `GARMIN/Activity/*.FIT` and `.ZIP` files are found. Add an uppercase `.FIT` fixture. |
| A2 | open | `fix/garmin-export-nested-zip` | G3: inflate nested archives (with a depth limit), so a Garmin Connect "Export your data" ZIP imports; never delete a source archive that produced no activities. Add a zip-in-zip fixture. |
| A4 | open | `feat/garmin-device-detect` | On Linux, detect a mounted watch (`/media/$USER/*/GARMIN/Activity`, `/run/media/...`) and offer it as the File connector source. Replace the informational Garmin Connect component with real import guidance. |

## Track B: Maps

Guide: `.claude/skills/elevate-maps-gpx`.

| # | Status | Branch | Change |
|---|--------|--------|--------|
| B1 | open | `feat/maplibre-osm` | Replace Mapbox GL with MapLibre GL and a token-free OpenStreetMap-based style in `activity-view-map.component.ts`. Closes F6 and removes the dependency on `MapTokenService` and the upstream backend. Keep the start, end and move markers and the chart-to-map hover sync. |
| B3 | open | `feat/activities-heatmap` | Map of all activities from the stored `latlng` streams: decode the compressed streams in a worker, downsample, render as a MapLibre heatmap or line layer, and filter by sport and date. |

## Maintenance and open decisions

| Status | Item |
|--------|------|
| open | **Target platform.** The release job builds only the Linux AppImage, and the manual checks assume Linux. Decide whether Windows is also a target; if so, add an NSIS build (unsigned) to `release.yml` and a manual Windows run. |
| open | **First release.** Push the `7.3.0` tag on `main` (publishes a public GitHub release), then a later tag to check that an installed build offers the update (see Verification). |
| open | **Manual run** of sync, recalculation, backup and restore on the target platform before the Electron upgrade, so regressions from Phase 2 (notably D2) are told apart from the upgrade's. |
| open | **Dependabot policy.** Close the failing webextension build-tool upgrades (webpack, copy-webpack-plugin, karma-webpack), which the extension does not need, and group routine updates (e.g. weekly, desktop and appcore). |
| open | **Prune `origin` branches**: stale upstream branches (`snyk-*`, `feature/*`, `master`, `gh-pages`, old Dependabot branches). |

## Later

Ideas not yet scheduled:

- IPC request ids for main-to-renderer `send` (catalog C5). Only needed if a sync starts issuing concurrent `findActivity`/`findStreams` requests.

- From the Garmin track: file sync when the app starts (A3, upstream #1225, #1244); importing overlapping activities recorded on different devices (A5, #1089); FIT sport mapping for tennis and padel (A6, #1245, #1182) and hiding or implementing the "detect sport type" option (C9).
- From the Maps track: a GPX route and course viewer with an elevation profile (B2).
- From upstream issues: all-time records (#1179), manual stress score override (#1129), gear and maintenance tracking (#1117), year progressions for all activity types (#1178).
- ML and AI: sport auto-detection and FTP/critical power estimation (`.claude/skills/elevate-ml-features`), an AI coach (`.claude/skills/elevate-ai-assistant`).

## Verification

- Every pull request: `.claude/skills/elevate-verify/scripts/verify.sh`, which runs the type checks and tests for the changed projects, plus `npx ng build --configuration=desktop-prod` in `appcore/` when templates change. CI repeats this once Phase 0 lands.
- Phase 0 is done when both root type checks pass locally and in CI from a clean install, and `appcore/node_modules/@elevate/shared` is a symlink.
- Phases 1–3: the catalog's regression specs pass. A manual Linux run (`npm start` and `npm run launch:dev:app` in `desktop/`, then the packaged AppImage) covers a sync, a recalculation, and a backup and restore. With telemetry disabled, DevTools Network shows no requests to upstream hosts.
- Release job: a test tag produces a GitHub release with the AppImage and `latest-linux.yml`, and an installed older fork build offers the update.
- Phase 3.5: a parallel recalculation gives the same activity results as a sequential one on a fixture set, and is faster on several hundred activities.
- Track A: a `GARMIN/Activity` folder copied from a watch and a Garmin Connect export ZIP both import with the expected activity counts, and the source archive is kept.
- Track B: the activity map renders with no token configured; the heatmap stays responsive with several hundred activities.
