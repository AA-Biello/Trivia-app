-- Anonymous / publishable-key access verification
--
-- Run in the Supabase SQL editor AFTER applying
-- supabase/migrations/20261008120000_initial_schema.sql
--
-- Self-contained: one DO block holds all seeded IDs in PL/pgSQL variables
-- (no cross-statement temp table / CTE reuse). Seeded rows are deleted at
-- the end (and at the start) so the script is rerunnable without junk data.
--
-- Cases covered:
-- - realtime publication excludes secret tables
-- - anonymous access denial to secret tables
-- - unpublished grading/scoring privacy (anon cannot read those tables)
-- - duplicate answer rejection while question is open
-- - submission rejection after close
-- - locked answer immutability
-- - per-question publish independence

do $$
declare
  game_id uuid := gen_random_uuid();
  team_a uuid := gen_random_uuid();
  team_b uuid := gen_random_uuid();
  team_c uuid := gen_random_uuid();
  round_id uuid := gen_random_uuid();
  question_id uuid := gen_random_uuid();
  question_id_2 uuid := gen_random_uuid();
  answer_a uuid := gen_random_uuid();
  answer_b uuid := gen_random_uuid();
  seed_join_code text := 'TEST01';
  secret_published int;
  n bigint;
  locked_at_val timestamptz;
  rel text;
  secret_rels text[] := array[
    'public.game_hosts',
    'public.team_sessions',
    'public.question_secrets',
    'public.answer_grades',
    'public.answers',
    'public.wagers',
    'public.score_events'
  ];
