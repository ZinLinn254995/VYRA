-- Add immutable, explicit revision lineage to Asset DNA records.
alter table public.vyral_dna_records
  add column if not exists parent_dna_record_id uuid,
  add column if not exists revision_number integer;
with ranked as (
  select id, asset_id,
         row_number() over (partition by asset_id order by created_at asc, id asc) as revision,
         lag(id) over (partition by asset_id order by created_at asc, id asc) as parent_id
  from public.vyral_dna_records
  where scope = 'asset' and asset_id is not null
)
update public.vyral_dna_records d
set revision_number = ranked.revision, parent_dna_record_id = ranked.parent_id
from ranked
where d.id = ranked.id and (d.revision_number is null or d.parent_dna_record_id is distinct from ranked.parent_id);
update public.vyral_dna_records set revision_number = 1 where revision_number is null;
alter table public.vyral_dna_records
  alter column revision_number set default 1,
  alter column revision_number set not null,
  add constraint vyral_dna_records_revision_positive check (revision_number > 0),
  add constraint vyral_dna_records_parent_not_self check (parent_dna_record_id is null or parent_dna_record_id <> id),
  add constraint vyral_dna_records_parent_fk foreign key (parent_dna_record_id) references public.vyral_dna_records(id) on delete restrict;
create unique index if not exists vyral_dna_records_asset_revision_unique
  on public.vyral_dna_records(asset_id, revision_number) where scope = 'asset' and asset_id is not null;
create index if not exists vyral_dna_records_parent_idx
  on public.vyral_dna_records(parent_dna_record_id) where parent_dna_record_id is not null;
comment on column public.vyral_dna_records.revision_number is 'Monotonic immutable Asset-DNA revision sequence per Asset; independent of DNA schema version.';
comment on column public.vyral_dna_records.parent_dna_record_id is 'Previous immutable Asset-DNA revision. Null only for the first revision.';
