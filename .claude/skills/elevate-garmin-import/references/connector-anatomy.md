# Anatomy of a connector

Every file to touch when adding a new `ConnectorType` (for example `GARMIN`). Paths are from the repository root. Lines are from commit `df9e2ceb`; search by symbol if they moved.

## Shared contract — `appcore/modules/shared` (compiled into appcore, desktop and the extension)

| File | Change |
|------|--------|
| `sync/connectors/connector-type.enum.ts` | Add `GARMIN = "GARMIN"`. The string is stored on every activity (`activity.connector`) and in `connectorSyncDateTime`; never rename it later. |
| `sync/connectors/<name>-connector-info.model.ts` | New `GarminConnectorInfo extends ConnectorInfo` with a `DEFAULT_MODEL`. Mirror `file-connector-info.model.ts` (folder-based) or `strava-connector-info.model.ts` (credentials). |
| `sync/events/error-sync.event.ts` | Add new `ErrorSyncEvent` codes only if the connector has failure modes the existing ones do not describe. Each code must be classified in the renderer (see below). |

## Desktop main — `desktop/src`

| File | Change |
|------|--------|
| `connectors/<name>/<name>.connector.ts` | `@singleton()` class extending `BaseConnector` (API source) or `FileConnector` (file source). Implement `sync(): Subject<SyncEvent>` emitting `StartedSyncEvent`, one `ActivitySyncEvent` per activity, `GenericSyncEvent` for progress text, `ErrorSyncEvent`s, and completing the subject. Use `this.computeActivity(...)` (worker) and `this.findLocalActivities(...)` (dedup through the renderer). Honour `this.stopRequested` between activities. |
| `connectors/connector-sync.service.ts` | Register in `TOKENS_MAP`. This service enforces one sync at a time and relays events to the renderer. |
| `connectors/<name>/<name>.connector.spec.ts` + `fixtures/` | Copy the structure of `file.connector.spec.ts`: resolve from the tsyringe container, stub `findLocalActivities`, assert emitted events. |
| `listeners/*.listener.ts` + `main.ts` `setupListeners()` | Only if the connector needs extra renderer→main calls (for example an OAuth link like `ipc-strava-link.listener.ts`). Add a `Channel` enum value in `appcore/modules/shared/electron/channels.enum.ts`. |
| `clients/` | HTTP clients for API connectors live here (see `strava-api.client.ts`). |

## Renderer — `appcore/src/app`

| File | Change |
|------|--------|
| `shared/services/sync/impl/desktop-sync.service.ts` | `sync()`: add a branch that fetches the connector info and validates it before `startSync`. `CONNECTOR_SYNC_FROM_DATE_TIME_MAP`: add how fast sync computes its start time. `handleErrorSyncEvents`: classify any new error codes as fatal or non-fatal (unclassified codes throw). |
| `shared/services/<name>-connector-info/` + optional DAO | Where the connector config is stored. Folder settings: `localStorage` like `FileConnectorInfoService` (survives database wipes). Secrets: never in the renderer; store them in main with Electron `safeStorage` and expose only status. |
| `shared/modules/target/desktop-target.module.ts` | Provide the new info service (and DAO if any). |
| `desktop/connectors/<name>-connector/` | Component and service extending `ConnectorsComponent` / `ConnectorService`; declare in `desktop/connectors/connectors.module.ts`. |
| `desktop/connectors/connectors.component.html` | Place the connector card. Order expresses priority: put Garmin/File first if Strava is de-emphasised. |
| `shared/services/links-opener/impl/desktop-open-resource-resolver.service.ts` | How to open the source of an activity for this connector (web page, file in folder). |
| `desktop/activity-view/activity-view.component.html` | The "open source activity" buttons branch on `ConnectorType`. |
| `sync-bar/desktop-errors-sync-details-dialog.component.*` | Display text for any new error codes. |

## Checks before you finish

- Search all three projects for `ConnectorType.FILE` and `ConnectorType.STRAVA` and decide, for each hit, whether the new type needs a branch. A missing branch in `DesktopSyncService.sync()` throws "Unknown connector type to sync".
- Activities from the new source must set `activity.connector`, `creationTime`, `lastEditTime` and `id` through `assignBaseProperties`.
- Backup and restore need no change: desktop backups include every collection.
- The extension build never sees desktop connectors; nothing to do there unless shared models changed.
