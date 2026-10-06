-- ====================================================================
-- VELLUM MASTER DATABASE MIGRATION SCRIPT
-- For User's Own Supabase Project (eqlbxdlgtsihcginzkav)
-- Completely independent from Lovable. Idempotent & safe to run multiple times.
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'parent', 'student');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 4. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  first_name TEXT,
  father_name TEXT,
  student_id TEXT UNIQUE,
  suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automatic profile creation on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(COALESCE(NEW.email, 'student'), '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Student ID generator (e.g. STU-A1B2C3D4)
CREATE OR REPLACE FUNCTION public.generate_student_id()
RETURNS TEXT
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE sid TEXT;
BEGIN
  LOOP
    sid := 'STU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE student_id = sid);
  END LOOP;
  RETURN sid;
END;
$$;

-- 5. USER ROLES & ROLE CHECK
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

-- 6. FOLDERS
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS folders_updated_at ON public.folders;
CREATE TRIGGER folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. NOTEBOOKS
CREATE TABLE IF NOT EXISTS public.notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subject_code TEXT NOT NULL DEFAULT 'STUDY',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebooks TO authenticated;
GRANT ALL ON public.notebooks TO service_role;
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS notebooks_updated_at ON public.notebooks;
CREATE TRIGGER notebooks_updated_at BEFORE UPDATE ON public.notebooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS notebooks_user_idx ON public.notebooks (user_id, updated_at DESC);

-- 8. SOURCES (Multi-file & Multi-image supported)
CREATE TABLE IF NOT EXISTS public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'TEXT',
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO authenticated;
GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sources_notebook_idx ON public.sources (notebook_id);

-- 9. FLASHCARDS
CREATE TABLE IF NOT EXISTS public.flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  mastered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;
GRANT ALL ON public.flashcards TO service_role;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS flashcards_notebook_idx ON public.flashcards (notebook_id, position);

-- 10. QUIZ QUESTIONS
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_index INTEGER NOT NULL DEFAULT 0,
  explanation TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS quiz_notebook_idx ON public.quiz_questions (notebook_id, position);

-- 11. NOTES
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  heading TEXT NOT NULL,
  body TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS notes_notebook_idx ON public.notes (notebook_id, position);

-- 12. CHAT MESSAGES
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS chat_notebook_idx ON public.chat_messages (notebook_id, created_at);

-- 13. PARENT-CHILD LINKS
CREATE TABLE IF NOT EXISTS public.parent_child_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_child_links TO authenticated;
GRANT ALL ON public.parent_child_links TO service_role;
ALTER TABLE public.parent_child_links ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS parent_child_links_updated_at ON public.parent_child_links;
CREATE TRIGGER parent_child_links_updated_at BEFORE UPDATE ON public.parent_child_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 15. READING SESSIONS
CREATE TABLE IF NOT EXISTS public.reading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_ia_id TEXT NOT NULL,
  book_title TEXT NOT NULL,
  book_author TEXT NOT NULL DEFAULT 'Unknown',
  book_cover TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  minutes INTEGER NOT NULL DEFAULT 0,
  quiz_attempts INTEGER NOT NULL DEFAULT 0,
  quiz_correct INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_sessions TO authenticated;
GRANT ALL ON public.reading_sessions TO service_role;
ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;

-- 16. BOOKS (In-app textbook library)
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Unknown',
  category TEXT NOT NULL DEFAULT 'Textbook',
  grade_level INTEGER,
  subject TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  file_path TEXT,
  is_national BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  youtube_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Textbook';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS is_national BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS youtube_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

GRANT SELECT ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS books_updated_at ON public.books;
CREATE TRIGGER books_updated_at BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 17. READING PROGRESS (Per user, per book_ref)
CREATE TABLE IF NOT EXISTS public.reading_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_ref TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_ref)
);

ALTER TABLE public.reading_progress ADD COLUMN IF NOT EXISTS book_ref TEXT;
ALTER TABLE public.reading_progress ADD COLUMN IF NOT EXISTS page INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.reading_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_progress TO authenticated;
GRANT ALL ON public.reading_progress TO service_role;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

-- 18. GAME BREAK ZONE USAGE TRACKING (Daily seconds per user)
CREATE TABLE IF NOT EXISTS public.game_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.game_usage ADD COLUMN IF NOT EXISTS seconds INTEGER NOT NULL DEFAULT 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_usage TO authenticated;
GRANT ALL ON public.game_usage TO service_role;
ALTER TABLE public.game_usage ENABLE ROW LEVEL SECURITY;

