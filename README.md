# Manor UI

A visual command centre for your AI agent team.

Manor UI is an open-source dashboard for managing, monitoring, and talking directly to your OpenClaw AI agents. Built with Next.js 16, React 19, and a dark command-centre aesthetic with five themes.

---

## Features

### Manor Map
Interactive org chart of your entire agent team. Nodes show hierarchy, cron status, voice capabilities, and relationships at a glance. Powered by React Flow with BFS-based auto-layout.

### Chat (Call Box)
Full-featured messenger for direct agent conversations:
- **Streaming text chat** via Claude (through the OpenClaw gateway)
- **Image attachments** with vision — agents can see and describe images
- **Voice messages** — hold-to-record with waveform playback
- **File attachments** — PDFs, docs, text files with type-aware rendering
- **Clipboard paste and drag-and-drop** for images
- **Clear chat** per agent
- Conversations persist to localStorage

### Agent Detail
Full profile: SOUL.md viewer, tool list, hierarchy, associated crons, voice ID, and direct chat link.

### Cron Monitor
Live status of all scheduled jobs. Filter by status (all/ok/error/idle), sort errors to top, expand for error details. Auto-refreshes every 60 seconds.

### Memory Browser
Read team memory, long-term memory, and daily logs. Markdown rendering and JSON syntax highlighting built-in. Search, copy, and download support.

---

## Setup

### Prerequisites
- [OpenClaw](https://openclaw.ai) installed and gateway running (`openclaw gateway run`)
- Node.js 18+

### Install

```bash
git clone https://github.com/[your-username]/manor-ui.git
cd manor-ui
npm install
```

### Configure

Copy the environment template:

```bash
cp .env.example .env.local
```

Fill in your values:

```env
# Required
WORKSPACE_PATH=/path/to/.openclaw/workspace
OPENCLAW_BIN=/path/to/openclaw
OPENCLAW_GATEWAY_TOKEN=your-gateway-token

# Optional
ELEVENLABS_API_KEY=your-elevenlabs-key   # for voice indicators
```

No separate API keys needed — all AI calls route through the OpenClaw gateway.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Test

```bash
npm test
```

Runs all 153 tests via Vitest.

---

## Architecture

### How Chat Works

Text messages go through the OpenClaw gateway's OpenAI-compatible endpoint (`/v1/chat/completions`) for streaming responses.

Image messages use a different pipeline because the gateway's HTTP endpoint strips image data. Instead, Manor UI uses the same path as Discord/Telegram channels:

```
User attaches image
  → Client resizes to 1200px max (fits within OS arg limits)
  → Client converts to base64 data URL
  → POST /api/chat/[id] detects image in latest message
  → Server calls `openclaw gateway call chat.send` via CLI
  → Server polls `openclaw gateway call chat.history` every 2s
  → Agent processes image + text through Anthropic vision API
  → Response returned to client as SSE
```

Voice messages are recorded in-browser using the MediaRecorder API, transcribed server-side via Whisper (through the gateway's `/v1/audio/transcriptions` endpoint), and sent as text with the audio waveform preserved for playback.

### Directory Structure

```
app/
  page.tsx              — Manor Map (React Flow org chart)
  chat/page.tsx         — Multi-agent messenger
  agents/[id]/page.tsx  — Agent detail profile
  crons/page.tsx        — Cron job monitor
  memory/page.tsx       — Memory file browser
  api/
    agents/route.ts     — GET agents from registry
    chat/[id]/route.ts  — POST chat (text + vision)
    crons/route.ts      — GET crons via CLI
    memory/route.ts     — GET memory files
    tts/route.ts        — POST text-to-speech
    transcribe/route.ts — POST audio transcription

components/
  ManorMap.tsx          — React Flow graph with auto-layout
  AgentNode.tsx         — Custom node for the org chart
  Sidebar.tsx           — Desktop navigation sidebar
  MobileSidebar.tsx     — Mobile hamburger menu
  ThemeToggle.tsx       — Theme switcher (5 themes)
  GlobalSearch.tsx      — Cmd+K agent search
  chat/
    ConversationView.tsx — Message history + input with media
    AgentList.tsx        — Agent sidebar for chat
    VoiceMessage.tsx     — Waveform playback component
    FileAttachment.tsx   — File bubble with icon + download
    MediaPreview.tsx     — Pre-send attachment strip

lib/
  agents.ts             — Agent registry + SOUL.md reader
  anthropic.ts          — OpenClaw vision pipeline (chat.send + poll)
  audio-recorder.ts     — MediaRecorder + waveform extraction
  conversations.ts      — Client-side conversation store (localStorage)
  crons.ts              — Cron data via openclaw CLI
  memory.ts             — Memory file reader
  multimodal.ts         — Message → API content format converter
  sanitize.ts           — HTML/markdown sanitization
  transcribe.ts         — Whisper transcription with fallback
  validation.ts         — Chat message validation
  types.ts              — Shared TypeScript types
  themes.ts             — Theme definitions
  styles.ts             — Semantic style constants
  utils.ts              — Tailwind merge utility
```

### Key Design Decisions

- **No separate API keys** — All AI calls (chat, vision, TTS, transcription) route through the OpenClaw gateway. One subscription, one token.
- **No external charting/media libraries** — Voice waveforms use plain div bars (not canvas), images resize via native Canvas API, all CSS uses Tailwind custom properties.
- **Client-side persistence** — Conversations stored in localStorage with base64 data URLs. Blob URLs don't survive page reload; data URLs do.
- **Image resize before send** — Images are resized client-side to max 1200px longest side before base64 encoding. This keeps the CLI argument payload under macOS's 1MB `ARG_MAX` limit.
- **Send-then-poll for vision** — The gateway's `chat.send` is async (returns immediately). We poll `chat.history` every 2 seconds until the assistant response appears, matched by timestamp.

---

## Themes

Five built-in themes, toggled via the sidebar button:

| Theme | Description |
|-------|-------------|
| **Dark** | Apple Dark Mode with warm blacks, gold accent |
| **Glass** | Frosted translucent panels on deep blue-black |
| **Color** | Vibrant purple-indigo gradients |
| **Light** | Apple Light Mode, clean whites |
| **System** | Follows OS preference |

All themes use CSS custom properties. Components reference semantic tokens (`--bg`, `--text-primary`, `--accent`, etc.) so every theme is automatic.

---

## Adding Agents

Edit `lib/agents.ts` and add an entry to the registry array:

```typescript
{
  id: 'my-agent',
  name: 'MY-AGENT',
  title: 'What they do',
  reportsTo: 'jarvis',
  directReports: [],
  soulPath: 'agents/my-agent/SOUL.md',
  voiceId: null,
  color: '#06b6d4',
  emoji: '🤖',
  tools: ['read', 'write'],
  description: 'One-liner description.',
}
```

They appear automatically in the map, detail pages, and chat.

---

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [TypeScript 5](https://typescriptlang.org)
- [Tailwind CSS 4](https://tailwindcss.com)
- [React Flow (@xyflow/react)](https://reactflow.dev) — Org chart
- [OpenAI SDK](https://github.com/openai/openai-node) — Gateway client (routed to Claude via OpenClaw)
- [Vitest 4](https://vitest.dev) — Test runner (153 tests)
- [OpenClaw](https://openclaw.ai) — AI gateway, agent runtime, vision pipeline

---

## Built by

[John Rice](https://github.com/johnrice) with [Jarvis](https://openclaw.ai) (OpenClaw AI)

---

## License

MIT
