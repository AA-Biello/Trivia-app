-- Anonymous / publishable-key access verification
--
-- Run in the Supabase SQL editor AFTER applying
-- supabase/migrations/20261008120000_initial_schema.sql
--
-- How to interpret:
-- - Statements under "EXPECT: empty / denied" must return 0 rows or raise
--   insufficient_privilege / permission denied.
-- - Seed data is created as the migration role (bypasses RLS), then we
--   switch to `anon` to prove team browsers cannot read protected data.
--
-- This does not replace application tests for token hashing; it proves the
-- database posture against direct PostgREST/Data API access as `anon`.

begin;

-- ---------------------------------------------------------------------------
-- Seed (runs as privileged migration/sql-editor role)
-- ---------------------------------------------------------------------------

create temporary table _seed as
select
  gen_random_uuid() as game_id,
  gen_random_uuid() as team_a,
  gen_random_uuid() as team_b,
  gen_random_uuid() as round_id,
  gen_random_uuid() as question_id,
  gen_random_uuid() as answer_a,
  gen_random_uuid() as answer_b;

insert into public.games (id, join_code, title, status)
select game_id, 'TEST01', 'Security Probe', 'QUESTION_CLOSED'
from _seed;

insert into public.game_hosts (game_id, host_token_hash)
select game_id, encode(sha256('host-secret-token'::bytea), 'hex')
from _seed;

insert into public.teams (id, game_id, name, display_score)
select team_a, game_id, 'Alpha', 0 from _seed
union all
select team_b, game_id, 'Beta', 0 from _seed;

insert into public.team_sessions (team_id, session_token_hash)
select team_a, encode(sha256('team-a-token'::bytea), 'hex') from _seed
union all
select team_b, encode(sha256('team-b-token'::bytea), 'hex') from _seed;

insert into public.rounds (id, game_id, position, title, kind)
select round_id, game_id, 1, 'Round 1', 'standard' from _seed;

insert into public.questions (
  id, game_id, round_id, position, prompt, point_value, results_published_at
)
select question_id, game_id, round_id, 1, 'Secret capital?', 1, null
from _seed;

update public.games g
set current_round_id = s.round_id,
    current_question_id = s.question_id
from _seed s
where g.id = s.game_id;

insert into public.question_secrets (question_id, correct_answer, grading_notes)
select question_id, 'Paris', 'Do not leak' from _seed;

-- Insert answers while temporarily open (trigger-enforced window).
update public.games set status = 'QUESTION_OPEN'
where id = (select game_id from _seed);

insert into public.answers (id, game_id, question_id, team_id, answer_text)
select answer_a, game_id, question_id, team_a, 'Paris' from _seed
union all
select answer_b, game_id, question_id, team_b, 'Lyon' from _seed;

update public.games set status = 'QUESTION_CLOSED'
where id = (select game_id from _seed);

insert into public.answer_grades (answer_id, is_correct, points_awarded, graded_at)
select answer_a, true, 1, now() from _seed
union all
select answer_b, false, 0, now() from _seed;

-- Re-open briefly for wager insert window, then lock.
update public.games set status = 'WAGER_OPEN'
where id = (select game_id from _seed);

insert into public.wagers (game_id, question_id, team_id, amount, locked_at)
select game_id, question_id, team_a, 5, now() from _seed
union all
select game_id, question_id, team_b, 12, now() from _seed;

update public.games set status = 'ROUND_REVIEW'
where id = (select game_id from _seed);

insert into public.score_events (
  game_id, team_id, question_id, round_id, delta, reason, published_at
)
select game_id, team_a, question_id, round_id, 1, 'correct', null from _seed;

-- ---------------------------------------------------------------------------
-- Realtime publication must exclude secret tables
-- ---------------------------------------------------------------------------

do $$
declare
  secret_published int;
begin
  select count(*) into secret_published
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in (
      'game_hosts',
      'team_sessions',
      'question_secrets',
      'answer_grades',
      'answers',
      'wagers',
      'score_events'
    );

  if secret_published <> 0 then
    raise exception
      'FAIL: secret/sensitive tables are in supabase_realtime (% rows)',
      secret_published;
  end if;

  raise notice 'PASS: realtime publication excludes secret/sensitive tables';
end;
$$;

-- ---------------------------------------------------------------------------
-- As anon: protected tables must be unreadable
-- ---------------------------------------------------------------------------

