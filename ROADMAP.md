# Roadmap

Plan for the `vdRobin/elevate` fork, written on 2026-10-17 against version 7.2.2. Technical work comes first: a green baseline, fork hygiene, data safety, and a supported Electron. New features follow. Defect IDs (F1, D1, G1, S1, ...) refer to `.claude/skills/elevate-fix-defect/references/defect-catalog.md`, which holds the file, line and fix sketch for each item. The background is in `appcore/docs/architecture/assessment.html`.

When an item lands, set its status here to `done` with the PR number, and update the catalog entry.

## Scope

- **Desktop first.** The Chrome extension only has to keep compiling and passing its tests; it gets no new features.
- **Electron now, Angular later.** Electron 27 is end of life and is the security surface, so it moves early. Angular 14 moves to 16 one major at a time once CI and tests are solid, keeping NgModules.
- **Feature tracks:** Garmin import, then Maps and GPX. ML and AI features come after these.
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
| 0.1 | open | `build/npm-install-links` | Add `.npmrc` with `install-links=false` to `appcore/` and `webextension/`, so `file:` dependencies are symlinks. Add a root `.nvmrc` (Node 22) and update the Node note in the README. |
| 0.2 | open | `fix/desktop-type-check` | Make desktop type-check shared code against its own Electron by mapping `"electron": ["./node_modules/electron"]` in `desktop/tsconfig.json` `paths`. If that is not enough, align appcore's `electron` devDependency with desktop's. |
| 0.3 | open | `ci/pr-checks` | GitHub Actions on pull requests and `main`, Node 22 on ubuntu: root install, `type:check:desktop`, `type:check:extension`, `npm test` (Karma uses the runner's Chrome), and `ng build --configuration=desktop-prod` in `appcore/` to catch AOT template errors. Bump CodeQL to v3. |
| 0.4 | open | `test/run-shared-specs` | L5: add `<rootDir>/modules/` to the appcore Jest `roots` once its spec passes. |

Exit criterion: CI is green on `main`.

## Phase 1: Fork hygiene

| Status | Branch | Items | Change |
|--------|--------|-------|--------|
| open | `fix/disable-upstream-telemetry` | F1, F2, S2 (C8 becomes moot) | Add `sentryDsn: null` and `backendBaseUrl: null` to the desktop environments. Skip `Sentry.init` when the DSN is null, and drop names and OS identifiers from the Sentry context. Make `MachineService.checkIn`, `DesktopInsightsService.registerActivities` and `MapTokenService` no-ops when the backend URL is null. |
| open | `fix/fork-identity` | F3, F4, F5 | Give the fork its own `appId` and `productName`. Point `publish.owner` and `repository.url` (root and desktop `package.json`) at `vdRobin/elevate`, so installed builds never update to an upstream release. Keep credit to the original author in LICENSE and About. |
| open | — | F6, F7 | F6 is handled by Maps track B1. F7 (Help, Discord and PayPal links) needs a decision: keep them with credit to upstream, or point them at fork resources. |

## Phase 2: Data safety and security

One small pull request per line, each with the regression spec named in the catalog.

| Status | Branch | Items | Change |
|--------|--------|-------|--------|
| open | `fix/recalc-lock` | D1 | Reset `isRecalculating` and emit `ended` when recalculation fails. |
| open | `fix/sync-complete-catch` | D4, C1, C6 | Release the syncing state when saving fails; null check for fast sync with an empty database; tag errors with the current connector. |
| open | `fix/backup-errors` | D5 | Error the backup progress subject on IPC or disk failures. |
| open | `fix/atomic-restore` | D2 | Stage the restore in a fresh in-memory Loki and swap only when complete. |
| open | `fix/worker-crash` | D6 | Handle worker `error` and non-zero `exit` events in `desktop/src/worker-service.ts`. |
| open | `fix/tls-verification` | S5 | Remove `rejectUnauthorized: false` from `http.client.ts`. |
| open | `fix/escape-error-dialogs` | S1, S4 | Add an `escapeHtml` helper in `modules/shared/tools` and a CSP meta tag in `appcore/src/index.html`; gate `window.db` behind `!environment.production`. |
| open | `fix/extension-restore` | D3, D7, C2 | Keep the extension safe: validate before wiping on restore, invalidate the collection cache on reload, wait for the database `LOADED` event. |
| open | — | C3, C4, C7, L1–L3 | Small correctness fixes, done alongside nearby work. |

## Phase 3: Electron upgrade

| Status | Branch | Change |
|--------|--------|--------|
| open | `build/electron-upgrade` | Move desktop from Electron 27 to the current supported stable major, with matching `electron-builder` and `electron-updater`, and the same version for appcore's `electron` types. Check `BrowserWindow` options, the preload bridge and `safeStorage` against Electron's breaking-changes list. Test the Linux package: build, launch the AppImage, run a file sync, a backup and a restore. |

## Phase 4: Test floor and Angular (alongside the features)

- Specs for backup, restore and sync; run some specs under `extension-target.module`.
- Angular 14 → 15 → 16 with `ng update`, one major per pull request (16 drops `ngcc`), keeping NgModules. Replace `toPromise` with `firstValueFrom` on the way.
- Not planned yet: removing flex-layout, turning on `strict`.

## Track A: Garmin import

Guide: `.claude/skills/elevate-garmin-import`.

| # | Status | Branch | Change |
|---|--------|--------|--------|
| A1 | open | `fix/garmin-file-case` | G1, G2: lowercase file extensions in `desktop/src/connectors/file/file.connector.ts` and `un-archiver.ts`, so `GARMIN/Activity/*.FIT` and `.ZIP` files are found. Add an uppercase `.FIT` fixture. |
| A2 | open | `fix/garmin-export-nested-zip` | G3: inflate nested archives (with a depth limit), so a Garmin Connect "Export your data" ZIP imports; never delete a source archive that produced no activities. Add a zip-in-zip fixture. |
| A3 | open | `feat/file-autosync-startup` | File connector option to run a fast sync when the app starts (upstream #1225, #1244). |
| A4 | open | `feat/garmin-device-detect` | On Linux, detect a mounted watch (`/media/$USER/*/GARMIN/Activity`, `/run/media/...`) and offer it as the File connector source. Replace the informational Garmin Connect component with real import guidance. |
| A5 | open | `fix/overlapping-activities` | Import overlapping activities recorded on different devices (upstream #1089). Investigate the overlap check first; the likely fix allows overlaps when sport types differ. |
| A6 | open | — | FIT sport mapping for tennis and padel (upstream #1245, #1182); hide or implement the "detect sport type" option (C9). |

## Track B: Maps and GPX

Guide: `.claude/skills/elevate-maps-gpx`.

| # | Status | Branch | Change |
|---|--------|--------|--------|
| B1 | open | `feat/maplibre-osm` | Replace Mapbox GL with MapLibre GL and a token-free OpenStreetMap-based style in `activity-view-map.component.ts`. Closes F6 and removes the dependency on `MapTokenService` and the upstream backend. Keep the start, end and move markers and the chart-to-map hover sync. |
| B2 | open | `feat/gpx-route-viewer` | Import a `.gpx` route or course that is not an activity, store it in its own collection, and show it on the map with an elevation profile. Keep it unrouted until complete. |
| B3 | open | `feat/activities-heatmap` | Map of all activities from the stored `latlng` streams: decode the compressed streams in a worker, downsample, render as a MapLibre heatmap or line layer, and filter by sport and date. |

## Later

Ideas from upstream issues and the fork goals, not yet scheduled: all-time records (#1179), manual stress score override (#1129), gear and maintenance tracking (#1117), multi-threaded recalculation (#1108), year progressions for all activity types (#1178), sport auto-detection and FTP/critical power estimation (`.claude/skills/elevate-ml-features`), an AI coach (`.claude/skills/elevate-ai-assistant`).

## Verification

- Every pull request: `.claude/skills/elevate-verify/scripts/verify.sh`, which runs the type checks and tests for the changed projects, plus `npx ng build --configuration=desktop-prod` in `appcore/` when templates change. CI repeats this once Phase 0 lands.
- Phase 0 is done when both root type checks pass locally and in CI from a clean install, and `appcore/node_modules/@elevate/shared` is a symlink.
- Phases 1–3: the catalog's regression specs pass. A manual Linux run (`npm start` and `npm run launch:dev:app` in `desktop/`, then the packaged AppImage) covers a sync, a recalculation, and a backup and restore. With telemetry disabled, DevTools Network shows no requests to upstream hosts.
- Track A: a `GARMIN/Activity` folder copied from a watch and a Garmin Connect export ZIP both import with the expected activity counts, and the source archive is kept.
- Track B: the activity map renders with no token configured; the GPX viewer and heatmap stay responsive with several hundred activities.
