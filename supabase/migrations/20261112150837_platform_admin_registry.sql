create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon, authenticated;
grant select on table public.platform_admins to service_role;

insert into public.platform_admins (user_id, role)
values ('c9801424-1e4d-4604-99d3-791a8a389b48', 'owner')
on conflict (user_id) do nothing;
