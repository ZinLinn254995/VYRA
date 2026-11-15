-- Typed semantic relationships for flexible Project creative universes.
-- AI suggestions remain proposed until the creator explicitly reviews them.
create table if not exists public.vyral_asset_relationships (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  from_asset_id uuid not null,
  to_asset_id uuid not null,
  relationship_type text not null check (char_length(relationship_type) between 1 and 80),
  rationale text not null default '' check (char_length(rationale) <= 2000),
  source_kind text not null default 'creator' check (source_kind in ('creator','ai_suggestion','imported')),
  review_status text not null default 'proposed' check (review_status in ('proposed','creator_approved','creator_rejected')),
  review_note text not null default '' check (char_length(review_note) <= 2000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vyral_asset_relationships_not_self check (from_asset_id <> to_asset_id),
  constraint vyral_asset_relationships_vyral_fk foreign key (vyral_id,user_id)
    references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_asset_relationships_from_fk foreign key (from_asset_id,vyral_id,user_id)
    references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_asset_relationships_to_fk foreign key (to_asset_id,vyral_id,user_id)
    references public.vyral_assets(id,vyral_id,user_id) on delete cascade
);
create index if not exists vyral_asset_relationships_from_idx
  on public.vyral_asset_relationships(vyral_id,user_id,from_asset_id,review_status);
create index if not exists vyral_asset_relationships_to_idx
  on public.vyral_asset_relationships(vyral_id,user_id,to_asset_id,review_status);
create index if not exists vyral_asset_relationships_approved_idx
  on public.vyral_asset_relationships(vyral_id,user_id,created_at desc)
  where review_status = 'creator_approved';

alter table public.vyral_asset_relationships enable row level security;
create policy "vyral_asset_relationships_select_own"
  on public.vyral_asset_relationships for select to authenticated
  using (user_id = (select auth.uid()));
create policy "vyral_asset_relationships_insert_proposed_own"
  on public.vyral_asset_relationships for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and review_status = 'proposed'
    and reviewed_at is null
    and source_kind in ('creator','ai_suggestion','imported')
  );
create policy "vyral_asset_relationships_update_own"
  on public.vyral_asset_relationships for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.review_vyral_asset_relationship(
  p_relationship_id uuid,
  p_decision text,
  p_review_note text default ''
)
returns public.vyral_asset_relationships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.vyral_asset_relationships;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_decision not in ('creator_approved','creator_rejected') then
    raise exception 'Invalid relationship review decision';
  end if;
  if coalesce(char_length(p_review_note),0) > 2000 then
    raise exception 'Review note is too long';
  end if;

  update public.vyral_asset_relationships
  set review_status = p_decision,
      review_note = coalesce(p_review_note,''),
      reviewed_at = now()
  where id = p_relationship_id
    and user_id = auth.uid()
    and review_status = 'proposed'
  returning * into v_record;

  if not found then
    raise exception 'Proposed relationship not found or already reviewed';
  end if;
  return v_record;
end;
$$;
revoke all on function public.review_vyral_asset_relationship(uuid,text,text) from public, anon;
grant execute on function public.review_vyral_asset_relationship(uuid,text,text) to authenticated;

grant select, insert, update on public.vyral_asset_relationships to authenticated;
comment on table public.vyral_asset_relationships is
  'Typed semantic relationships between Project Assets. Proposed AI/imported edges are excluded from canon until explicit creator approval.';
