# Claude API notes for Elevate

Snapshot of the `claude-api` skill's guidance, taken 2026-10-17 (its model table was cached 2026-10-06). Re-load the `claude-api` skill before writing code: when it disagrees with this file, it wins.

## Defaults it recommended

- **SDK:** `@anthropic-ai/sdk` (TypeScript). Do not call the HTTP API with `fetch` from TypeScript, and do not use OpenAI-compatible shims.
- **Model:** `claude-opus-5-5` by default. Cheaper choices exist (`claude-sonnet-5-5`, `claude-haiku-5-5`); switching is the user's decision. Use model ids exactly as written, without date suffixes.
- **Thinking:** on Claude Opus 5.5 thinking cannot be disabled; omit `thinking` or send `{ type: "adaptive" }`. Control depth with `output_config: { effort: "low" | "medium" | "high" | "xhigh" | "max" }`; the default on Claude Opus 5.5 is `medium`, so set it explicitly. `budget_tokens` and `{ type: "disabled" }` return a 400.
- **Streaming:** stream any request with long input or output. `client.messages.stream({...})`, iterate events for `content_block_delta` / `text_delta`, and use `await stream.finalMessage()` for the complete response and `usage`.
- **`max_tokens`:** about 64000 for streaming requests, about 16000 for non-streaming ones.
- **Refusals:** check `stop_reason === "refusal"` before reading `content`; `stop_details` carries the category. Opt into the server-side fallback by default and tell the user it is enabled: `client.beta.messages.*` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`.
- **No assistant prefill:** a trailing assistant message returns a 400. Use structured outputs (`output_config.format`) or system-prompt instructions to control format.
- **Tools:** forced `tool_choice` (`any` or a named tool) returns a 400 on Claude Opus 5.5. Use `tool_choice: { type: "auto" }`, name the tool in the prompt, and set `strict: true` on tool definitions. Parse tool inputs with `JSON.parse`, validate them against the schema, and return every `tool_result` of a turn in one user message.
- **Prompt caching:** prefix match over `tools` → `system` → `messages`. Put the stable system prompt and athlete context first with `cache_control: { type: "ephemeral" }`; keep timestamps and per-request ids out of the cached prefix. Check `usage.cache_read_input_tokens` to confirm hits.
- **Errors:** catch typed SDK errors most-specific first (`Anthropic.RateLimitError`, `Anthropic.AuthenticationError`, `Anthropic.BadRequestError`, then `Anthropic.APIError`). The SDK retries 408/409/429/5xx twice by default. The TypeScript timeout is in milliseconds.
- **Credentials:** the client resolves `ANTHROPIC_API_KEY` and other sources automatically. For Elevate, pass the key decrypted from `safeStorage` explicitly with `new Anthropic({ apiKey })` in main.

## Minimal streaming call in Electron main (shape only)

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: decryptedKey });

const stream = client.messages.stream({
  model: "claude-opus-5-5",
  max_tokens: 64000,
  output_config: { effort: "medium" },
  system: [{ type: "text", text: STABLE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: userQuestionWithContext }]
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    ipcTunnelService.fwd(new IpcMessage(Channel.aiDelta, requestId, event.delta.text));
  }
}

const final = await stream.finalMessage();
if (final.stop_reason === "refusal") {
  // surface a WarningException-style message; do not render partial content
}
```

This sketch omits the refusal fallback beta and cancellation. Add both following the `claude-api` skill's current TypeScript docs.
