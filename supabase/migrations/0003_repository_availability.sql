-- Persist repository lookup outcomes independently of daily metric snapshots.
create table public.repository_availability (
  repository_id bigint primary key references public.repositories (id) on delete cascade,
  last_checked_at timestamptz not null,
  not_found_days integer not null default 0 check (not_found_days between 0 and 2),
  first_not_found_date date,
  last_not_found_date date,
  constraint repository_availability_dates check (
    (not_found_days = 0 and first_not_found_date is null and last_not_found_date is null)
    or (not_found_days = 1 and first_not_found_date is not null
        and last_not_found_date is not null and first_not_found_date = last_not_found_date)
    or (not_found_days = 2 and first_not_found_date is not null
        and last_not_found_date is not null and first_not_found_date < last_not_found_date)
  )
);

alter table public.repository_availability enable row level security;
revoke all on public.repository_availability from public, anon, authenticated;
grant select, insert, update, delete on public.repository_availability to service_role;

-- Manual reacceptance starts a fresh observation period, including when an
-- already accepted repository is accepted again through the curation UI.
create function public.reset_repository_availability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.repository_availability where repository_id = new.id;
  return new;
end;
$$;

revoke all on function public.reset_repository_availability() from public, anon, authenticated;
grant execute on function public.reset_repository_availability() to service_role;

create trigger repositories_reset_availability
after update of status, accepted_at on public.repositories
for each row
when (new.status = 'accepted' and
      (old.status is distinct from new.status or old.accepted_at is distinct from new.accepted_at))
execute function public.reset_repository_availability();

create function public.record_repository_availability(
  p_repository_id bigint,
  p_status_code integer,
  p_checked_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  repo public.repositories%rowtype;
  observation public.repository_availability%rowtype;
  checked_date date;
  accepted_sections text[];
  reason text;
begin
  if p_status_code is null or p_status_code not in (200, 404) or p_checked_at is null then
    raise exception 'Only successful repository lookups and HTTP 404 can be recorded';
  end if;
  checked_date := (p_checked_at at time zone 'UTC')::date;

  -- Serialize concurrent runs and check current curation state before writing.
  select * into strict repo from public.repositories where id = p_repository_id for update;
  if repo.status <> 'accepted' or p_checked_at < repo.accepted_at then
    return jsonb_build_object('outcome', 'ignored', 'not_found_days', 0);
  end if;

  select * into observation from public.repository_availability
  where repository_id = p_repository_id;
  if found and p_checked_at <= observation.last_checked_at then
    return jsonb_build_object('outcome', 'ignored', 'not_found_days', observation.not_found_days);
  end if;

  if p_status_code = 200 then
    insert into public.repository_availability (repository_id, last_checked_at)
    values (p_repository_id, p_checked_at)
    on conflict (repository_id) do update set
      last_checked_at = excluded.last_checked_at,
      not_found_days = 0,
      first_not_found_date = null,
      last_not_found_date = null;
    return jsonb_build_object('outcome', 'available', 'not_found_days', 0);
  end if;

  insert into public.repository_availability (
    repository_id, last_checked_at, not_found_days, first_not_found_date, last_not_found_date
  ) values (p_repository_id, p_checked_at, 1, checked_date, checked_date)
  on conflict (repository_id) do update set
    last_checked_at = excluded.last_checked_at,
    not_found_days = case
      when public.repository_availability.not_found_days = 0 then 1
      when public.repository_availability.last_not_found_date < checked_date then 2
      else public.repository_availability.not_found_days
    end,
    first_not_found_date = coalesce(public.repository_availability.first_not_found_date, checked_date),
    last_not_found_date = checked_date
  returning * into observation;

  if observation.not_found_days < 2 then
    return jsonb_build_object('outcome', 'not_found', 'not_found_days', observation.not_found_days);
  end if;

  select coalesce(array_agg(section_id order by section_id), '{}'::text[])
  into accepted_sections from public.repository_sections
  where repository_id = p_repository_id and status = 'accepted';

  reason := format(
    'GitHub repository lookup returned HTTP 404 on two distinct UTC dates (%s and %s) without a successful lookup.',
    observation.first_not_found_date, observation.last_not_found_date
  );
  update public.repositories set
    status = 'rejected', rejected_at = p_checked_at, rejection_reason = reason
  where id = p_repository_id;
  update public.repository_sections set
    status = 'rejected', rejected_at = p_checked_at, rejection_reason = reason
  where repository_id = p_repository_id and status <> 'rejected';
  update public.discovery_candidates set
    status = 'rejected', decided_at = p_checked_at, decision_reason = reason
  where repository_id = p_repository_id and status <> 'rejected';
  insert into public.curation_events (
    repository_id, action, previous_repository_status, next_repository_status,
    sections, reason, metadata, created_at
  ) values (
    p_repository_id, 'rejected', 'accepted', 'rejected', accepted_sections, reason,
    jsonb_build_object(
      'source', 'metrics',
      'reason_code', 'github_repository_not_found',
      'http_status', 404,
      'endpoint', '/repos/' || repo.full_name,
      'not_found_days', observation.not_found_days,
      'first_not_found_date', observation.first_not_found_date,
      'last_not_found_date', observation.last_not_found_date
    ), p_checked_at
  );
  return jsonb_build_object('outcome', 'rejected', 'not_found_days', observation.not_found_days);
end;
$$;

revoke all on function public.record_repository_availability(bigint, integer, timestamptz)
from public, anon, authenticated;
grant execute on function public.record_repository_availability(bigint, integer, timestamptz)
to service_role;

notify pgrst, 'reload schema';
