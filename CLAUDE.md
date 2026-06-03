# Project: GPT Clone

## Overview
- Next.js 13.3.0 + Tailwind CSS chatbot interface
- Target audience: elementary school students (grades 3-6)
- Language: Traditional Chinese (繁體中文)

## Tech Stack
- Framework: Next.js 13
- Styling: Tailwind CSS
- AI Model: GPT-5.4 (default), GPT-4o Mini (fallback)
- TTS: OpenAI tts-1
- STT: OpenAI whisper-1
- Package Manager: npm
- OpenAI SDK: openai v3.2.1 (legacy, uses `createChatCompletion`)

## Key Files
- `src/shared/Constants.ts` — model config (DEFAULT_OPENAI_MODEL)
- `src/utils/generateSystemPrompt.ts` — main system prompt generator
- `src/pages/api/openai.ts` — chat API endpoint
- `src/pages/api/generate-story.ts` — story generation API
- `src/pages/api/extract-memory.ts` — memory extraction API
- `src/pages/api/tts.ts` — text-to-speech API
- `src/pages/api/transcribe.ts` — speech-to-text API

## Deployment
- Platform: **Vercel**
- Project Name: `gpt-clone`
- Project ID: `prj_v5xq9qzq1G0W92oKPsz4X4EMY1OI`
- Org/Team ID: `team_paThHkXizEJsjCoy2eNgEkCH`
- Production URL: https://chat-clone-gpt.vercel.app/
- Deploy command: `vercel --prod` (CLI deployment)
- Build: `next build` / Start: `next start`

## Environment Variables (required on Vercel)
- `OPENAI_API_KEY`
- `MIXPANEL_PROJECT_TOKEN`
- `APP_ENV`
- `APP_NAME`

## Notes
- `.vercel/` directory is in `.gitignore`, do not commit
- React strict mode is disabled in `next.config.js`
