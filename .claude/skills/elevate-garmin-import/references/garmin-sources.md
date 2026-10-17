# Garmin data sources

Garmin's products and terms change. Statements below are general knowledge at the time of writing, not verified against live Garmin documentation. Before committing to a source, check the current state with the user or the official site, and say clearly what you have not verified.

## 1. Files from the device

- Many Garmin watches and bike computers expose a `GARMIN/Activity/` folder of `.FIT` files (uppercase extension) when connected over USB as a mass-storage drive.
- Some newer devices connect over MTP instead of mass storage. MTP devices do not appear as a normal folder on every OS; on Linux they need an MTP filesystem (for example through the desktop environment's file manager). Elevate's File connector can only read what the OS mounts as a path.
- Pros: no account, no network, full-resolution data including running and cycling dynamics.
- Cons: manual plugging; the device only keeps recent activities.
- Elevate work: the uppercase-extension fix (catalog G1), then optional device-folder detection.

## 2. Garmin Connect data export

- Garmin Connect's account data-management page offers an "export your data" request that produces a large ZIP by email link.
- Activity FIT files are typically nested in further ZIPs inside that export, alongside many non-activity JSON files. Inspect a real export before coding against a layout.
- Pros: the full history in one go, official, no terms risk.
- Cons: slow to request, manual, very large.
- Elevate work: the nested-archive fix (catalog G3); run a full sync, not a fast sync.

## 3. Per-activity download from Garmin Connect

- Each activity page offers export options, including the original file (FIT inside a ZIP) and GPX/TCX conversions. Prefer the original FIT: GPX and TCX lose fields.
- Good for occasional imports; works with the File connector after G1–G3.

## 4. Official Garmin developer APIs

- Garmin runs a developer program with activity and health APIs aimed at approved business partners, with an application and review.
- Not usually available to an individual hobby project. Confirm eligibility with the user before planning around it.
- If it is available: OAuth credentials stay in Electron main (encrypted with `safeStorage`), the connector lives in `desktop/src/connectors/garmin/`, and an HTTP client in `desktop/src/clients/`.

## 5. Unofficial Garmin Connect access

- Community libraries reproduce the Garmin Connect website login and call its private endpoints.
- Risks: breaks when Garmin changes its login or endpoints, may violate Garmin's terms of use, and requires handling the user's Garmin password.
- Only implement if the user explicitly chooses it after hearing these risks. Never store the password; if a token flow exists, store only tokens, encrypted in main.

## 6. Through a third-party service

- Several training platforms can receive automatic uploads from Garmin Connect and expose a personal API key to read activities back.
- Before building on one, confirm with the user that they use it, and check that its API terms allow this use and that it serves original FIT files rather than reduced data.

## Recommendation template

When the user asks "how do I get my Garmin data in", answer in this order: fix G1–G3, use the device folder for new activities and the data export for history, then discuss an API only if manual steps are unacceptable to them.