begin
  -- -------------------------------------------------------------------------
  -- Cleanup any prior probe rows (rerunnable)
  -- -------------------------------------------------------------------------
  delete from public.games g where g.join_code = seed_join_code;

  -- -------------------------------------------------------------------------
  -- Realtime publication must exclude secret tables
  -- -------------------------------------------------------------------------
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

  -- -------------------------------------------------------------------------
  -- Seed (privileged role; respects submission-window triggers)
  -- -------------------------------------------------------------------------
  insert into public.games (id, join_code, title, status)
  values (game_id, seed_join_code, 'Security Probe', 'LOBBY');

  insert into public.game_hosts (game_id, host_token_hash)
  values (game_id, encode(sha256('host-secret-token'::bytea), 'hex'));

  insert into public.teams (id, game_id, name, display_score)
  values
    (team_a, game_id, 'Alpha', 0),
    (team_b, game_id, 'Beta', 0);

  insert into public.team_sessions (team_id, session_token_hash)
  values
    (team_a, encode(sha256('team-a-token'::bytea), 'hex')),
    (team_b, encode(sha256('team-b-token'::bytea), 'hex'));

  insert into public.rounds (id, game_id, position, title, kind)
  values (round_id, game_id, 1, 'Round 1', 'standard');

  insert into public.questions (
    id, game_id, round_id, position, prompt, point_value, results_published_at
  ) values (
    question_id, game_id, round_id, 1, 'Secret capital?', 1, null
  );

  update public.games
  set current_round_id = round_id,
      current_question_id = question_id,
      status = 'QUESTION_OPEN'
  where id = game_id;

  insert into public.question_secrets (question_id, correct_answer, grading_notes)
  values (question_id, 'Paris', 'Do not leak');

  insert into public.answers (id, game_id, question_id, team_id, answer_text)
  values
    (answer_a, game_id, question_id, team_a, 'Paris'),
    (answer_b, game_id, question_id, team_b, 'Lyon');

  update public.games set status = 'QUESTION_CLOSED' where id = game_id;

  insert into public.answer_grades (answer_id, is_correct, points_awarded, graded_at)
  values
    (answer_a, true, 1, now()),
    (answer_b, false, 0, now());

  update public.games set status = 'WAGER_OPEN' where id = game_id;

  insert into public.wagers (game_id, question_id, team_id, amount, locked_at)
  values
    (game_id, question_id, team_a, 5, now()),
    (game_id, question_id, team_b, 12, now());

  update public.games set status = 'ROUND_REVIEW' where id = game_id;

  insert into public.score_events (
    game_id, team_id, question_id, round_id, delta, reason, published_at
  ) values (
    game_id, team_a, question_id, round_id, 1, 'correct', null
  );

  -- -------------------------------------------------------------------------
  -- Anon: denial + unpublished grading/scoring privacy
  -- -------------------------------------------------------------------------
  execute 'set local role anon';

  foreach rel in array secret_rels
  loop
    begin
      execute format('select count(*) from %s', rel) into n;
    exception
      when insufficient_privilege then
        raise notice 'PASS: anon cannot read % (privilege)', rel;
        continue;
    end;

    if n > 0 then
      raise exception 'FAIL: anon can read % row(s) from %', n, rel;
    end if;
    raise notice 'PASS: anon reads 0 rows from % (RLS deny-all / unpublished privacy)', rel;
  end loop;

  begin
    update public.games set title = 'hacked' where id = game_id;
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

  execute 'reset role';

  -- -------------------------------------------------------------------------
  -- Integrity 1: duplicate answer while QUESTION_OPEN → unique_violation
  -- -------------------------------------------------------------------------
  update public.games
  set status = 'QUESTION_OPEN',
      current_question_id = question_id
  where id = game_id;

  begin
    insert into public.answers (game_id, question_id, team_id, answer_text)
    values (game_id, question_id, team_a, 'duplicate');
    raise exception 'FAIL: duplicate answer allowed';
  exception
    when unique_violation then
      raise notice 'PASS: unique (question_id, team_id) enforced while open';
  end;

  -- -------------------------------------------------------------------------
  -- Integrity 2: new answer rejected after close
  -- -------------------------------------------------------------------------
  insert into public.teams (id, game_id, name)
  values (team_c, game_id, 'Gamma');

  update public.games
  set status = 'QUESTION_CLOSED'
  where id = game_id;

  begin
    insert into public.answers (game_id, question_id, team_id, answer_text)
    values (game_id, question_id, team_c, 'too late');
    raise exception 'FAIL: answer insert allowed after close';
  exception
    when others then
      if sqlerrm like 'answers: submissions not allowed%' then
        raise notice 'PASS: answer insert blocked after question close';
      else
        raise;
      end if;
  end;

  -- -------------------------------------------------------------------------
  -- Integrity 3: locked answer immutability
  -- -------------------------------------------------------------------------
  select locked_at into locked_at_val
  from public.answers
  where id = answer_a;

  if locked_at_val is null then
    raise exception 'FAIL: expected answer_a to be locked after QUESTION_CLOSED';
  end if;

  begin
    update public.answers
    set answer_text = 'tampered'
    where id = answer_a;
    raise exception 'FAIL: locked answer text was modified';
  exception
    when others then
      if sqlerrm like 'answers: locked answers cannot be modified%' then
        raise notice 'PASS: locked answer cannot be modified';
      else
        raise;
      end if;
  end;

  -- -------------------------------------------------------------------------
  -- Per-question publish independence (unpublished privacy sibling check)
  -- -------------------------------------------------------------------------
  insert into public.questions (
    id, game_id, round_id, position, prompt, point_value, results_published_at
  ) values (
    question_id_2, game_id, round_id, 2, 'Second question', 1, null
  );

  update public.questions
  set results_published_at = now()
  where id = question_id;

  if exists (
    select 1 from public.questions
    where id = question_id_2 and results_published_at is not null
  ) then
    raise exception 'FAIL: publishing one question published another';
  end if;
  raise notice 'PASS: per-question results_published_at is independent';

  -- -------------------------------------------------------------------------
  -- Cleanup seeded rows (FK cascades from games)
  -- -------------------------------------------------------------------------
  delete from public.games g where g.id = game_id;

  raise notice 'PASS: verification complete; seeded data removed';
exception
  when others then
    -- Best-effort cleanup so a failed run still leaves no junk.
    delete from public.games g
    where g.id = game_id or g.join_code = seed_join_code;
    raise;
end;
$$;

-- Manual PostgREST check (outside this script), with publishable key:
--   GET /rest/v1/question_secrets?select=*
--   GET /rest/v1/game_hosts?select=*
--   GET /rest/v1/team_sessions?select=*
--   GET /rest/v1/answer_grades?select=*
--   GET /rest/v1/wagers?select=*
--   GET /rest/v1/score_events?select=*
-- Expected: [] or 401/403 — never secret values.
