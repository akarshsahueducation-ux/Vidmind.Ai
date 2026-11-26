# VidMind AI — GitHub & Vercel Deployment Guide

## 1. Push Complete Repository to GitHub
A clean `.gitignore`, `.env.example`, `vercel.json`, and `.github/workflows/ci.yml` are already included.

### Option A — Via Git CLI
```bash
cd vidmind-ai
git init
git add .
git commit -m "Initial commit: VidMind AI platform"
git branch -M main
git remote add origin https://github.com/<your-username>/vidmind-ai.git
git push -u origin main
```

### Option B — Via GitHub Web UI (No Git CLI needed)
1. Create a new empty repository on GitHub named `vidmind-ai`.
2. Extract `vidmind-ai-github.zip` (or select all files inside `vidmind-ai/`) and upload via **Add file → Upload files**.

## 2. Deploy to Vercel
1. Go to [vercel.com/new](https://vercel.com/new) and import your `vidmind-ai` GitHub repository.
2. Vercel auto-detects **Next.js** and `vercel.json` (with 60s API timeout for long-video processing routes).
3. Add the following **Environment Variables** in Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY` (and/or `OPENAI_API_KEY`)
   - `AI_PROVIDER=auto`
   - `YOUTUBE_API_KEY` (optional)
4. Click **Deploy**.
5. After deployment, verify `/api/health` and `/settings` show green `Configured` badges for each connected service.
