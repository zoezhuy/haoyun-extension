# Haoyun Extension (Local MVP)

Local-first Plasmo Chrome extension MVP for Chinese resume upload, AI parsing, and job form autofill.

## Local setup

1. Install dependencies:

```bash
npm install --cache /tmp/codex-npm-cache
```

2. Create local environment file:

```bash
cp .env.example .env
```

Set your local key in `.env`:

```bash
OPENAI_API_KEY=your_real_key
BACKEND_PORT=8787
```

## Run (local MVP)

Start backend service first:

```bash
npm run dev:backend
```

Then in another terminal start extension dev server:

```bash
npm run dev
```

Load extension in Chrome:

- Open `chrome://extensions`
- Enable `Developer mode`
- Click `Load unpacked`
- Select `build/chrome-mv3-dev`

## Safe architecture

- Extension frontend (`popup` + content script): upload UI, local text extraction, parsed data display, autofill.
- Local backend (`backend/server.mjs`): handles `/parse-resume` and calls OpenAI.
- `OPENAI_API_KEY` is read only in backend process environment.
- API key is never stored or exposed in extension client code.

## MVP flow

1. Upload `.pdf/.docx/.txt` in popup.
2. Extension extracts text locally.
3. Background sends extracted text to local backend `/parse-resume`.
4. Backend calls OpenAI with `OPENAI_API_KEY` and returns structured JSON.
5. Extension stores parsed JSON in `chrome.storage.local`.
6. Popup renders structured fields in Chinese labels.
7. Content script autofills common CN/EN job application form fields.

## Key files

- `src/popup.tsx`: Figma-based popup UI + upload/autofill controls.
- `src/lib/resume-extract.ts`: PDF/DOCX/TXT extraction.
- `src/services/ai-parser.ts`: extension-side client for local backend parse endpoint.
- `src/background.ts`: parse orchestration and storage.
- `src/contents/autofill.ts`: field detection + autofill engine.
- `backend/server.mjs`: local parse API + OpenAI call.

## Notes

- Local-only MVP, no web store release setup.
- Figma icon/logo assets are temporary URLs from Figma MCP.