-- 19. APP SETTINGS (Configurable game limits, global switches)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_settings (key, value)
VALUES ('game_settings', '{"daily_limit_minutes": 30, "games_enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 20. COMMUNITY POSTS & INTERACTIONS
CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed TEXT NOT NULL CHECK (feed IN ('student','parent')),
  category TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  attachment_url TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT ALL ON public.community_posts TO service_role;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- 20. REPORTS & MODERATION
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_post_id UUID REFERENCES public.community_posts(id) ON DELETE SET NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.moderation_actions TO authenticated;
GRANT ALL ON public.moderation_actions TO service_role;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

-- 21. AI API KEYS (Admin-managed Gemini Keys)
CREATE TABLE IF NOT EXISTS public.ai_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gemini',
  key_encrypted TEXT NOT NULL,
  last4 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','exhausted','error','disabled')),
  priority INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_api_keys TO authenticated;
GRANT ALL ON public.ai_api_keys TO service_role;
ALTER TABLE public.ai_api_keys ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- Profiles
DROP POLICY IF EXISTS "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "parents read linked children profiles" ON public.profiles;
CREATE POLICY "parents read linked children profiles" ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_child_links l WHERE l.parent_id = auth.uid() AND l.student_id = profiles.id AND l.status = 'accepted')
);

DROP POLICY IF EXISTS "admin reads all profiles" ON public.profiles;
CREATE POLICY "admin reads all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin updates profiles" ON public.profiles;
CREATE POLICY "admin updates profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User roles
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert own role" ON public.user_roles;
CREATE POLICY "insert own role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin reads all roles" ON public.user_roles;
CREATE POLICY "admin reads all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Folders
DROP POLICY IF EXISTS "own folders" ON public.folders;
CREATE POLICY "own folders" ON public.folders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Notebooks
DROP POLICY IF EXISTS "own notebooks" ON public.notebooks;
CREATE POLICY "own notebooks" ON public.notebooks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "parents read linked children notebooks" ON public.notebooks;
CREATE POLICY "parents read linked children notebooks" ON public.notebooks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_child_links l WHERE l.parent_id = auth.uid() AND l.student_id = notebooks.user_id AND l.status = 'accepted')
);

DROP POLICY IF EXISTS "admin reads all notebooks" ON public.notebooks;
CREATE POLICY "admin reads all notebooks" ON public.notebooks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Sources
DROP POLICY IF EXISTS "own sources" ON public.sources;
CREATE POLICY "own sources" ON public.sources FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Flashcards
DROP POLICY IF EXISTS "own flashcards" ON public.flashcards;
CREATE POLICY "own flashcards" ON public.flashcards FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "parents read linked children flashcards" ON public.flashcards;
CREATE POLICY "parents read linked children flashcards" ON public.flashcards FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_child_links l WHERE l.parent_id = auth.uid() AND l.student_id = flashcards.user_id AND l.status = 'accepted')
);

-- Quiz Questions
DROP POLICY IF EXISTS "own quiz" ON public.quiz_questions;
CREATE POLICY "own quiz" ON public.quiz_questions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "parents read linked children quiz" ON public.quiz_questions;
CREATE POLICY "parents read linked children quiz" ON public.quiz_questions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_child_links l WHERE l.parent_id = auth.uid() AND l.student_id = quiz_questions.user_id AND l.status = 'accepted')
);

-- Notes
DROP POLICY IF EXISTS "own notes" ON public.notes;
CREATE POLICY "own notes" ON public.notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chat Messages
DROP POLICY IF EXISTS "own chat" ON public.chat_messages;
CREATE POLICY "own chat" ON public.chat_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Parent-Child Links
DROP POLICY IF EXISTS "link participants read" ON public.parent_child_links;
CREATE POLICY "link participants read" ON public.parent_child_links FOR SELECT TO authenticated USING (auth.uid() = parent_id OR auth.uid() = student_id);

DROP POLICY IF EXISTS "parent creates link" ON public.parent_child_links;
CREATE POLICY "parent creates link" ON public.parent_child_links FOR INSERT TO authenticated WITH CHECK (auth.uid() = parent_id);

DROP POLICY IF EXISTS "participants update link" ON public.parent_child_links;
CREATE POLICY "participants update link" ON public.parent_child_links FOR UPDATE TO authenticated USING (auth.uid() = parent_id OR auth.uid() = student_id);

-- Notifications
DROP POLICY IF EXISTS "own notifications read" ON public.notifications;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own notifications update" ON public.notifications;
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "authenticated create notifications" ON public.notifications;
CREATE POLICY "authenticated create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Reading sessions
DROP POLICY IF EXISTS "own reading sessions" ON public.reading_sessions;
CREATE POLICY "own reading sessions" ON public.reading_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "parents read linked children sessions" ON public.reading_sessions;
CREATE POLICY "parents read linked children sessions" ON public.reading_sessions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_child_links l WHERE l.parent_id = auth.uid() AND l.student_id = reading_sessions.user_id AND l.status = 'accepted')
);

