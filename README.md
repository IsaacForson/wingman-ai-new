# Wingman AI

A desktop copilot for meetings, interview practice and study. Wingman listens (your mic and, optionally, the other side of a call), transcribes in real time, answers questions with the AI provider you choose, and turns meetings into summaries with action items.

It runs as a small "island" overlay on your screen. Everything is stored on your computer.

## Features

- **Live answers.** Type a question, or turn on the mic. With call audio on, Wingman answers questions the *other* person asks; with the mic only, it answers what you say. A new question cancels the answer in progress.
- **Your context.** Add your résumé, a job description or notes. Answers use your real experience instead of generic examples.
- **Interview practice.** Answer questions out loud or by typing and get graded feedback (score, STAR breakdown, what to improve). Questions can be generated from your job description. Progress is tracked over time.
- **Meeting notes.** Record a meeting and get a summary, decisions, action items, open questions and a follow-up email draft. Export as Markdown.
- **Ask about my screen.** Reads the text on your screen (on request only) and explains it.
- **Any AI provider.** Groq, Google Gemini, Mistral, Anthropic Claude, OpenAI, OpenRouter, Together, or local models with Ollama. Model lists are fetched live. If a provider fails before answering, Wingman can fall back to the next one.
- **Usage and speed.** Time-to-first-word, total time and tokens per provider and model.
- **Browser extension.** Select text on any page → explain, summarize or draft a reply, shown in Chrome's side panel.

## Quick start

Requirements: Python 3.10+, Node.js 20+, and optionally [Tesseract](https://github.com/tesseract-ocr/tesseract) for screen text.

```bash
./scripts/setup.sh   # creates backend/venv, installs packages
./scripts/dev.sh     # backend + Electron app with hot reload
```

Then open **Settings → AI** and paste a key. Groq and Gemini have free tiers. Transcription uses Groq or OpenAI Whisper, or Whisper on your computer (`pip install -r backend/requirements-local.txt`).

For call-audio capture on macOS 13+, allow Wingman under *System Settings → Privacy & Security → Screen & System Audio Recording* when asked.

### Build an installer

```bash
./scripts/build.sh   # PyInstaller backend + electron-builder → frontend/release/
```

## Architecture

```
frontend/                 Electron + React + TypeScript
  src/main/               main process: window, tray, shortcuts
    backend.ts            starts/attaches to the backend, owns the auth token
    secrets.ts            API keys, encrypted with the OS keychain (safeStorage)
  src/renderer/
    actions.ts            every user action (island, palette, tray, shortcuts) goes through here
    services/             authenticated fetch, Socket.IO client, audio capture (AudioWorklet → 16 kHz PCM)
    types/generated.ts    generated from backend models — do not edit
backend/                  Python 3.10+, FastAPI + Socket.IO
  wingman/
    security.py           bearer tokens (app + extension scopes)
    providers/            one OpenAI-compatible client + Anthropic; router with safe fallback; usage tracking
    ai/                   prompts, question detection, cancellable answer pipeline
    audio/                VAD segmentation per speaker, Whisper backends
    services/             conversations, context documents (BM25), practice, meetings — SQLite
    engine.py             wires it all together
chrome-extension/         Manifest V3 side-panel extension
```

**How a spoken question is answered.** The renderer captures the mic ("me") and call audio ("them") separately and streams 100 ms PCM frames → the backend segments speech with VAD and transcribes each segment (with live partials) → if "them" asked a question, the pipeline builds a prompt from your mode, context documents, recent transcript and conversation history → the router streams from your provider → `answer_*` events, each tagged with an `answer_id`, update the UI.

**Security.** The backend only listens on 127.0.0.1 and every request needs a bearer token. The desktop app generates one per launch; the extension uses a separate key that only allows its own endpoint. CORS is limited to the app's origins. API keys are kept encrypted by the OS keychain and only held in memory by the backend.

**Data.** `~/.wingman/` holds the SQLite database, logs and auth tokens. History from Wingman 1.x is imported automatically on first run.

## Development

```bash
cd backend && source venv/bin/activate
python -m pytest            # tests
ruff check . && ruff format .
python scripts/gen_types.py # after changing models in wingman/events.py or wingman/runtime.py

cd frontend
npm run typecheck && npm run lint
```

CI runs all of the above on every push and pull request.

## Privacy

Questions, transcripts and relevant document excerpts are sent to the AI and transcription providers you configure. Use Ollama and local Whisper to keep everything on your machine. Let people know when you are taking notes in a meeting; some places require everyone's consent to record.

## License

MIT
