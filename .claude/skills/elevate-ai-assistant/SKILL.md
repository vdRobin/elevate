---
name: elevate-ai-assistant
description: Integrate AI (Claude via the Anthropic API) into the Elevate desktop app — an AI coach or chat about the athlete's training, natural-language questions over activities ("how was my training load last month?"), workout or activity summaries, training-plan suggestions, explaining fitness-trend charts, or any LLM feature. Use this whenever the user mentions AI, LLM, Claude, chatbot, assistant, coach, GPT-style features, natural-language queries or "AI integration" in Elevate, even if they don't name the API. Covers architecture (Electron main owns the key and calls), IPC streaming, consent and privacy, and settings.
---

# AI assistant in Elevate

AI features call a remote model with the athlete's personal data, so the two things that matter most are where the call happens and what data leaves the machine. Get those right first; the prompt and UI are easy to change later.

Before writing any Anthropic SDK code, load the `claude-api` skill. SDK shapes, model ids and defaults change, and that skill is authoritative over memory and over the notes here. `references/claude-api-notes.md` summarises what it said when this skill was written.

## 1. Architecture: the call lives in Electron main

```
renderer (appcore)                         main (desktop/src)
AiAssistantComponent ──IPC aiAsk──────────► AiListener → AiService (@anthropic-ai/sdk)
  builds compact context                         │ streams from the API
  shows consent + preview                         │
◄──IPC aiDelta (fwd, per chunk, with requestId)──┘
◄──IPC response to aiAsk (final text, usage)
```

Why main and not the renderer:
- The API key never enters the renderer, its `localStorage` or IndexedDB, where the existing secrets already sit unencrypted (catalog S3) and where an HTML-injection bug (S1) could reach them.
- Main already owns network clients (`desktop/src/clients/`), and Electron's `safeStorage` is only available in main.

Desktop only. The extension has no main process; do not add AI to shared code paths it compiles.

## 2. Pieces to build

**Shared contract** (`appcore/modules/shared`)
- `electron/channels.enum.ts`: add `aiAsk`, `aiCancel`, `aiDelta`, `aiSetKey`, `aiKeyStatus`.
- A request model (for example `models/ai/ai-request.model.ts`) with `requestId`, `messages`, and `context`. Always include `requestId`: main-to-renderer IPC has no correlation id (catalog C5), so concurrent streams need one to stay apart.

**Main** (`desktop/src`)
- `ai/ai.service.ts`: tsyringe `@singleton()` that creates the Anthropic client lazily with the decrypted key, runs a streaming request, forwards text deltas through `ipcTunnelService.fwd(new IpcMessage(Channel.aiDelta, requestId, text))`, and returns the final message. Support cancellation by keeping an `AbortController` per `requestId`.
- `ai/ai-key.store.ts`: encrypt with `safeStorage.encryptString` and write to a file in `app.getPath("userData")`; decrypt on demand. Check `safeStorage.isEncryptionAvailable()`. On Linux without a keyring, Electron may fall back to weak or plain-text storage; detect that and tell the user, as `gh` did for its token.
- `listeners/ipc-ai.listener.ts`: implements `IpcListener`, registered in `main.ts` `setupListeners()` like the others.
- Dependency: add `@anthropic-ai/sdk` to `desktop/package.json`. Check that the SDK's minimum Node version is satisfied by the Node bundled with the project's Electron version. If rollup cannot bundle it, add it to `external` in `rollup.config.js`; `node_modules` is already shipped by electron-builder.

**Renderer** (`appcore/src/app/desktop/ai/`)
- `DesktopAiService` (provided in `desktop-target.module.ts`) wrapping the IPC calls and exposing an `Observable` of deltas filtered by `requestId`.
- Context builders that read through existing services: `ActivityService` for summaries, `FitnessService` for CTL/ATL/TSB, `AthleteService` for current thresholds. Send summaries, never raw streams or GPS.
- UI: a lazy route (`AppRoutes`, `desktop-routing.module.ts`, desktop menu provider) or a panel in the activity view. Render model output as text or with markdown-it with `html: false` (as release notes do). Never pass it to `bypassSecurityTrustHtml`.
- Settings: add `aiEnabled` (default `false`) and the model choice to `DesktopUserSettings` in `appcore/modules/shared/models/user-settings/user-settings.namespace.ts`, plus a section in `GlobalSettingsService`. The key itself is set through `aiSetKey` and never stored in user settings.

## 3. Privacy and consent

- Off by default. The first use shows what will be sent and to whom, and needs an explicit "enable".
- Send the minimum: dates, sport, durations, distances, stress scores and fitness numbers. Leave out names, birth date, GPS, device ids and file paths. Age and weight only if the feature needs them, and say so in the consent text.
- Offer a "show request" toggle that displays the exact context JSON before sending.
- No silent background calls. Every request starts from a user action.

## 4. Feature shapes, simplest first

1. **Explain this activity** — one request with the activity's stats and athlete snapshot; returns a short summary. Good first slice: exercises the whole pipeline.
2. **Ask about my training** — chat with a compact history context (weekly totals, fitness trend, recent activities). Cache the stable system prompt and the history context so follow-up questions are cheap.
3. **Tool use over local data** — let the model request data with tools such as `get_weekly_summary(from, to, sport)`, `get_activity(id)` or `get_fitness_trend(from, to)`. Tool calls execute in main and fetch data from the renderer over IPC (the same direction as `findActivity` today). Validate every tool input against its schema before running it.

Add each shape only after the previous one works.

## 5. Defaults and costs

Use the defaults from the `claude-api` skill unless the user picks otherwise: the current Opus model for quality, streaming for every request, and handling of the `refusal` stop reason before reading content. Let the user choose a cheaper model in settings, and show token usage from the final message so cost is visible. Do not hard-code prices.

## 6. Testing

- Main: unit-test `AiService` with the SDK client mocked (no network in tests), cancellation, refusal handling and key-store behaviour when encryption is unavailable.
- Renderer: test context builders as pure functions with fixtures. Snapshot the JSON they produce to catch accidental data leaks such as names or GPS.
- Manual: ask the user to run a real request with their own key in the dev app. Real API calls cost money, so get the user's go-ahead before running any.

Run `elevate-verify` for `desktop` and `appcore`.
