-- ==============================================================================
-- VIDMIND AI — POSTGRESQL + PGVECTOR INITIAL SCHEMA
-- Supports Supabase Auth, Row Level Security (RLS), RAG embeddings,
-- Long-Video Processing Jobs, AI Course Architect, Scheduling & Knowledge Graph.
-- ==============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- USERS & PROFILES -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro', 'premium')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'dark',
  preferred_language text not null default 'en',
  preferred_ai_provider text not null default 'auto',
  study_reminders boolean not null default true,
  revision_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

-- VIDEOS & TRANSCRIPTS ---------------------------------------------------------
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  youtube_video_id text not null,
  url text not null,
  title text not null,
  channel_name text,
  description text,
  thumbnail_url text,
  duration_seconds integer not null default 0,
  published_at timestamptz,
  language text default 'en',
  status text not null default 'ready' check (status in ('queued', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, youtube_video_id)
);

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  source_type text not null default 'captions' check (source_type in ('captions', 'user_text', 'uploaded', 'transcription')),
  language text not null default 'en',
  is_auto_generated boolean not null default false,
  word_count integer not null default 0,
  segments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  chunk_index integer not null,
  start_seconds double precision not null,
  end_seconds double precision not null,
  content text not null,
  summary text,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists idx_transcript_chunks_video on public.transcript_chunks(video_id, chunk_index);
create index if not exists idx_transcript_chunks_embedding on public.transcript_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists public.video_chapters (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  start_seconds double precision not null,
  end_seconds double precision,
  title text not null,
  summary text
);

create table if not exists public.video_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  youtube_url text not null,
  stage text not null default 'queued',
  progress_pct integer not null default 0 check (progress_pct between 0 and 100),
  total_chunks integer not null default 0,
  processed_chunks integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SUMMARIES & CONCEPTS ---------------------------------------------------------
create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'quick' check (mode in ('quick', 'detailed', 'learning')),
  level text not null default 'intermediate',
  language text not null default 'en',
  tldr text not null,
  key_points jsonb not null default '[]'::jsonb,
  definitions jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  quotes jsonb not null default '[]'::jsonb,
  engine text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.extracted_concepts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  name text not null,
  category text,
  explanation text
);

-- CONVERSATIONS (RAG CHAT) -----------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  title text not null default 'Video Chat',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- NOTES ------------------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  title text not null,
  style text not null default 'student',
  content_markdown text not null,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AI COURSE ARCHITECT & ADAPTIVE SCHEDULING ------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  title text not null,
  description text,
  learning_objectives jsonb not null default '[]'::jsonb,
  total_video_seconds integer not null default 0,
  estimated_study_minutes integer not null default 0,
  knowledge_level text not null default 'beginner',
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  created_at timestamptz not null default now()
);

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_order integer not null,
  title text not null,
  description text,
  difficulty text not null default 'intermediate',
  estimated_minutes integer not null default 30
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules(id) on delete cascade,
  lesson_order integer not null,
  title text not null,
  start_seconds double precision not null default 0,
  end_seconds double precision not null default 0,
  estimated_minutes integer not null default 20,
  objectives jsonb not null default '[]'::jsonb,
  ai_explanation text,
  completed boolean not null default false,
  last_position_seconds double precision not null default 0
);

create table if not exists public.learning_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  deadline_days integer not null default 14,
  daily_minutes integer not null default 60,
  learning_speed text not null default 'moderate',
  learning_style text not null default 'balanced',
  scheduling_mode text not null default 'balanced',
  days_off text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid references public.course_lessons(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  start_time text not null,
  end_time text not null,
  title text not null,
  activity_type text not null default 'lesson',
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'missed', 'rescheduled')),
  actual_minutes integer not null default 0
);

-- QUIZZES, FLASHCARDS & REVISION -----------------------------------------------
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  difficulty text not null default 'medium',
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score_pct numeric(5,2) not null,
  weak_topics text[] not null default '{}',
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  topic text not null,
  front text not null,
  back text not null,
  interval_days integer not null default 1,
  next_review_at timestamptz not null default now(),
  mastery_status text not null default 'learning' check (mastery_status in ('learning', 'review', 'known'))
);

