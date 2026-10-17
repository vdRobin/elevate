# Elevate defect catalog

Found by reading the code at commit `df9e2ceb` (version 7.2.2). None were reproduced at runtime when this was written. Re-check the cited lines before editing. When you fix an item, change its status to `fixed YYYY-MM-DD` and note the commit if there is one.

Paths are relative to the repository root.

## Contents

- P0 Fork hygiene (F1–F7)
- P1 Data safety and stuck states (D1–D7)
- P1 Garmin import blockers (G1–G3)
- P2 Security and privacy (S1–S4)
- P2 Correctness (C1–C9)
- P3 Cleanups (L1–L5)

---

## P0 Fork hygiene

The fork inherits endpoints and identifiers that belong to the original author. Shipping a build without fixing these sends the user's athlete data and crash reports to someone else's servers, and lets upstream releases overwrite the fork on update. Each value should come from configuration the fork owns. Prefer turning a feature off (null endpoint, disabled sender) over pointing it at a new service the user has not set up.

| ID | Status | Location | Problem | Fix sketch |
|----|--------|----------|---------|-----------|
| F1 | open | `appcore/src/app/errors-handler/desktop-elevate-error-handler.ts` (`SENTRY_DATA_SOURCE_NAME`) | Production desktop builds send exceptions plus athlete first/last name, OS username and hostname to the upstream Sentry project. | Read the DSN from `environment` (`sentryDsn: null` by default) and skip `Sentry.init` when null. Drop names and OS identifiers from `Sentry.setContext` even when a DSN is set. |
| F2 | open | `appcore/src/environments/environment.desktop.prod.ts:19` (`backendBaseUrl`) | Machine check-in every 5 minutes (`app-load/desktop/desktop-load.service.ts:73-76`) sends the full athlete model to the upstream backend; insights upload activities after each sync (`desktop-sync.service.ts:353`) and recalculation. | Set `backendBaseUrl: null` for the fork and make `MachineService.checkIn`, `DesktopInsightsService.registerActivities` and `MapTokenService` no-ops when it is null. `MapTokenService` then falls back to the user token setting. |
| F3 | open | `desktop/package.json:128` (`build.publish.owner`/`repo`) | electron-builder publishes to and electron-updater updates from `thomaschampagne/elevate`. An installed fork build would auto-update to an upstream release and lose the fork's changes. | Point `owner` to the fork owner (`vdRobin`) or remove `publish` until the fork has its own releases. Also update `repository.url` in `desktop/package.json:46`: `desktop/src/updates/update-handler.ts` reads it to list GitHub releases. |
| F4 | open | `desktop/package.json:114` (`build.appId`, `productName`) | Same `appId` as upstream: the fork shares the user-data folder, IndexedDB and `ipc.storage.json` with an installed upstream Elevate, and migrations from either app run against the other's data. | Give the fork its own `appId` and `productName` (the existing `build:package:*:dev` scripts show the pattern). |
| F5 | open | root `package.json` (`repository.url`, `author.web`), read by `appcore/modules/shared/tools/app-package.ts` | Release notes, "new version installed" dialog, latest-release links, website, docs and privacy links resolve to the upstream repo and site. | Update `repository.url` to the fork. Keep author attribution in `LICENSE` and credits; only change URLs used for runtime links. |
| F6 | open | `appcore/src/app/desktop/activity-view/activity-view-map/activity-view-map.component.ts:37` | Outdoor map style is a Mapbox style owned by the upstream account (`mapbox://styles/thomaschampagne/...`); it can disappear or be restricted at any time. | See the `elevate-maps-gpx` skill: use a public Mapbox style or a token-free MapLibre/OSM style. |
| F7 | open | `appcore/src/app/help/help.component.ts:31`, `report/report.component.ts:76`, `donate/donate.component.ts:12` | Help FAQ fetched from upstream docs repo; Discord and PayPal links go to upstream. | Decide with the user: keep (credit upstream) or point to fork resources. Not a privacy issue. |

## P1 Data safety and stuck states

