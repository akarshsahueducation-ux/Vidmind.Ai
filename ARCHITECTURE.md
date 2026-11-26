# VidMind AI — System Architecture

## Layers
1. **Presentation Layer (`src/app/*`, `src/components/*`)**
   - Public Landing Page (`/`), Supabase Auth (`/login`, `/signup`), Command Center (`/dashboard`), Video Intelligence (`/workspace`), AI Course Architect (`/courses`), Multi-Video Research (`/research`), Knowledge Library & Graph (`/library`), and Diagnostics (`/settings`).
   - Built with React 19, Tailwind CSS v4 design tokens (`src/app/globals.css`), Framer Motion, Lucide Icons, Recharts, and `@xyflow/react`.
2. **API & Validation Layer (`src/app/api/*`)**
   - Every API route validates payloads via `zod`, enforces sliding-window rate limits (`src/lib/rate-limit.ts`), and keeps all AI/database secrets strictly server-side.
3. **Domain Services (`src/lib/*`)**
   - `src/lib/youtube/extractor.ts`: URL validation, metadata + caption extraction (Watch HTML + Innertube + oEmbed), chapter parsing, and token-aware chunking for 3–50+ hour videos.
   - `src/lib/ai/provider.ts`: Provider-independent LLM completion layer (Google Gemini + OpenAI) with untrusted transcript prompt-injection sanitization.
   - `src/lib/ai/pipeline.ts`: Hierarchical chunk summarization, RAG Q&A, studio artifact generators (notes, quizzes, flashcards, mind maps, slides, social copy), and Course Curriculum builder.
   - `src/lib/rag/search.ts`: Timestamp-aware and lexical/semantic retrieval for grounded answers.
   - `src/lib/scheduler/engine.ts`: Deterministic feasibility engine, time-blocked daily study planner, missed-day recovery, and spaced-repetition intervals.
4. **Persistence Layer (`supabase/migrations/0001_initial_schema.sql`, `src/lib/storage/workspace-store.ts`)**
   - Normalized PostgreSQL + pgvector schema with Row Level Security across all user-owned tables, paired with browser local storage fallback when Supabase env vars are unconfigured.
