create table if not exists public.vyral_vision_creator_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.vyral_assets(id) on delete cascade,
  asset_version_id uuid not null references public.vyral_asset_versions(id) on delete restrict,
  observation_id uuid not null references public.vyral_vision_observations(id) on delete restrict,
  evidence_kind text not null check (evidence_kind in ('observation_review','field_confirmation')),
  decision text not null check (decision in ('creator_confirmed','disputed')),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  field_path text,
  accepted_value jsonb,
  review_evidence_id uuid references public.vyral_vision_creator_evidence(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  constraint vyral_vision_creator_evidence_shape check (
    (evidence_kind = 'observation_review' and field_path is null and accepted_value is null and review_evidence_id is null)
    or
    (evidence_kind = 'field_confirmation' and decision = 'creator_confirmed'
      and field_path is not null and length(field_path) between 1 and 240
      and accepted_value is not null and review_evidence_id is not null)
  )
);

create unique index if not exists vyral_vision_creator_evidence_one_review
  on public.vyral_vision_creator_evidence(observation_id)
  where evidence_kind = 'observation_review';
create unique index if not exists vyral_vision_creator_evidence_one_field
  on public.vyral_vision_creator_evidence(observation_id, field_path)
  where evidence_kind = 'field_confirmation';
create index if not exists vyral_vision_creator_evidence_asset_source
  on public.vyral_vision_creator_evidence(user_id, asset_id, asset_version_id, source_sha256);

alter table public.vyral_vision_creator_evidence enable row level security;
revoke all on public.vyral_vision_creator_evidence from anon, authenticated;
grant select on public.vyral_vision_creator_evidence to authenticated;
grant all on public.vyral_vision_creator_evidence to service_role;

drop policy if exists "Owners can read their Vyral Vision creator evidence" on public.vyral_vision_creator_evidence;
create policy "Owners can read their Vyral Vision creator evidence"
  on public.vyral_vision_creator_evidence for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Service role manages Vyral Vision creator evidence" on public.vyral_vision_creator_evidence;
create policy "Service role manages Vyral Vision creator evidence"
  on public.vyral_vision_creator_evidence for all to service_role
  using (true) with check (true);

create or replace function public.reject_vyral_vision_creator_evidence_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Vyral Vision creator evidence is immutable; create a new observation and evidence record';
end;
$$;
drop trigger if exists vyral_vision_creator_evidence_immutable on public.vyral_vision_creator_evidence;
create trigger vyral_vision_creator_evidence_immutable
  before update or delete on public.vyral_vision_creator_evidence
  for each row execute function public.reject_vyral_vision_creator_evidence_mutation();

comment on table public.vyral_vision_creator_evidence is
  'Append-only creator review and field confirmation evidence, pinned to an exact Asset Version and source SHA-256. It is not itself an Asset DNA revision.';
