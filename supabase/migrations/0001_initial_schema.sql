create type repository_status as enum (
  'pending',
  'accepted',
  'rejected'
);

create type repository_section_status as enum (
  'suggested',
  'accepted',
  'rejected'
);

create type curation_action as enum (
  'discovered',
  'accepted',
  'rejected',
  'section_suggested',
  'section_accepted',
  'section_rejected',
  'section_removed',
  'metadata_updated'
);

create type discovery_candidate_status as enum (
  'pending',
  'accepted',
  'rejected',
  'stale'
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table sections (
  id text primary key,
  name text not null,
  description text,
  topics text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sections_id_not_empty check (length(btrim(id)) > 0),
  constraint sections_name_not_empty check (length(btrim(name)) > 0)
);

create trigger sections_set_updated_at
before update on sections
for each row
execute function set_updated_at();

create table repositories (
  id bigserial primary key,
  full_name text not null unique,
  owner text not null,
  name text not null,
  html_url text,
  status repository_status not null default 'pending',
  first_seen_at timestamptz not null default now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repositories_full_name_format check (full_name ~ '^[^/]+/[^/]+$'),
  constraint repositories_full_name_matches_parts check (full_name = owner || '/' || name),
  constraint repositories_owner_not_empty check (length(btrim(owner)) > 0),
  constraint repositories_name_not_empty check (length(btrim(name)) > 0)
);

create index repositories_status_idx on repositories (status);
create index repositories_owner_idx on repositories (owner);

create trigger repositories_set_updated_at
before update on repositories
for each row
execute function set_updated_at();

create table repository_sections (
  repository_id bigint not null references repositories (id) on delete cascade,
  section_id text not null references sections (id) on delete cascade,
  status repository_section_status not null default 'suggested',
  matched_topics text[] not null default '{}',
  suggested_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (repository_id, section_id)
);

create index repository_sections_section_status_idx on repository_sections (section_id, status);
create index repository_sections_repository_status_idx on repository_sections (repository_id, status);

create trigger repository_sections_set_updated_at
before update on repository_sections
for each row
execute function set_updated_at();

create table repository_snapshots (
  id bigserial primary key,
  repository_id bigint not null references repositories (id) on delete cascade,
  snapshot_date date not null,
  collected_at timestamptz not null default now(),
  html_url text,
  description text,
  topics text[] not null default '{}',
  stars integer,
  forks integer,
  open_issues integer,
  watchers integer,
  license text,
  license_name text,
  default_branch text,
  language text,
  github_created_at timestamptz,
  github_updated_at timestamptz,
  pushed_at timestamptz,
  archived boolean,
  disabled boolean,
  fork boolean,
  latest_release_tag text,
  latest_release_name text,
  latest_release_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repository_snapshots_one_per_day unique (repository_id, snapshot_date),
  constraint repository_snapshots_stars_non_negative check (stars is null or stars >= 0),
  constraint repository_snapshots_forks_non_negative check (forks is null or forks >= 0),
  constraint repository_snapshots_open_issues_non_negative check (open_issues is null or open_issues >= 0),
  constraint repository_snapshots_watchers_non_negative check (watchers is null or watchers >= 0)
);

create index repository_snapshots_snapshot_date_idx on repository_snapshots (snapshot_date desc);
create index repository_snapshots_repository_date_idx on repository_snapshots (
  repository_id,
  snapshot_date desc
);

create trigger repository_snapshots_set_updated_at
before update on repository_snapshots
for each row
execute function set_updated_at();

create table discovery_candidates (
  id bigserial primary key,
  repository_id bigint not null references repositories (id) on delete cascade,
  status discovery_candidate_status not null default 'pending',
  source text not null default 'github_topics',
  query text,
  suggested_sections text[] not null default '{}',
  matched_topics text[] not null default '{}',
  discovered_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_candidates_one_per_repo unique (repository_id)
);

create index discovery_candidates_status_idx on discovery_candidates (status);
create index discovery_candidates_discovered_at_idx on discovery_candidates (discovered_at desc);

create trigger discovery_candidates_set_updated_at
before update on discovery_candidates
for each row
execute function set_updated_at();

create table curation_events (
  id bigserial primary key,
  repository_id bigint references repositories (id) on delete set null,
  action curation_action not null,
  previous_repository_status repository_status,
  next_repository_status repository_status,
  sections text[] not null default '{}',
  reason text,
  actor_user_id uuid,
  actor_login text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index curation_events_repository_idx on curation_events (repository_id, created_at desc);
create index curation_events_action_idx on curation_events (action);
create index curation_events_actor_user_idx on curation_events (actor_user_id);

alter table sections enable row level security;
alter table repositories enable row level security;
alter table repository_sections enable row level security;
alter table repository_snapshots enable row level security;
alter table discovery_candidates enable row level security;
alter table curation_events enable row level security;

create view latest_repository_snapshots
with (security_invoker = true) as
select distinct on (repository_id)
  *
from repository_snapshots
order by repository_id, snapshot_date desc, collected_at desc;

create view accepted_repositories
with (security_invoker = true) as
select
  r.id,
  r.full_name,
  r.owner,
  r.name,
  array_agg(rs.section_id order by s.sort_order, rs.section_id) as sections
from repositories r
join repository_sections rs on rs.repository_id = r.id
join sections s on s.id = rs.section_id
where r.status = 'accepted'
  and rs.status = 'accepted'
group by r.id, r.full_name, r.owner, r.name;
