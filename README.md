# VIDMIND AI — Turn Every Video Into Knowledge

An AI-powered Video Intelligence, Personalized Learning, Research & Knowledge Management Platform built with **Next.js 15 App Router**, **TypeScript**, **Tailwind CSS**, **React Flow**, **Recharts**, **Supabase (PostgreSQL + pgvector + RLS)**, and a provider-independent **Gemini / OpenAI** service layer.

## Core Capabilities
- **Video Intelligence Workspace (`/workspace`):** Paste any YouTube link (`youtube.com/watch`, `youtu.be`, Shorts, Live, Embed) or raw transcript for hierarchical long-video summarization (Quick / Detailed / Learning modes), synced embedded player timestamps, RAG Video Chat, searchable Transcript Explorer, AI Notes Editor, Quizzes, Spaced-Repetition Flashcards, React Flow Mind Maps, and PPTX/Social repurposing.
- **AI Course Architect (`/courses`):** Converts long educational videos (3–50+ hrs) into structured modules and lessons with personalized deadlines, daily time-blocked schedules, feasibility validation, missed-day recovery recalculation, spaced-repetition intervals, and completion records.
- **Multi-Video Research (`/research`):** Compare 2+ videos side-by-side for shared concepts, unique coverage, and synthesis.
- **Personal Knowledge Library & Graph (`/library`):** Search saved videos, notes, and timestamp bookmarks, and visualize concept relationships in an interactive Knowledge Graph.
- **Command Center Dashboard (`/dashboard`):** Real-data study metrics, activity charts, 28-day heatmap, and AI Study Coach recommendations.

## Quick Start (Local Development)

### Prerequisites
- **Node.js 20+** and **npm**
- Optional: **Supabase** project (for Auth + PostgreSQL/pgvector persistence)
- Optional: **GEMINI_API_KEY** or **OPENAI_API_KEY** (without keys, VidMind AI runs with deterministic NLP/RAG fallbacks and reports the unconfigured status honestly in `/settings`)

### Installation
```bash
npm install
cp .env.example .env.local
# Fill in SUPABASE and GEMINI_API_KEY / OPENAI_API_KEY in .env.local
npm run dev
```
Open `http://localhost:3000`.

### Scripts
- `npm run dev` — Start local Next.js dev server
- `npm run typecheck` — Run TypeScript compiler checks (`tsc --noEmit`)
- `npm test` — Run unit tests (`tests/vidmind.test.ts`)
- `npm run build` — Build production bundle

See [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), and [DEPLOYMENT.md](./DEPLOYMENT.md) for full details.
