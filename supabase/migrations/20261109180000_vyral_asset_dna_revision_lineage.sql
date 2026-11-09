-- Explicit immutable lineage for successive Asset DNA records.
-- schema_version remains the document format version, not the DNA revision number.
alter table public.vyral_dna_records
  add column if not exists revision_number integer,
  add column if not exists supersedes_record_id uuid,
  add column if not exists change_set_sha256 text;

with ranked as (
  select id, row_number() over (
    partition by asset_id order by created_at asc, id asc
  )::integer as revision
  from public.vyral_dna_records
  where asset_id is not null
)
update public.vyral_dna_records r
set revision_number = ranked.revision
from ranked
where ranked.id = r.id and r.revision_number is null;

create unique index if not exists vyral_dna_records_asset_revision_uidx
  on public.vyral_dna_records(asset_id, revision_number)
  where asset_id is not null and revision_number is not null;

create unique index if not exists vyral_dna_records_id_asset_uidx
  on public.vyral_dna_records(id, asset_id);

alter table public.vyral_dna_records
  drop constraint if exists vyral_dna_records_revision_number_positive,
  add constraint vyral_dna_records_revision_number_positive
    check (revision_number is null or revision_number > 0),
  drop constraint if exists vyral_dna_records_change_set_sha256_format,
  add constraint vyral_dna_records_change_set_sha256_format
    check (change_set_sha256 is null or change_set_sha256 ~ '^[a-f0-9]{64}$'),
  drop constraint if exists vyral_dna_records_supersedes_same_asset_fk,
  add constraint vyral_dna_records_supersedes_same_asset_fk
    foreign key (supersedes_record_id, asset_id)
    references public.vyral_dna_records(id, asset_id)
    on delete restrict;

create or replace function public.guard_vyral_dna_revision_lineage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.revision_number is distinct from old.revision_number
    or new.supersedes_record_id is distinct from old.supersedes_record_id
    or new.change_set_sha256 is distinct from old.change_set_sha256 then
    raise exception 'Asset DNA revision lineage is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists vyral_dna_revision_lineage_guard on public.vyral_dna_records;
create trigger vyral_dna_revision_lineage_guard
  before update on public.vyral_dna_records
  for each row execute function public.guard_vyral_dna_revision_lineage();

comment on column public.vyral_dna_records.revision_number is
  'Per-Asset immutable DNA revision sequence; distinct from schema_version.';
comment on column public.vyral_dna_records.supersedes_record_id is
  'Previous DNA record in this Asset revision chain; null for the first revision.';
comment on column public.vyral_dna_records.change_set_sha256 is
  'SHA-256 of the validated, approved change-set that produced this revision; null for legacy records.';
