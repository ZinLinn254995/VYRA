-- Bind the portable collection snapshot to the current Vyral identity and
-- deterministic Asset inventory labels. Older v1 snapshots remain readable;
-- new snapshots that include these fields must match canonical database state.

create or replace function public.validate_vyral_master_dna_inventory_labels()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  root_row record;
  asset_row record;
  snapshot_asset jsonb;
begin
  select v.id, v.name, v.visibility, v.created_at, v.updated_at
    into root_row
  from public.vyrals v
  where v.id = new.vyral_id and v.user_id = new.user_id;

  if not found then
    raise exception using errcode = '23503', message = 'Vyral collection identity does not exist.';
  end if;

  if (new.snapshot ? 'master_dna_id' and new.snapshot ->> 'master_dna_id' is distinct from root_row.id::text)
     or (new.snapshot -> 'vyral' ? 'name' and new.snapshot -> 'vyral' ->> 'name' is distinct from root_row.name)
     or (new.snapshot -> 'vyral' ? 'created_at' and
         (new.snapshot -> 'vyral' ->> 'created_at')::timestamptz is distinct from root_row.created_at)
     or (new.snapshot -> 'source_resolution' ? 'visibility' and
         new.snapshot -> 'source_resolution' ->> 'visibility' is distinct from root_row.visibility)
     or (new.snapshot -> 'snapshot' ? 'created_at' and
         (new.snapshot -> 'snapshot' ->> 'created_at')::timestamptz is distinct from root_row.updated_at) then
    raise exception using errcode = '23514', message = 'Master DNA collection identity metadata does not match the current Vyral root.';
  end if;

  for asset_row in
    select a.id, a.name, a.asset_type, a.updated_at
    from public.vyral_assets a
    where a.vyral_id = new.vyral_id and a.user_id = new.user_id
  loop
    select item into snapshot_asset
    from jsonb_array_elements(new.snapshot -> 'assets') as elements(item)
    where item ->> 'asset_id' = asset_row.id::text
    limit 1;

    if snapshot_asset is null
       or (snapshot_asset ? 'name' and snapshot_asset ->> 'name' is distinct from asset_row.name)
       or (snapshot_asset ? 'asset_type' and snapshot_asset ->> 'asset_type' is distinct from asset_row.asset_type)
       or (snapshot_asset ? 'updated_at' and
           (snapshot_asset ->> 'updated_at')::timestamptz is distinct from asset_row.updated_at) then
      raise exception using errcode = '23514', message = 'Master DNA Asset inventory labels do not match the current Vyral Asset records.';
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function public.validate_vyral_master_dna_inventory_labels() from public, anon, authenticated;

drop trigger if exists vyral_master_dna_inventory_labels_validate on public.vyral_master_dna_revisions;
create trigger vyral_master_dna_inventory_labels_validate
before insert on public.vyral_master_dna_revisions
for each row execute function public.validate_vyral_master_dna_inventory_labels();