| ID | Status | Location | Problem | Fix sketch | Regression spec |
|----|--------|----------|---------|-----------|-----------------|
| D1 | open | `appcore/src/app/shared/services/activity/impl/desktop-activity.service.ts:122` and `:163`, catches at `:150`, `:194` | `isRecalculating` is only reset on success. One failed activity blocks all later recalculations; `recalculate$` never emits `ended`, so `isSyncing$` stays `true` and the UI stays locked. | In both catch branches set `isRecalculating = false` and emit a final notification with `ended: true` before rejecting. | Make `compute` reject on the second activity; assert `isRecalculating === false` and an `ended` notification. |
| D2 | open | `appcore/src/app/desktop/backup/desktop-backup.service.ts:199`, `:221` | Restore wipes every in-memory collection on the first chunk; completes only when the count equals `metadata.totalDocs`; `ended` is ignored. A bad backup leaves a half-restored database that the next write persists. | Stage chunks in a fresh `Loki` instance (memory adapter) and swap collections only after the count matches; on `ended` with a mismatch, error the subject without touching the live db. | Feed metadata with `totalDocs: 3` then two chunks and `ended`; assert the live collections are unchanged and the subject errors. |
| D3 | open | `appcore/src/app/shared/services/sync/impl/extension-sync.service.ts:191` | Extension restore clears activities, streams, sync time and athlete before inserting; `validateInsert` can reject after the wipe. | Validate the athlete model (`athleteService.validate`) and activities before `clearActivities()`. | Backup with duplicate `since` dates: assert activities are still present after the rejection. |
| D4 | open | `appcore/src/app/shared/services/sync/impl/desktop-sync.service.ts:326` | `handleSyncCompleteEvents` has no catch: a failed save leaves `isSyncing$` true and drops the complete event. | Add a terminal `.catch` that logs, emits `isSyncing$.next(false)`, forwards an `ErrorSyncEvent` and rethrows to the error handler. | Make `connectorSyncDateTimeDao.put` reject; assert `isSyncing$` emits `false`. |
| D5 | open | `appcore/src/app/desktop/backup/desktop-backup.service.ts:59` | Backup promise chain has no error handling; the progress subject never completes on IPC or disk errors. | Add `.catch(err => backupProgress$.error(err))` to the outer chain. | Make `ipcTunnelService.send` reject on `backupWriteObj`; assert the subject errors. |
| D6 | open | `desktop/src/worker-service.ts:20-24` | Only the `message` event is handled. A worker that throws at load time, crashes or exits without posting leaves the promise pending forever, which stalls a whole sync or recalculation. | Also handle `error` (reject) and `exit` with a non-zero code before a message (reject). Terminate the worker after the message. | Point at a worker script that throws; assert the promise rejects. |
| D7 | open | `appcore/src/app/shared/data-store/data-store.ts` `resolveCollection` with `impl/extension-data-store.service.ts` | Likely: the collection cache is never invalidated on `reload()`. The extension store flushes changes on every resolve, so cached entries are never dirty and keep pre-reload objects after `ON_EXTERNAL_DB_CHANGE`. | Clear `COLLECTIONS_MAP` in `reload()` after `loadDatabase` succeeds. | Insert a doc, reload the db from a different JSON, assert `find()` returns the new data. |

## P1 Garmin import blockers

| ID | Status | Location | Problem | Fix sketch |
|----|--------|----------|---------|-----------|
| G1 | open | `desktop/src/connectors/file/file.connector.ts:1035` | Extension check is case-sensitive: `path.extname(file).slice(1)` is compared with `"fit"`, `"gpx"`, `"tcx"`. Garmin devices write `GARMIN/Activity/*.FIT`, so a folder copied from a watch imports nothing. The parser (`sports-lib.processor.ts`) already lowercases through the `extension()` helper. | Lowercase before comparing: `path.extname(file).slice(1).toLowerCase() as ActivityFileType`. Add a fixture with an uppercase `.FIT` name. |
| G2 | open | `desktop/src/connectors/file/un-archiver.ts:13` | Same case-sensitivity for archives: `.ZIP` exports are skipped. | Lowercase in `isArchiveFile`. |
| G3 | open | `desktop/src/connectors/file/file.connector.ts:1061` `inflateActivitiesFromArchive` | After extracting, only activity files are moved out; nested archives inside are deleted with the extract folder. A Garmin Connect "Export your data" ZIP stores FIT files in nested ZIPs, so nothing is imported, and with `deleteArchivesAfterExtract` (default `true`) the user's original export is deleted. Archives are also only processed on full sync, not fast sync. | Before scanning `extractDir`, call `scanInflateActivitiesFromArchives(extractDir, true, undefined, true)` so nested archives are inflated in place (with a depth limit). Do not delete the source archive when zero activity files came out of it. Add a fixture: zip containing a zip containing a `.FIT`. |

## P2 Security and privacy

