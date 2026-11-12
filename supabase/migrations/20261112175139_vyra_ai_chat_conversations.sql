-- Persist each signed-in user's VYRA AI Chat conversations.
-- Message payloads contain text and safe display metadata only; binary attachments are never stored here.
create table if not exists public.vyra_ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat'
    check (char_length(title) between 1 and 160),
  messages jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(messages) = 'array'
      and octet_length(messages::text) <= 1048576
    ),
  archived boolean not null default false,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vyra_ai_chat_conversations_owner_updated_idx
  on public.vyra_ai_chat_conversations (user_id, updated_at desc);

alter table public.vyra_ai_chat_conversations enable row level security;

revoke all on table public.vyra_ai_chat_conversations from anon;
grant select, insert, update, delete on table public.vyra_ai_chat_conversations to authenticated;

drop policy if exists "Users can read their own AI conversations" on public.vyra_ai_chat_conversations;
create policy "Users can read their own AI conversations"
  on public.vyra_ai_chat_conversations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own AI conversations" on public.vyra_ai_chat_conversations;
create policy "Users can create their own AI conversations"
  on public.vyra_ai_chat_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own AI conversations" on public.vyra_ai_chat_conversations;
create policy "Users can update their own AI conversations" on public.vyra_ai_chat_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own AI conversations" on public.vyra_ai_chat_conversations;
create policy "Users can delete their own AI conversations"
  on public.vyra_ai_chat_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.vyra_ai_chat_conversations is
  'Owner-scoped VYRA AI Chat history. Stores text transcript and chat state, never attachment bytes or provider secrets.';
