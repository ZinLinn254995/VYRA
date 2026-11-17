-- Persist each creator's workspace storyboards in their authenticated account.
create table if not exists public.vyral_storyboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  topic text not null default '' check (char_length(topic) <= 500),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vyral_storyboards_user_updated_idx
  on public.vyral_storyboards (user_id, updated_at desc);

alter table public.vyral_storyboards enable row level security;

revoke all on table public.vyral_storyboards from anon;
grant select, insert, update, delete on table public.vyral_storyboards to authenticated;

drop policy if exists "Creators can read their own storyboards" on public.vyral_storyboards;
create policy "Creators can read their own storyboards"
  on public.vyral_storyboards for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Creators can create their own storyboards" on public.vyral_storyboards;
create policy "Creators can create their own storyboards"
  on public.vyral_storyboards for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Creators can update their own storyboards" on public.vyral_storyboards;
create policy "Creators can update their own storyboards"
  on public.vyral_storyboards for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Creators can delete their own storyboards" on public.vyral_storyboards;
create policy "Creators can delete their own storyboards"
  on public.vyral_storyboards for delete to authenticated
  using ((select auth.uid()) = user_id);
