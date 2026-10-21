begin;

insert into sections (id, name) values ('test-memory', 'Memory'), ('test-other', 'Other');
insert into repositories (id, full_name, owner, name, status, accepted_at) values
  (1, 'test/missing', 'test', 'missing', 'accepted', '2026-01-01Z'),
  (2, 'test/recovered', 'test', 'recovered', 'accepted', '2026-01-01Z'),
  (3, 'test/utc', 'test', 'utc', 'accepted', '2026-01-01Z'),
  (4, 'test/atomic', 'test', 'atomic', 'accepted', '2026-01-01Z'),
  (5, 'test/pending', 'test', 'pending', 'pending', null);
insert into repository_sections (repository_id, section_id, status, rejection_reason) values
  (1, 'test-memory', 'accepted', null),
  (1, 'test-other', 'rejected', 'Historical section rejection'),
  (4, 'test-memory', 'accepted', null);
insert into discovery_candidates (repository_id, status) values (1, 'accepted'), (4, 'accepted');
insert into repository_snapshots (repository_id, snapshot_date, stars) values (1, '2026-10-19', 100);

-- The RPC must run with the actual automation role, without exposing writes to clients.
set local role service_role;
select record_repository_availability(1, 404, '2026-10-20T00:10Z');
reset role;

do $$
declare result jsonb;
begin
  assert (select not_found_days = 1 from repository_availability where repository_id = 1);
  assert (select status = 'accepted' from repositories where id = 1);
  perform record_repository_availability(1, 404, '2026-10-20T01:00Z');
  assert (select not_found_days = 1 from repository_availability where repository_id = 1), 'same-day retries must not increment';

  result := record_repository_availability(1, 404, '2026-10-21T00:10Z');
  assert result->>'outcome' = 'rejected';
  assert (select status = 'rejected' from repositories where id = 1);
  assert (select bool_and(status = 'rejected') from repository_sections where repository_id = 1);
  assert (select rejection_reason = 'Historical section rejection' from repository_sections where repository_id = 1 and section_id = 'test-other');
  assert (select status = 'rejected' from discovery_candidates where repository_id = 1);
  assert (select count(*) = 1 from repository_snapshots where repository_id = 1), 'snapshots must survive rejection';
  assert (select count(*) = 0 from accepted_repositories where id = 1);
  assert (select count(*) = 1 from curation_events where repository_id = 1);
  assert (select sections = array['test-memory'] and previous_repository_status = 'accepted'
    and next_repository_status = 'rejected' and metadata->>'source' = 'metrics'
    and metadata->>'first_not_found_date' = '2026-10-20'
    and metadata->>'last_not_found_date' = '2026-10-21'
    from curation_events where repository_id = 1);
  perform record_repository_availability(1, 404, '2026-10-22T00:10Z');
  assert (select count(*) = 1 from curation_events where repository_id = 1), 'rejection must be idempotent';

  -- Successful lookup resets the streak; older in-flight results cannot undo it.
  perform record_repository_availability(2, 404, '2026-10-20T00:10Z');
  perform record_repository_availability(2, 200, '2026-10-21T00:10Z');
  assert (select not_found_days = 0 and first_not_found_date is null from repository_availability where repository_id = 2);
  result := record_repository_availability(2, 404, '2026-10-20T23:50Z');
  assert result->>'outcome' = 'ignored';
  perform record_repository_availability(2, 404, '2026-10-22T00:10Z');
  assert (select not_found_days = 1 from repository_availability where repository_id = 2);
  -- Missing collection days do not count as success or as additional failures.
  perform record_repository_availability(2, 404, '2026-10-25T00:10Z');
  assert (select status = 'rejected' from repositories where id = 2);

  -- Normalize to UTC even when callers supply different local calendar dates.
  perform record_repository_availability(3, 404, '2026-10-20T23:30Z');
  perform record_repository_availability(3, 404, '2026-10-21T08:45+09');
  assert (select not_found_days = 1 from repository_availability where repository_id = 3);
  perform record_repository_availability(3, 404, '2026-10-21T09:05+09');
  assert (select status = 'rejected' from repositories where id = 3);

  -- Manual reacceptance clears old failure evidence and rejects stale checks.
  update repositories set status = 'accepted', accepted_at = '2026-10-23T00:00Z' where id = 1;
  assert (select count(*) = 0 from repository_availability where repository_id = 1);
  result := record_repository_availability(1, 404, '2026-10-22T23:59Z');
  assert result->>'outcome' = 'ignored';
  perform record_repository_availability(1, 404, '2026-10-24T00:10Z');
  assert (select not_found_days = 1 from repository_availability where repository_id = 1);
  update repositories set accepted_at = '2026-10-24T01:00Z' where id = 1;
  assert (select count(*) = 0 from repository_availability where repository_id = 1);

  result := record_repository_availability(5, 404, '2026-10-20T00:10Z');
  assert result->>'outcome' = 'ignored';
  assert (select count(*) = 0 from repository_availability where repository_id = 5);
  begin
    perform record_repository_availability(5, 503, '2026-10-20T00:10Z');
    raise check_violation using message = 'Expected invalid HTTP status to fail';
  exception when raise_exception then null;
  end;

  assert not has_function_privilege('anon', 'record_repository_availability(bigint,integer,timestamptz)', 'execute');
  assert not has_function_privilege('authenticated', 'record_repository_availability(bigint,integer,timestamptz)', 'execute');
  assert not has_table_privilege('anon', 'repository_availability', 'insert');
  assert not has_table_privilege('authenticated', 'repository_availability', 'update');
end;
$$;

-- If writing the audit event fails, the entire rejection (including the streak)
-- must roll back so the next run can safely retry it.
select record_repository_availability(4, 404, '2026-10-20T00:10Z');
create function pg_temp.fail_availability_event() returns trigger language plpgsql as $$
begin
  raise check_violation using message = 'Simulated audit storage failure';
end;
$$;
create trigger fail_availability_event before insert on curation_events
for each row execute function pg_temp.fail_availability_event();
do $$
begin
  begin
    perform record_repository_availability(4, 404, '2026-10-21T00:10Z');
    raise exception 'Expected audit storage failure';
  exception when check_violation then null;
  end;
  assert (select status = 'accepted' from repositories where id = 4);
  assert (select status = 'accepted' from repository_sections where repository_id = 4);
  assert (select status = 'accepted' from discovery_candidates where repository_id = 4);
  assert (select not_found_days = 1 from repository_availability where repository_id = 4);
  assert (select count(*) = 0 from curation_events where repository_id = 4);
end;
$$;
drop trigger fail_availability_event on curation_events;
select record_repository_availability(4, 404, '2026-10-21T00:10Z');
do $$ begin
  assert (select status = 'rejected' from repositories where id = 4);
end; $$;

rollback;