DROP POLICY IF EXISTS "admin reads all reading sessions" ON public.reading_sessions;
CREATE POLICY "admin reads all reading sessions" ON public.reading_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Books
DROP POLICY IF EXISTS "anyone authenticated reads books" ON public.books;
CREATE POLICY "anyone authenticated reads books" ON public.books FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manages books" ON public.books;
CREATE POLICY "admin manages books" ON public.books FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Reading Progress
DROP POLICY IF EXISTS "own reading progress" ON public.reading_progress;
CREATE POLICY "own reading progress" ON public.reading_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Game Usage
DROP POLICY IF EXISTS "own game usage" ON public.game_usage;
CREATE POLICY "own game usage" ON public.game_usage FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Community
DROP POLICY IF EXISTS "read visible posts" ON public.community_posts;
CREATE POLICY "read visible posts" ON public.community_posts FOR SELECT TO authenticated USING (NOT hidden OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "create posts" ON public.community_posts;
CREATE POLICY "create posts" ON public.community_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own or admin update posts" ON public.community_posts;
CREATE POLICY "own or admin update posts" ON public.community_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "own or admin delete posts" ON public.community_posts;
CREATE POLICY "own or admin delete posts" ON public.community_posts FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "read likes" ON public.post_likes;
CREATE POLICY "read likes" ON public.post_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "own likes" ON public.post_likes;
CREATE POLICY "own likes" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own unlike" ON public.post_likes;
CREATE POLICY "own unlike" ON public.post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "read visible comments" ON public.post_comments;
CREATE POLICY "read visible comments" ON public.post_comments FOR SELECT TO authenticated USING (NOT hidden OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "create comments" ON public.post_comments;
CREATE POLICY "create comments" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own or admin update comments" ON public.post_comments;
CREATE POLICY "own or admin update comments" ON public.post_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "own or admin delete comments" ON public.post_comments;
CREATE POLICY "own or admin delete comments" ON public.post_comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Reports & Moderation
DROP POLICY IF EXISTS "reporter or admin read" ON public.reports;
CREATE POLICY "reporter or admin read" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "create reports" ON public.reports;
CREATE POLICY "create reports" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "admin resolve reports" ON public.reports;
CREATE POLICY "admin resolve reports" ON public.reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin reads moderation log" ON public.moderation_actions;
CREATE POLICY "admin reads moderation log" ON public.moderation_actions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin writes moderation log" ON public.moderation_actions;
CREATE POLICY "admin writes moderation log" ON public.moderation_actions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- AI API Keys
DROP POLICY IF EXISTS "admin manages ai keys" ON public.ai_api_keys;
CREATE POLICY "admin manages ai keys" ON public.ai_api_keys FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ====================================================================
-- STORAGE BUCKETS SETUP
-- ====================================================================

-- Ensure 'sources' bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('sources', 'sources', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for 'sources'
DROP POLICY IF EXISTS "own source files read" ON storage.objects;
CREATE POLICY "own source files read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'sources' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "own source files write" ON storage.objects;
CREATE POLICY "own source files write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'sources' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "own source files delete" ON storage.objects;
CREATE POLICY "own source files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'sources' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Ensure 'book-files' bucket exists (private for PDF textbooks)
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-files', 'book-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "authenticated read book files" ON storage.objects;
CREATE POLICY "authenticated read book files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'book-files');

DROP POLICY IF EXISTS "admin write book files" ON storage.objects;
CREATE POLICY "admin write book files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'book-files' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin delete book files" ON storage.objects;
CREATE POLICY "admin delete book files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'book-files' AND public.has_role(auth.uid(), 'admin'));

-- Ensure 'book-covers' bucket exists (public for covers)
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read book covers" ON storage.objects;
CREATE POLICY "public read book covers" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'book-covers');

DROP POLICY IF EXISTS "admin write book covers" ON storage.objects;
CREATE POLICY "admin write book covers" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin delete book covers" ON storage.objects;
CREATE POLICY "admin delete book covers" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'));

-- ====================================================================
-- HOW TO PROMOTE YOUR FIRST ADMIN USER:
-- Run this single line with your signup email:
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'admin' FROM auth.users WHERE email = 'YOUR_EMAIL@EXAMPLE.COM'
-- ON CONFLICT (user_id, role) DO NOTHING;
-- ====================================================================