-- BOOKMARKS, RESEARCH & KNOWLEDGE GRAPH ----------------------------------------
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  timestamp_seconds double precision not null,
  title text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.research_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  video_ids uuid[] not null default '{}',
  synthesis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_graph_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  category text,
  video_id uuid references public.videos(id) on delete set null
);

create table if not exists public.knowledge_graph_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_node_id uuid not null references public.knowledge_graph_nodes(id) on delete cascade,
  target_node_id uuid not null references public.knowledge_graph_nodes(id) on delete cascade,
  relation text not null default 'relates_to'
);

create table if not exists public.course_completion_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  completion_pct numeric(5,2) not null,
  total_study_hours numeric(6,2) not null,
  average_quiz_score numeric(5,2),
  certificate_code text not null unique,
  issued_at timestamptz not null default now()
);

-- ROW LEVEL SECURITY (RLS) -----------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.videos enable row level security;
alter table public.transcripts enable row level security;
alter table public.transcript_chunks enable row level security;
alter table public.video_chapters enable row level security;
alter table public.video_processing_jobs enable row level security;
alter table public.summaries enable row level security;
alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notes enable row level security;
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.learning_profiles enable row level security;
alter table public.study_sessions enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.flashcards enable row level security;
alter table public.bookmarks enable row level security;
alter table public.research_collections enable row level security;
alter table public.knowledge_graph_nodes enable row level security;
alter table public.knowledge_graph_edges enable row level security;
alter table public.course_completion_records enable row level security;

-- Ownership policies
create policy "Users manage own profile" on public.profiles for all using (auth.uid() = id);
create policy "Users manage own preferences" on public.user_preferences for all using (auth.uid() = user_id);
create policy "Users manage own videos" on public.videos for all using (auth.uid() = user_id);
create policy "Users manage own jobs" on public.video_processing_jobs for all using (auth.uid() = user_id);
create policy "Users manage own summaries" on public.summaries for all using (auth.uid() = user_id);
create policy "Users manage own conversations" on public.conversations for all using (auth.uid() = user_id);
create policy "Users manage own notes" on public.notes for all using (auth.uid() = user_id);
create policy "Users manage own courses" on public.courses for all using (auth.uid() = user_id);
create policy "Users manage own learning profiles" on public.learning_profiles for all using (auth.uid() = user_id);
create policy "Users manage own study sessions" on public.study_sessions for all using (auth.uid() = user_id);
create policy "Users manage own quizzes" on public.quizzes for all using (auth.uid() = user_id);
create policy "Users manage own quiz attempts" on public.quiz_attempts for all using (auth.uid() = user_id);
create policy "Users manage own flashcards" on public.flashcards for all using (auth.uid() = user_id);
create policy "Users manage own bookmarks" on public.bookmarks for all using (auth.uid() = user_id);
create policy "Users manage own collections" on public.research_collections for all using (auth.uid() = user_id);
create policy "Users manage own graph nodes" on public.knowledge_graph_nodes for all using (auth.uid() = user_id);
create policy "Users manage own graph edges" on public.knowledge_graph_edges for all using (auth.uid() = user_id);
create policy "Users manage own completion records" on public.course_completion_records for all using (auth.uid() = user_id);

create policy "Users access transcripts via video ownership" on public.transcripts for all
  using (exists (select 1 from public.videos v where v.id = video_id and v.user_id = auth.uid()));
create policy "Users access chunks via video ownership" on public.transcript_chunks for all
  using (exists (select 1 from public.videos v where v.id = video_id and v.user_id = auth.uid()));
create policy "Users access chapters via video ownership" on public.video_chapters for all
  using (exists (select 1 from public.videos v where v.id = video_id and v.user_id = auth.uid()));
create policy "Users access messages via conversation ownership" on public.chat_messages for all
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy "Users access modules via course ownership" on public.course_modules for all
  using (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()));
create policy "Users access lessons via module ownership" on public.course_lessons for all
  using (
    exists (
      select 1 from public.course_modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_id and c.user_id = auth.uid()
    )
  );

-- AUTOMATIC PROFILE & PREFERENCES TRIGGER ON SIGNUP ----------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
