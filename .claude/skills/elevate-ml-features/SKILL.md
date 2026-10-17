---
name: elevate-ml-features
description: Add machine-learning or advanced analytics features to Elevate — sport-type auto-detection, FTP / critical power / threshold heart-rate estimation, VO2max, aerobic decoupling, fatigue and fitness forecasting, anomaly detection in sensor data, route or workout clustering, or any new computed stat, score or per-activity metric. Use this whenever the user mentions ML, models, prediction, estimation, "smart" features, new metrics or stats, training load, or improving the analytics in Elevate, even if they don't say "machine learning". Also covers the end-to-end checklist for adding a new stat to the Activity model.
---

# ML and analytics features in Elevate

Elevate is already an analytics engine: `appcore/modules/shared/sync/compute/` computes stress scores (TRIMP, HRSS, PSS, RSS, SSS), normalised power, peaks, zones, estimated cycling and running power, splits and calories. Desktop flags implausible data in `desktop/src/processors/activity-flags/`. Fitness trend implements the Banister model in `appcore/src/app/fitness-trend/shared/services/fitness.service.ts`. New ML features should extend this engine, in TypeScript, so they run offline on both targets and stay reproducible.

## 1. Classify the feature: where does it run?

| Kind | Example | Where | Why |
|------|---------|-------|-----|
| Per-activity, deterministic | decoupling, VO2max estimate, a new score | `appcore/modules/shared/sync/compute/` called from `ActivityComputer` | Runs in the desktop compute worker and in the extension, and recalculation reapplies it. |
| Per-activity, needs a trained model | sport-type classifier | Feature extraction in shared compute; inference in a desktop worker (`desktop/src/workers/` + `WorkerType` + a rollup entry in `desktop/rollup.config.js`) | Keeps models out of the renderer bundle and off the UI thread. |
| Across the whole history | FTP or critical-power fit, max HR estimate, fitness forecast | A renderer service reading activity summaries through `ActivityService` (no streams), or a desktop worker fed with summaries over IPC if it is heavy | History lives in the renderer database. Never load all streams to fit a model. |
| Data quality | new anomaly flag | `desktop/src/processors/activity-flags/activity-flags.processor.ts` + `ActivityFlag` enum | Existing flags drive fitness-trend exclusions and the activity view's flag list. |

Prefer closed-form or small iterative fits (least squares, Gauss–Newton, logistic regression, k-nearest neighbours on summary features) written in plain TypeScript. Add a dependency only when the math is genuinely complex. A native ML runtime in Electron main needs electron-builder `asarUnpack` and per-platform builds, so it is a decision for the user.

## 2. Good first features

These fit the existing data and fill gaps the user will notice:

1. **Sport-type auto-detection.** The File connector UI already has a "detect sport type when unknown" option (`fileConnectorInfo.detectSportTypeWhenUnknown`) that is saved but never used, and `activity.autoDetectedType` is always `false` (`desktop/src/connectors/base.connector.ts:123`). Extract features from streams (speed distribution, cadence range, grade, power presence, GPS presence) and classify when sports-lib reports an unknown or generic type. Start rule-based, then fit a small model on the user's own labelled history.
2. **Threshold suggestions.** Missing FTPs cause `settingsLack` flags and blank stress scores. Fit critical power from the best power peaks across recent activities, and running threshold pace from best paces. Show suggestions next to dated athlete settings; never write athlete settings without the user's click, because changing them triggers a recalculation of every activity.
3. **Aerobic decoupling (Pa:HR / Pw:HR)** per activity, from first-half versus second-half efficiency on steady efforts.
4. **Forecasting** on top of the Banister model: projected CTL and TSB for a planned load, extending the existing preview days.

## 3. Checklist: adding a new per-activity stat

A stat crosses every layer; missing one shows up as blank cells or stale values.

1. **Model** — add an optional field to the right stats class in `appcore/modules/shared/models/sync/activity.model.ts`. Optional, because stored activities do not have it.
2. **Compute** — implement it as a pure static function in `modules/shared/sync/compute/` (new file if over ~50 lines) and call it from the relevant private `*Stats` method of `ActivityComputer`. Guard every stream access: streams can be missing or contain `null`s.
3. **Display** — add a stat definition in `appcore/src/app/desktop/activity-view/shared/models/stats/stats-def.namespace.ts` and include it in the right group under `stats/groups/`.
4. **Table** — add a column in `appcore/src/app/activities/activity-columns.namespace.ts` if users should sort or filter by it.
5. **Migration** — add a desktop migration with `requiresRecalculation: true` so existing activities get the value (see `CLAUDE.md` → Desktop migrations).
6. **Extension** — check `webextension/scripts` consumers of `ActivityComputer` results; the extension shows stats on strava.com.
7. **Units** — follow existing conventions: metres, seconds, m/s internally; conversion happens in sensors for display.

## 4. Validate against something real

Analytics bugs are silent, so tests must compare to known values:

- **Known-answer unit tests** for the pure function (hand-computed inputs and outputs).
- **Device ground truth:** FIT imports store device-reported values in `activity.srcStats`. Compare your estimate with them on fixtures, and with real power where a power meter exists. The README describes a `DEBUG_EST_VS_REAL_WATTS` local-storage switch for estimated versus real power in development builds.
- **Fixtures:** desktop has real files under `desktop/src/connectors/*/fixtures`; appcore has `src/shared-fixtures`.
- For trained models, report accuracy on held-out data in the test or a script output, and keep the training script and data provenance in the repo (for example under `tools/ml/`), so a future change can retrain.

## 5. Guardrails

- **Determinism:** the same activity and settings must give the same output, or recalculation churns data and consistency checks flag activities forever. Seed anything random.
- **Snapshots:** per-activity computations must use the activity's `athleteSnapshot`, not current settings.
- **Performance:** compute runs once per activity during sync and recalculation; keep per-point work linear.
- **Privacy:** models run locally. Do not send streams or athlete data anywhere for ML (see `elevate-ai-assistant` for opt-in remote AI).

## 6. Verify

Run `elevate-verify` for `appcore` and `desktop` (shared compute changes affect both), and `webextension` tests if shared models changed. Then ask the user to run a recalculation on their data in the dev app and spot-check a few activities.
