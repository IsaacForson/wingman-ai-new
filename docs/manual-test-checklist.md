# Manual test checklist

Automated tests cover the backend (61 tests, including a real Socket.IO round trip) and the UI was smoke-tested in a headless browser against a fake provider. These need a real machine:

## First launch (macOS)
- [ ] `./scripts/setup.sh` then `./scripts/dev.sh`: the island appears and shows "Click the mic or type a question" (not "Backend not connected").
- [ ] If you used Wingman 1.x: a toast says your API keys were moved to secure storage, and old conversations appear in History.
- [ ] Settings → AI: paste a Groq key → Save → Test reports the model and time.
- [ ] Type a question → answer streams; footer shows provider, model and time to first word.
- [ ] Press Stop mid-answer → answer ends with "Stopped".

## Audio
- [ ] Mic only (Settings → Audio, call audio off): click the mic, ask a question out loud → transcript strip shows "You: …", then an answer.
- [ ] Turn on "Also capture call audio", join a test call or play a YouTube interview → macOS asks for Screen & System Audio Recording permission → lines appear as "Them: …" and questions from "Them" get answered; your own speech does not trigger answers.
- [ ] Pick a different microphone in Settings → Audio, restart listening, confirm it's used.
- [ ] Packaged build (`./scripts/build.sh`): call audio still works (needs the Info.plist keys from package.json).

## Features
- [ ] Context: upload a PDF résumé and paste a job description → ask "tell me about yourself" in Interview mode → the answer uses your real experience.
- [ ] Practice: Record an answer out loud → Get feedback → score, STAR bars and suggestions appear; History tab lists it.
- [ ] Practice: "Questions from my job description" generates tailored questions.
- [ ] Meeting notes: Start recording, talk for a minute, Stop and summarize → summary, action items and follow-up email; Export downloads Markdown.
- [ ] Ask about my screen (needs `brew install tesseract`).
- [ ] Usage panel shows the requests you just made.
- [ ] Settings → Shortcuts: change "Start or stop listening", confirm the new shortcut works globally.
- [ ] Tray menu: mode changes and Pause actually change the island.

## Browser extension
- [ ] Load unpacked from `chrome-extension/`, paste the pairing key from Settings → Browser extension.
- [ ] Select text → right-click → Explain with Wingman → the side panel shows the answer.
- [ ] Settings → Browser extension → New key → the extension reports the key is no longer valid.

## Security spot-check
- [ ] With Wingman running, open any website's dev console and run `fetch('http://127.0.0.1:8765/api/conversations')` → it fails (401/CORS).
