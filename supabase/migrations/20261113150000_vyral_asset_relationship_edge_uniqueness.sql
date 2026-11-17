-- Prevent concurrent or retried AI requests from creating duplicate semantic edges.
-- A semantic edge is identified by its Vyral, relationship type and directed endpoints.
create unique index if not exists vyral_asset_relationships_edge_unique
  on public.vyral_asset_relationships (
    vyral_id,
    user_id,
    relationship_type,
    from_kind,
    from_asset_id,
    to_kind,
    to_asset_id
  )
  nulls not distinct;

comment on index public.vyral_asset_relationships_edge_unique is
  'Prevents duplicate directed semantic Asset relationships, including Vyral-root endpoints represented by NULL Asset IDs.';
