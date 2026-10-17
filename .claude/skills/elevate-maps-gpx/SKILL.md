---
name: elevate-maps-gpx
description: Build or change map and GPX visualisation in the Elevate desktop app — the activity map, GPX/TCX/FIT track display, importing and viewing GPX routes or planned courses, a heatmap or "all my rides" map, elevation/route overlays, map styles, and replacing or removing the Mapbox token dependency (MapLibre, OpenStreetMap or other tile providers). Use this whenever the user mentions maps, GPS tracks, GPX files, routes, heatmaps, Mapbox, tiles, or wants to "see" where activities happened, even if they don't name the component.
---

# Maps and GPX in Elevate

Maps exist only in the **desktop** build. The extension has no map view, and `mapbox-gl` CSS is only added in the `desktop` and `desktop-prod` Angular configurations. Read `CLAUDE.md` for the two-target layout before adding anything map-related to shared code.

## How a track reaches the screen today

1. **Parsing (desktop main):** `desktop/src/processors/sports-lib.processor.ts` parses GPX, TCX or FIT with `@thomaschampagne/sports-lib`, with altitude and grade smoothing. `FileConnector.mapStreams()` turns it into `Streams`; positions go to `streams.latlng` as `[lat, lng]` pairs.
2. **Storage (renderer):** streams are lz-string compressed in the `streams` collection, keyed by activity id. Activities only keep `latLngCenter`, not the track.
3. **Display:** `appcore/src/app/desktop/activity-view/activity-view-map/activity-view-map.component.ts` receives `latLng` from the activity view, flips to `[lng, lat]` for Mapbox, fits bounds, adds a GeoJSON `LineString` source and line layer, start and end markers, and a "move" marker synced to graph selections through `ActivityViewService.selectedGraphBounds$`.
4. **Tokens and styles:** `MapTokenService` returns the user's token from desktop user settings, else a backend token, else a bundled fallback. Without a token the map is hidden (`isMapReady = false`). Styles are listed in `STYLES`. The "outdoor" style belongs to the upstream author's Mapbox account (catalog item F6).

## Decide the tile strategy first

Every map feature depends on it, so settle it with the user before building on top:

- **Keep Mapbox GL v2** — needs a token. For the fork, the user supplies their own token in settings, and styles should be public Mapbox styles or the user's own, not the upstream account's.
- **Move to MapLibre GL JS** — an open fork of Mapbox GL with a very similar API, no token required by the library. Tiles still come from somewhere: a free vector-tile provider, a self-hosted style, or a keyed provider. Check the provider's usage policy. Public OpenStreetMap raster tile servers forbid heavy app traffic.

A MapLibre migration is mostly mechanical in the map component: swap the import, remove `accessToken`, replace `mapbox://` style URLs, replace `mapbox-gl-controls` `StylesControl` with a small style switcher, update `angular.json` CSS for both desktop configurations, and update the Jest mock in `appcore/src/test.ts`. Keep `MapTokenService` for providers that need a key. Rename user-facing "Mapbox" settings only if the user agrees, because `defaultMapType` and `mapToken` are stored settings and a rename needs a migration.

## Feature recipes

### Show a GPX file that is not an activity (route or course)

Routes have positions but often no timestamps, so they are not activities and must not go through the activity sync pipeline.
- Parse in **main**: add a channel (for example `Channel.parseRouteFile`) and a listener that reads the file and returns `{ name, latlng, altitude, distance }`. Reuse sports-lib if it accepts time-less GPX, which you need to test; otherwise a small GPX parse with the `xmldom` already used there.
- Store routes in a new collection (`routes`, DAO in `appcore/src/app/shared/dao/routes/`) with simplified coordinates, not the raw file.
- Display with a reusable map component extracted from `activity-view-map` (inputs: one or more tracks, colours, markers). Keep the activity map behaviour identical while extracting.
- Optional overlay: draw a route on an activity's map to compare plan and execution.

### Heatmap or "all activities" map

Loading every stream to draw one map does not scale: all streams are decompressed in the renderer's memory.
- Precompute a **simplified polyline per activity** (Douglas–Peucker or similar, a few hundred points) during compute or in a migration, and store it in its own collection (`activityTracks`, unique `activityId`). Keep it out of `Activity` so the activities table stays light.
- Backfill existing users with a desktop migration that iterates streams in chunks. It does not need `requiresRecalculation`.
- Render with a heatmap layer or many low-opacity lines; filter by sport and date range like the activities table.
- Add a lazy route (`AppRoutes`, `desktop-routing.module.ts`, desktop menu provider). Remember that the route name is also the UI title.

### Elevation profile and track colouring

Streams already carry altitude, grade, speed, heart rate and power per point. Colour a track by any of them with a GeoJSON line using `line-gradient` (needs `lineMetrics: true` on the source) or by splitting the track into segments. The activity graph (`activity-view-graph`, Plotly) already shares a time index with the map through `ActivityViewService`; reuse it for cross-highlighting instead of adding a new channel.

## Pitfalls

- Coordinates are `[lat, lng]` in streams and `[lng, lat]` in GeoJSON and map APIs. Convert in one place.
- `latlng` can be missing (indoor, pool swim, trainer) or contain gaps. Guard with `streams?.latlng?.length` as the activity view does, and skip `null` points.
- Map libraries need a real DOM and WebGL. Jest mocks them in `appcore/src/test.ts`, so test geometry helpers (simplification, bounds, colouring) as pure functions in their own files.
- Large GeoJSON sources freeze the UI. Simplify before handing data to the map.
- Desktop dev builds run without AOT. Build `desktop-prod` before calling a template change done.

## Verify

Run `elevate-verify` for `appcore` (and `desktop` if parsing or channels changed). Then ask the user to open an activity with GPS and one without in `npm start` + `npm run launch:dev:app`, since map rendering cannot be checked by unit tests.