-- Session-local helper (pg_temp). Runs as invoker so SET ROLE anon applies.
create or replace function pg_temp.assert_anon_cannot_read(p_rel regclass)
returns void
language plpgsql
as $$
declare
  n bigint;
begin
  begin
    execute format('select count(*) from %s', p_rel) into n;
  exception
    when insufficient_privilege then
      raise notice 'PASS: anon cannot read % (privilege)', p_rel;
      return;
  end;

  if n > 0 then
    raise exception 'FAIL: anon can read % row(s) from %', n, p_rel;
  end if;
  raise notice 'PASS: anon reads 0 rows from % (RLS deny-all)', p_rel;
end;
$$;

set local role anon;

select pg_temp.assert_anon_cannot_read('public.game_hosts');
select pg_temp.assert_anon_cannot_read('public.team_sessions');
select pg_temp.assert_anon_cannot_read('public.question_secrets');
select pg_temp.assert_anon_cannot_read('public.answer_grades');
select pg_temp.assert_anon_cannot_read('public.answers');
select pg_temp.assert_anon_cannot_read('public.wagers');
select pg_temp.assert_anon_cannot_read('public.score_events');

do $$
begin
  begin
    update public.games set title = 'hacked' where join_code = 'TEST01';
    if found then
      raise exception 'FAIL: anon updated games';
    end if;
    raise notice 'PASS: anon update games affected 0 rows or was blocked';
  exception
    when insufficient_privilege then
      raise notice 'PASS: anon cannot UPDATE games (privilege)';
  end;

  begin
    insert into public.answer_grades (answer_id, is_correct, points_awarded)
    values (gen_random_uuid(), true, 99);
    raise exception 'FAIL: anon inserted answer_grades';
  exception
    when insufficient_privilege then
      raise notice 'PASS: anon cannot INSERT answer_grades';
    when others then
      raise notice 'PASS: anon INSERT answer_grades blocked (%)', sqlerrm;
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Integrity: duplicate answer rejected; closed question rejects new answers
-- ---------------------------------------------------------------------------

do $$
declare
  s _seed%rowtype;
  team_c uuid := gen_random_uuid();
begin
  select * into s from _seed;

  begin
    insert into public.answers (game_id, question_id, team_id, answer_text)
    values (s.game_id, s.question_id, s.team_a, 'duplicate');
    raise exception 'FAIL: duplicate answer allowed';
  exception
    when unique_violation then
      raise notice 'PASS: unique (question_id, team_id) enforced';
  end;

  insert into public.teams (id, game_id, name)
  values (team_c, s.game_id, 'Gamma');

  -- Closed / review status must reject a brand-new team's submission.
  begin
    update public.games set status = 'QUESTION_CLOSED' where id = s.game_id;
    insert into public.answers (game_id, question_id, team_id, answer_text)
    values (s.game_id, s.question_id, team_c, 'too late');
    raise exception 'FAIL: answer insert allowed after close';
  exception
    when others then
      if sqlerrm like 'answers: submissions not allowed%' then
        raise notice 'PASS: answer insert blocked after question close';
      else
        raise;
      end if;
  end;
end;
$$;

-- Per-question publish: publishing question A must not require publishing B.
do $$
declare
  s _seed%rowtype;
  q2 uuid := gen_random_uuid();
begin
  select * into s from _seed;

  insert into public.questions (
    id, game_id, round_id, position, prompt, point_value, results_published_at
  ) values (
    q2, s.game_id, s.round_id, 2, 'Second question', 1, null
  );

  update public.questions
  set results_published_at = now()
  where id = s.question_id;

  if exists (
    select 1 from public.questions
    where id = q2 and results_published_at is not null
  ) then
    raise exception 'FAIL: publishing one question published another';
  end if;

  raise notice 'PASS: per-question results_published_at is independent';
end;
$$;

-- Roll back seed so the probe leaves no durable data.
rollback;

-- Manual PostgREST check (outside this transaction), with publishable key:
--   GET /rest/v1/question_secrets?select=*
--   GET /rest/v1/game_hosts?select=*
--   GET /rest/v1/team_sessions?select=*
--   GET /rest/v1/answer_grades?select=*
--   GET /rest/v1/wagers?select=*
--   GET /rest/v1/score_events?select=*
-- Expected: [] or 401/403 — never secret values.