| ID | Status | Location | Problem | Fix sketch |
|----|--------|----------|---------|-----------|
| S1 | open | `appcore/src/app/errors-handler/desktop-elevate-error-handler.ts:81`, `extension-elevate-error-handler.ts:34`; dialogs `shared/dialogs/confirm-dialog`, `got-it-dialog` | `error.stack` and the error message are placed in dialog `title`/`content`, which the dialogs mark trusted with `bypassSecurityTrustHtml` and bind with `[innerHtml]`. Messages can include text from activity files or API responses. The preload bridge forwards `invoke` for any channel. | Escape dynamic text before building dialog HTML (a small `escapeHtml` helper in `modules/shared/tools`), or render the stack in a `<pre>{{ }}</pre>` template. Keep `bypassSecurityTrustHtml` for static strings only. Consider a CSP meta tag in `appcore/src/index.html`. |
| S2 | open | `appcore/src/app/desktop/machine/machine.service.ts` `checkIn` | Sends the full `AthleteModel` (names, birth date, physiology). | Covered by F2 for the fork. If a backend is kept, send only fields it needs. |
| S3 | open | `StravaConnectorInfo` in IndexedDB; `machineToken` in `localStorage` | Secrets stored unencrypted in the renderer profile. | Move secrets to main and encrypt with Electron `safeStorage`; keep only a flag in the renderer. Same pattern as the AI key in the `elevate-ai-assistant` skill. |
| S4 | open | `appcore/src/app/shared/data-store/data-store.ts:309` | `window.db` exposed in production. | Gate on `!environment.production`. |

## P2 Correctness

| ID | Status | Location | Problem | Fix sketch |
|----|--------|----------|---------|-----------|
| C1 | open | `appcore/src/app/shared/services/sync/impl/desktop-sync.service.ts:59` | Strava fast-sync dereferences `findMostRecent()` without a null check. | Return `null` when there is no activity, which already means full sync. |
| C2 | open | `appcore/src/app/app-load/extension/extension-load.service.ts` | Extension waits a fixed 750 ms and ignores the database `LOADED` event. | Wait for both `super.loadApp()` and the minimum splash delay with `Promise.all`. |
| C3 | open | `appcore/src/app/shared/dao/athlete/athlete.dao.ts`, `strava-connector-info/strava-connector-info.dao.ts` | Defaults are shared static objects inserted by reference; Loki stamps `$loki`/`meta` onto them. | Return `_.cloneDeep(...DEFAULT_MODEL)` from `getDefaultStorageValue()`. |
| C4 | open | `appcore/modules/shared/resolvers/athlete-snapshot.resolver.ts:17` | Sorts the caller's `datedAthleteSettings` in place, including the static default. | Sort a copy: `this.athleteModel = { ...model, datedAthleteSettings: _.sortBy(...) }` (keep it an `AthleteModel` instance if callers rely on methods). Shared code: run desktop tests too. |
| C5 | open | `appcore/modules/shared/electron/ipc-tunnel.ts:71` | Main-to-renderer `send` has no correlation id; concurrent requests on one channel can get each other's response. | Add a request id to the payload and response channel suffix, keep the current shape as the default path. Touches both renderer and main; test both. |
| C6 | open | `appcore/src/app/shared/services/sync/impl/desktop-sync.service.ts:419` | Upsert error tagged `ConnectorType.STRAVA` for every connector. | Use `this.currentConnectorType`. |
| C7 | open | `appcore/src/app/fitness-trend/shared/services/fitness.service.ts:29` | Promise-constructor anti-pattern; `reject()` without `return`; inner fetch failure leaves the page spinning. | Add `return` after each `reject`, and `.catch(reject)` on the inner fetch. Do not rewrite the whole method. |
| C8 | open | `appcore/src/app/desktop/machine/machine.service.ts` `auth()`, `machine-authenticated.service.ts:26` | `auth()` never errors if credentials lookup fails; 401/403 replays are unbounded. | `.catch(err => authentication$.error(err))`; retry auth once (`retry`/counter). Becomes moot if F2 disables the backend. |
| C9 | open | `appcore/src/app/desktop/connectors/file-connector/file-connector.component.html:89`, `desktop/src/connectors/base.connector.ts:123` | The File connector option "detect sport type when unknown" is saved but never read by the desktop connector; `autoDetectedType` is always `false`. | Either hide the option until detection exists, or implement it (see `elevate-ml-features`, first feature). |

## P3 Cleanups

| ID | Status | Location | Note |
|----|--------|----------|------|
| L1 | open | `appcore/src/app/desktop/migration/desktop-migration.service.ts:96`, `:100` | Duplicate `semver.eq` branch (dead code); migrations not capped at the target version (add `semver.lte(migration.version, toVersion)`). |
| L2 | open | `appcore/src/app/errors-handler/elevate-error-handler.ts:32`, `:77` | `error.message` read before the null check; fallback branch reads `.stack` of a falsy value. |
| L3 | open | `appcore/modules/shared/models/athlete/athlete-snapshot.model.ts:15` | `isSame` holds "is different"; `lthr` dereferenced without a guard. Rename locally and guard. |
| L4 | open | `appcore/src/app/shared/dao/base.dao.ts` | `removeMany` throws `NotImplementedException`; `DbEvent.SAVED` never emitted. |
| L5 | open | `appcore/jest.config.js` | `roots: ["<rootDir>/src/"]` skips `modules/shared/**/*.spec.ts`. Add `"<rootDir>/modules/"` once the spec there passes. |
