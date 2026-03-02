# Manor UI — Developer Guide

## Quick Reference

```bash
npm run dev          # Start dev server (Turbopack, port 3000)
npm test             # Run all 153 tests via Vitest
npx tsc --noEmit     # Type-check (expect 0 errors)
npx next build       # Production build
```

## Project Overview

Manor UI is a Next.js 16 dashboard for managing OpenClaw AI agents. It provides an org chart (Manor Map), direct agent chat with multimodal support, cron monitoring, and memory browsing. All AI calls route through the OpenClaw gateway — no separate API keys needed.

## Tech Stack

- Next.js 16.1.6 (App Router, Turbopack)
- React 19.2.3, TypeScript 5
- Tailwind CSS 4 with CSS custom properties for theming
- Vitest 4 with jsdom environment
- OpenAI SDK (routed to Claude via OpenClaw gateway at localhost:18789)
- React Flow (@xyflow/react) for org chart

## Environment Variables

```env
WORKSPACE_PATH       # Required — path to .openclaw/workspace
OPENCLAW_BIN         # Required — path to openclaw binary
OPENCLAW_GATEWAY_TOKEN  # Required — gateway auth token
ELEVENLABS_API_KEY   # Optional — voice indicators
```

## Architecture

### Chat Pipeline (Text)

```
Client → POST /api/chat/[id] → OpenAI SDK → localhost:18789/v1/chat/completions → Claude
                                             (streaming SSE response)
```

### Chat Pipeline (Images/Vision)

The gateway's HTTP endpoint strips image_url content. Vision uses the CLI agent pipeline:

```
Client resizes image to 1200px max (Canvas API)
  → base64 data URL in message
  → POST /api/chat/[id]
  → Detects image in LATEST user message only (not history)
  → execFile: openclaw gateway call chat.send --params <json> --token <token>
  → Polls: openclaw gateway call chat.history every 2s
  → Matches response by timestamp >= sendTs
  → Returns assistant text via SSE
```

Key files: `lib/anthropic.ts` (send + poll logic), `app/api/chat/[id]/route.ts` (routing)

**Why send-then-poll?** `chat.send` is async — it returns `{runId, status: "started"}` immediately. The `--expect-final` flag doesn't block for this method. We poll `chat.history` until the assistant's response appears.

**Why CLI and not WebSocket?** The gateway WebSocket requires device keypair signing for `operator.write` scope (needed by `chat.send`). The CLI has the device keys; custom clients don't.

**Why resize to 1200px?** macOS ARG_MAX is 1MB. Unresized photos can produce multi-MB base64 that exceeds CLI argument limits (E2BIG error). 1200px JPEG at 0.85 quality keeps base64 well under 1MB.

### Voice Message Pipeline

```
Browser MediaRecorder (webm/opus or mp4)
  → AudioContext AnalyserNode captures waveform (40-60 samples)
  → Stop → audioBlob + waveform data
  → POST /api/transcribe (Whisper via gateway)
  → Transcription text sent as message content
  → Audio data URL + waveform stored in message for playback
```

Key files: `lib/audio-recorder.ts`, `lib/transcribe.ts`, `components/chat/VoiceMessage.tsx`

### Conversation Persistence

Messages stored in localStorage as JSON. Media attachments are base64 data URLs (not blob URLs — those don't survive reload). The `conversations.ts` module provides `addMessage()`, `updateLastMessage()`, and `parseMedia()`.

### Theming

Five themes defined via CSS custom properties in `app/globals.css`:
- Dark (default), Glass, Color, Light, System
- Components use semantic tokens: `--bg`, `--text-primary`, `--accent`, `--separator`, etc.
- Theme state managed by `app/providers.tsx` ThemeProvider (localStorage)

## File Map

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agents` | GET | All agents from JSON registry + SOUL.md |
| `/api/chat/[id]` | POST | Agent chat — text (streaming) or vision (send+poll) |
| `/api/crons` | GET | Cron jobs via `openclaw cron list --json` |
| `/api/memory` | GET | Memory files from workspace |
| `/api/tts` | POST | Text-to-speech via OpenClaw |
| `/api/transcribe` | POST | Audio transcription via Whisper |

### Core Libraries

| File | Purpose |
|------|---------|
| `lib/agents.ts` | Agent registry + SOUL.md filesystem reader |
| `lib/anthropic.ts` | Vision pipeline: `hasImageContent`, `extractImageAttachments`, `buildTextPrompt`, `sendViaOpenClaw` (send + poll), `execCli` |
| `lib/audio-recorder.ts` | `createAudioRecorder()` — MediaRecorder + waveform via AnalyserNode |
| `lib/conversations.ts` | Conversation store with localStorage persistence |
| `lib/crons.ts` | Cron data fetching via CLI |
| `lib/multimodal.ts` | `buildApiContent()` — converts Message+Media to OpenAI API format |
| `lib/transcribe.ts` | `transcribe(audioBlob)` — Whisper API with graceful fallback |
| `lib/validation.ts` | `validateChatMessages()` — validates text + multimodal content arrays |

### Chat Components

| Component | Purpose |
|-----------|---------|
| `ConversationView.tsx` | Main chat: messages, input, recording UI, paste/drop handlers, file staging, clear chat |
| `VoiceMessage.tsx` | Waveform playback: play/pause + animated bar visualization |
| `FileAttachment.tsx` | File bubble: icon by type + name + size + download |
| `MediaPreview.tsx` | Pre-send strip of staged attachments with remove buttons |
| `AgentList.tsx` | Desktop agent sidebar with unread badges |

## Testing

9 test suites, 153 tests total. All in `lib/` directory.

```bash
npx vitest run                     # All tests
npx vitest run lib/anthropic.test.ts  # Single suite
npx vitest --watch                  # Watch mode
```

Key test patterns:
- `vi.mock('child_process')` for CLI tests (anthropic.ts)
- `vi.useFakeTimers({ shouldAdvanceTime: true })` for polling tests
- `vi.stubEnv()` for environment variable tests
- jsdom environment for DOM-dependent tests

## Conventions

- No external charting/media libraries — native Web APIs (Canvas, MediaRecorder, AudioContext)
- Base64 data URLs for all persisted media (not blob URLs)
- CSS custom properties for theming — no Tailwind color classes directly
- Inline styles referencing CSS vars (e.g., `style={{ color: 'var(--text-primary)' }}`)
- Tests colocated with source: `lib/foo.ts` + `lib/foo.test.ts`
- Agent chat uses `claude-sonnet-4-6` model via OpenClaw gateway
- No em dashes in agent responses (enforced via system prompt)

## Common Tasks

### Add a new agent
Edit `lib/agents.ts` — add to the registry array. Auto-appears in map, chat, and detail pages.

### Change the chat model
Edit `app/api/chat/[id]/route.ts` line 92 — change the `model` field in `openai.chat.completions.create()`.

### Add a new theme
Add a `[data-theme="name"]` block in `app/globals.css` with all CSS custom properties. Add the theme ID to `lib/themes.ts`.

### Debug image pipeline
1. Check server console for `sendViaOpenClaw execFile error:` or `sendViaOpenClaw: timed out`
2. Test CLI directly: `openclaw gateway call chat.send --params '{"sessionKey":"agent:main:manor-ui","idempotencyKey":"test","message":"describe","attachments":[]}' --token <token> --json`
3. Check history: `openclaw gateway call chat.history --params '{"sessionKey":"agent:main:manor-ui"}' --token <token> --json`
4. Verify gateway is running: `openclaw gateway call health --token <token>`
