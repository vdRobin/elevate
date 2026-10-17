---
name: elevate-garmin-import
description: Bring Garmin data into the Elevate desktop app now that the Strava API is no longer free — importing FIT files from a Garmin watch, a Garmin Connect data export or per-activity downloads, auto-detecting a connected Garmin device, or adding a dedicated "Garmin" connector next to the existing File and Strava connectors. Use this whenever the user mentions Garmin, Garmin Connect, FIT files, importing activities from a watch, replacing or de-emphasising the Strava connector, or adding any new activity source/connector to Elevate, even if they don't say "connector".
---

# Garmin data in Elevate

Elevate already parses Garmin's native format. The desktop **File connector** reads `.fit`, `.gpx` and `.tcx` files through `@thomaschampagne/sports-lib` in a worker, computes every stat with the shared `ActivityComputer`, and deduplicates by start and end time. So the fastest, lowest-risk path to "use Garmin data" is to make file import work well for Garmin sources, then decide whether a dedicated connector is worth it.

Read `CLAUDE.md` first for the two-target build and the renderer/main split. Sync runs in Electron main (`desktop/src/connectors`), and the database lives in the renderer (`appcore`).

## Step 1 — Fix the blockers first

These defects stop Garmin files from importing today. Fix them before building anything new (details and specs in the `elevate-fix-defect` catalog, items G1–G3):

1. **Uppercase extensions** — Garmin watches write `GARMIN/Activity/*.FIT`; the scanner compares extensions case-sensitively and skips them (`file.connector.ts` `scanForActivities`, `un-archiver.ts` `isArchiveFile`).
2. **Nested archives** — Garmin Connect's full data export keeps FIT files inside ZIPs inside the ZIP; the extractor discards inner archives and may then delete the user's export.

After these, a user can already point the File connector at a copied `GARMIN` folder or an extracted export and get their history.

## Step 2 — Choose the Garmin source with the user

Garmin access options differ in legality, stability and effort. Read `references/garmin-sources.md` and present the options briefly; the choice is the user's. The short version:

- **Files (recommended start):** device folder, Garmin Connect data export, per-activity "Export Original". No credentials, no terms-of-service risk, works offline. Only needs the fixes above plus nicer UX.
- **Official Garmin API:** Garmin's developer program targets approved businesses. Check current terms with the user before planning around it.
- **Unofficial Garmin Connect login:** community libraries emulate the website login. It can break without notice and may violate Garmin's terms. Do not implement it unless the user explicitly decides to, knowing that.
- **Through a third party** that receives Garmin uploads and offers a personal API. Verify that the service's API terms and availability are current before relying on it.

Do not remove the Strava connector unless asked. Existing users have Strava-sourced activities, and the code paths are shared. "De-emphasise" means ordering and copy in the connectors page, not deletion.

## Step 3 — Pick the implementation shape

**Option A: Garmin-flavoured File connector (small, keeps DNA).** Keep `ConnectorType.FILE`. Add UX on top:
- a "Garmin device" helper in the File connector UI that suggests the device's `GARMIN/Activity` folder when a volume with that folder is mounted (main process checks paths through new IPC channels, or reuse `existsSync`/`isDirectory` from `BridgeApi`);
- an "Import Garmin Connect export" button that runs a one-off full sync on a chosen ZIP or folder;
- copy and ordering changes in `appcore/src/app/desktop/connectors/connectors.component.html` (the commented `<app-garmin-connect>` placeholder lives there).

**Option B: dedicated `GARMIN` connector.** Worth it only if the source is not a plain folder (an API, an MTP device, an export with special layout). Follow `references/connector-anatomy.md`, which lists every file to touch in all three projects. The usual design is `GarminConnector extends FileConnector` (or `BaseConnector` for an API), reusing `computeSportsLibEvent`, `createBareActivity`, `mapStreams` and `getSourceStats`.

Prefer A unless the user picked a non-file source in Step 2.

## Step 4 — Data details that matter for Garmin

- **Dedup** is by time overlap (`findLocalActivities(start, end)` → renderer `findByDatedSession`). Re-importing the same FIT files is safe; importing the same ride from Strava and from a FIT file creates a `MULTIPLE_ACTIVITIES_FOUND` or "existing activity" event, not a duplicate.
- **Fast sync** for files uses file modification/birth time against the last connector sync time, and skips archive extraction. Garmin exports have old mtimes: run a full sync for exports.
- **Device name** comes from the FIT creator (`fetchAndHandleDeviceName`); unknown Garmin product ids fall back to a lookup there. Extend it rather than adding a second mapping.
- **Garmin-specific fields** already mapped from sports-lib include running dynamics, cycling dynamics, training effect and SWOLF. Check `getSourceStats` before adding a field; new fields go on `Activity`/`ActivityStats` in `appcore/modules/shared/models/sync/activity.model.ts` and need a desktop migration (see the `elevate-ml-features` skill for the "new stat" checklist).
- **Multi-sport FIT** files contain several activities and transitions; transitions are skipped already.

## Step 5 — Test with real Garmin files

Add fixtures under `desktop/src/connectors/file/fixtures/` (keep them small; strip GPS if the user prefers privacy). Cover: uppercase `.FIT`, a nested-ZIP export, a multi-sport file, a pool swim, and a file whose activity already exists. Then run `elevate-verify` for `desktop` and, if shared models changed, `appcore`.

Ask the user for a sample of their own Garmin files if fixtures are missing: real devices produce fields that synthetic files miss.
