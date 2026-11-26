# VidMind AI — Turn Every Video Into Knowledge

An AI-powered **Video Intelligence, Personalized Course Architect, Multimodal Transcription & Active-Recall Knowledge Platform** built with **Next.js 15 App Router**, **TypeScript**, **Tailwind CSS v4**, **Framer Motion**, **React Flow (`@xyflow/react`)**, **Recharts**, **Supabase (Auth + PostgreSQL + RLS)**, and **Google Gemini (`gemini-3.5-flash-lite` + `gemini-embedding-001`)**.

Live Production App: **[https://vidmind-ai-five.vercel.app](https://vidmind-ai-five.vercel.app)**  
Repository: **[https://github.com/akarshsahueducation-ux/Vidmind.Ai](https://github.com/akarshsahueducation-ux/Vidmind.Ai)**

---

## Key Capabilities

### 1. Video Intelligence Workspace (`/workspace`)
- **YouTube + Direct Media Ingestion:** Paste any YouTube URL (`watch`, `youtu.be`, `Shorts`, `Live`, `embed`, or ID), upload local **Video/Audio files** (`.mp4`, `.webm`, `.mov`, `.mkv`, `.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.flac`), or upload/paste **`.srt` / `.vtt` / `.txt` captions**.
- **Automated Audio & Video Transcription Fallback (`src/lib/ai/transcribe.ts`):** When a YouTube video has no captions available—or when a user uploads a raw video/audio file with **zero title, zero description, and zero captions**—VidMind AI automatically transcribes the audio/visual content into `[MM:SS]` segments and infers a clean title, description, speaker/channel, and chapter markers.
- **Real-Time Streaming Pipeline:** NDJSON progress streaming (`metadata` → `transcript` → `chunking` → `embeddings` → `summarizing`) with an interactive 3D Neural Orb visualizer (`src/components/visuals/NeuralOrb3D.tsx`).
- **Focused Output Modes:** Choose **Complete Breakdown**, **Summary & Key Points Only**, **Action Steps Only**, **Definitions Only**, or **Chapters Only** across **Quick**, **Detailed**, or **Learning** modes and **Beginner / Intermediate / Advanced** levels.
- **Inline Active Recall Pop-Check & Synced Player:** Jump to any timestamp in either the embedded YouTube player or HTML5 local media player, and test yourself immediately with a context-aware Pop-Check question tied to the current video segment.

### 2. Hybrid Vector + Keyword RAG Chat (`src/lib/rag/`)
- **Vector Indexing (`src/lib/rag/embeddings.ts`):** Transcript chunks (~650 words each) are embedded via `gemini-embedding-001`.
- **Hybrid Retrieval (`src/lib/rag/search.ts`):** Combines semantic cosine similarity (`0.72` weight) + lexical keyword scoring (`0.28` weight) + direct `[MM:SS]` timestamp jump detection so every answer cites clickable video moments.

### 3. Topic-Wise Quiz Builder & Dual-Mode Flashcard Studio
- **Dual-Mode Flashcards:** Switch between **Normal Flashcards** (concise front/back recall) and **Depth Flashcards** (front, back, `deepNote`, real-world `example`, and `timestamp`) across Beginner, Intermediate, and Advanced levels with spaced-repetition intervals (`Again`, `Hard`, `Good`, `Easy`).
- **Multi-Tier & Custom Quiz Builder:** Generate **Beginner**, **Intermediate**, **Advanced**, or **Build Your Own Quiz** assessments—select detected topics or type any custom topic (e.g., `Trees`) plus a custom prompt to target exact timestamped sections.
- **Interactive Mind Maps, Notes & Exports:** Explore React Flow concept graphs, edit Markdown notes, generate slide outlines (`pptxgenjs` PPTX export), and repurpose insights.

### 4. AI Course Architect, Research Hub & Persistence
- **Playlist-to-Course & Adaptive Scheduler (`/courses`, `/api/courses/playlist`):** Convert long videos or full YouTube playlists (up to 8 videos) into structured modules/lessons with deadline feasibility checks and missed-day recovery (`src/lib/scheduler/engine.ts`).
- **Multi-Video Research (`/research`):** Compare 2+ videos side-by-side for shared concepts, differences, and synthesis.
- **Personal Knowledge Library (`/library`) & Dashboard (`/dashboard`):** Full Supabase Auth + Postgres sync (`src/app/api/library/route.ts`, `src/lib/storage/workspace-store.ts`), Today/Next-Up study queue, analytics charts, `Ctrl+K` Command Palette, and **Light Mode / Dark Mode** theme toggle (`src/components/layout/AppShell.tsx`).

---

## Tech Stack
- **Framework:** Next.js 15 App Router (TypeScript, React 19, Tailwind CSS v4)
- **AI & Embeddings:** Google Gemini REST API (`gemini-3.5-flash-lite` + `gemini-embedding-001`), with deterministic offline NLP fallbacks
- **Database & Auth:** Supabase SSR + PostgreSQL (`supabase/migrations/0001_initial_schema.sql`)
- **UI & Visualizations:** Framer Motion, Lucide Icons, React Flow (`@xyflow/react`), Recharts, HTML5 Canvas 3D Orb, `pptxgenjs`

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js 20+** and **npm**
- **GEMINI_API_KEY** (recommended for AI summaries, audio transcription fallback, and `gemini-embedding-001` vector search)
- Optional: **Supabase** project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for cloud auth and Postgres sync

### Setup & Run
```bash
git clone https://github.com/akarshsahueducation-ux/Vidmind.Ai.git
cd Vidmind.Ai
npm install
cp .env.example .env.local
# Add GEMINI_API_KEY, AI_PROVIDER=gemini, and Supabase keys in .env.local
npm run dev
```

Open `http://localhost:3000`.

### Scripts
- `npm run dev` — Start development server
- `npm run typecheck` — Run TypeScript type checks (`tsc --noEmit`)
- `npm test` — Run unit tests (`tests/vidmind.test.ts`)
- `npm run build` — Build production bundle
- `npm run start` — Serve production build (`next start -p 3000`)

---

## Deployment on Vercel
1. Ensure [`vercel.json`](./vercel.json) is present (`maxDuration: 60` on API routes).
2. Import the repository on Vercel (or run `npx vercel deploy --prod`).
3. Set `GEMINI_API_KEY`, `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash-lite`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under **Project Settings → Environment Variables**.
4. Add your deployed domain (`https://<your-app>.vercel.app/**`) to **Supabase → Authentication → URL Configuration → Redirect URLs**.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), and [DEPLOYMENT.md](./DEPLOYMENT.md) for deeper technical details.
