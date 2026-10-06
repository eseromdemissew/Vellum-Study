-- Roles (separate table, never on profiles)
create type public.app_role as enum ('admin', 'parent', 'student');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "insert own role" on public.user_roles for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Profiles: extend with names + unique student id
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists father_name text,
  add column if not exists student_id text unique,
  add column if not exists suspended boolean not null default false;

create or replace function public.generate_student_id() returns text language plpgsql set search_path = public as $$
declare sid text;
begin
  loop
    sid := 'STU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where student_id = sid);
  end loop;
  return sid;
end $$;

-- Parent-child links
create table public.parent_child_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_id, student_id)
);
grant select, insert, update, delete on public.parent_child_links to authenticated;
grant all on public.parent_child_links to service_role;
alter table public.parent_child_links enable row level security;
create policy "link participants read" on public.parent_child_links for select to authenticated using (auth.uid() = parent_id or auth.uid() = student_id);
create policy "parent creates link" on public.parent_child_links for insert to authenticated with check (auth.uid() = parent_id);
create policy "participants update link" on public.parent_child_links for update to authenticated using (auth.uid() = parent_id or auth.uid() = student_id);
create trigger parent_child_links_updated_at before update on public.parent_child_links for each row execute function set_updated_at();

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "own notifications read" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "own notifications update" on public.notifications for update to authenticated using (auth.uid() = user_id);
create policy "authenticated create notifications" on public.notifications for insert to authenticated with check (true);

-- Reading sessions
create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_ia_id text not null,
  book_title text not null,
  book_author text not null default 'Unknown',
  book_cover text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes integer not null default 0,
  quiz_attempts integer not null default 0,
  quiz_correct integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.reading_sessions to authenticated;
grant all on public.reading_sessions to service_role;
alter table public.reading_sessions enable row level security;
create policy "own reading sessions" on public.reading_sessions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "parents read linked children sessions" on public.reading_sessions for select to authenticated using (
  exists (select 1 from public.parent_child_links l where l.parent_id = auth.uid() and l.student_id = reading_sessions.user_id and l.status = 'accepted')
);

-- Community posts
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feed text not null check (feed in ('student','parent')),
  category text not null default 'general',
  body text not null,
  attachment_url text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.community_posts to authenticated;
grant all on public.community_posts to service_role;
alter table public.community_posts enable row level security;
create policy "read visible posts" on public.community_posts for select to authenticated using (not hidden or auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "create posts" on public.community_posts for insert to authenticated with check (auth.uid() = user_id);
create policy "own or admin update posts" on public.community_posts for update to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "own or admin delete posts" on public.community_posts for delete to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create table public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
grant select, insert, delete on public.post_likes to authenticated;
grant all on public.post_likes to service_role;
alter table public.post_likes enable row level security;
create policy "read likes" on public.post_likes for select to authenticated using (true);
create policy "own likes" on public.post_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "own unlike" on public.post_likes for delete to authenticated using (auth.uid() = user_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.post_comments to authenticated;
grant all on public.post_comments to service_role;
alter table public.post_comments enable row level security;
create policy "read visible comments" on public.post_comments for select to authenticated using (not hidden or auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "create comments" on public.post_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "own or admin update comments" on public.post_comments for update to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "own or admin delete comments" on public.post_comments for delete to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- Reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  reason text not null default '',
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;
create policy "reporter or admin read" on public.reports for select to authenticated using (auth.uid() = reporter_id or public.has_role(auth.uid(), 'admin'));
create policy "create reports" on public.reports for insert to authenticated with check (auth.uid() = reporter_id);
create policy "admin resolve reports" on public.reports for update to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Moderation audit log
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_post_id uuid references public.community_posts(id) on delete set null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert on public.moderation_actions to authenticated;
grant all on public.moderation_actions to service_role;
alter table public.moderation_actions enable row level security;
create policy "admin reads moderation log" on public.moderation_actions for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin writes moderation log" on public.moderation_actions for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

-- AI API keys (admin-managed, masked in UI)
create table public.ai_api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  provider text not null default 'gemini',
  key_encrypted text not null,
  last4 text not null,
  status text not null default 'active' check (status in ('active','exhausted','error','disabled')),
  priority integer not null default 0,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.ai_api_keys to authenticated;
grant all on public.ai_api_keys to service_role;
alter table public.ai_api_keys enable row level security;
create policy "admin manages ai keys" on public.ai_api_keys for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Parents can read basic profile + study stats of accepted children
create policy "parents read linked children profiles" on public.profiles for select to authenticated using (
  exists (select 1 from public.parent_child_links l where l.parent_id = auth.uid() and l.student_id = profiles.id and l.status = 'accepted')
);
create policy "parents read linked children notebooks" on public.notebooks for select to authenticated using (
  exists (select 1 from public.parent_child_links l where l.parent_id = auth.uid() and l.student_id = notebooks.user_id and l.status = 'accepted')
);
create policy "parents read linked children quiz" on public.quiz_questions for select to authenticated using (
  exists (select 1 from public.parent_child_links l where l.parent_id = auth.uid() and l.student_id = quiz_questions.user_id and l.status = 'accepted')
);
create policy "parents read linked children flashcards" on public.flashcards for select to authenticated using (
  exists (select 1 from public.parent_child_links l where l.parent_id = auth.uid() and l.student_id = flashcards.user_id and l.status = 'accepted')
);

-- Admins can read all profiles and notebooks
create policy "admin reads all profiles" on public.profiles for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin updates profiles" on public.profiles for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin reads all notebooks" on public.notebooks for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin reads all reading sessions" on public.reading_sessions for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin reads all roles" on public.user_roles for select to authenticated using (public.has_role(auth.uid(), 'admin'));