-- Allocate monotonically increasing Asset-DNA revisions for every writer.
-- Serializing on the parent Asset row prevents concurrent writers from choosing the same revision.
alter table public.vyral_dna_records
  alter column revision_number drop default,
  alter column revision_number drop not null;

create or replace function public.allocate_vyral_asset_dna_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_id uuid;
  latest_revision integer;
begin
  if new.scope <> 'asset' or new.asset_id is null then
    return new;
  end if;

  perform 1
  from public.vyral_assets a
  where a.id = new.asset_id
    and a.vyral_id = new.vyral_id
    and a.user_id = new.user_id
  for update;

  if not found then
    raise exception 'Cannot allocate DNA revision: source Asset ownership binding is invalid'
      using errcode = '23503';
  end if;

  select d.id, d.revision_number
    into latest_id, latest_revision
  from public.vyral_dna_records d
  where d.asset_id = new.asset_id
    and d.scope = 'asset'
  order by d.revision_number desc, d.created_at desc, d.id desc
  limit 1;

  if latest_id is null then
    new.parent_dna_record_id := null;
    new.revision_number := coalesce(new.revision_number, 1);
  else
    -- The database is authoritative; never trust a caller-supplied parent or sequence.
    new.parent_dna_record_id := latest_id;
    new.revision_number := latest_revision + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists vyral_dna_records_allocate_asset_revision on public.vyral_dna_records;
create trigger vyral_dna_records_allocate_asset_revision
before insert on public.vyral_dna_records
for each row execute function public.allocate_vyral_asset_dna_revision();

revoke all on function public.allocate_vyral_asset_dna_revision() from public, anon, authenticated, service_role;
comment on function public.allocate_vyral_asset_dna_revision() is
  'Serializes Asset-DNA writes on the owning Asset row and assigns the next immutable revision and parent lineage. Vyral-scope records are unchanged.';
