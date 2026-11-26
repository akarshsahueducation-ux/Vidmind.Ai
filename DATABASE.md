# VidMind AI — Database & Supabase Setup

## Schema Overview
Migration file: `supabase/migrations/0001_initial_schema.sql`

### Domains & Tables
- **Users:** `profiles`, `user_preferences`
- **Videos & Processing:** `videos`, `transcripts`, `transcript_chunks` (`vector(1536)` with `ivfflat` cosine index), `video_chapters`, `video_processing_jobs`
- **Summaries & Concepts:** `summaries`, `extracted_concepts`
- **RAG Conversations:** `conversations`, `chat_messages`
- **Notes & Library:** `notes`, `bookmarks`, `research_collections`, `knowledge_graph_nodes`, `knowledge_graph_edges`
- **Courses & Adaptive Scheduling:** `courses`, `course_modules`, `course_lessons`, `learning_profiles`, `study_sessions`, `course_completion_records`
- **Assessments & Revision:** `quizzes`, `quiz_attempts`, `flashcards`

## Applying Migrations in Supabase
1. Create a new Supabase project.
2. Open the **SQL Editor** in your Supabase Dashboard.
3. Paste the full contents of `supabase/migrations/0001_initial_schema.sql` and click **Run**.
4. Copy your **Project URL** and **Anon Key** into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
5. All tables enforce **Row Level Security (RLS)** so authenticated users can only read and modify their own rows.
