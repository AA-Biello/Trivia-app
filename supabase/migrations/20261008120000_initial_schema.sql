-- Pub trivia initial schema (security-hardened)
--
-- Access-control strategy (host-authoritative, token-based sessions):
-- 1. Sensitive data lives in separate tables that are NEVER granted to anon:
--    game_hosts, team_sessions, question_secrets, answer_grades.
-- 2. RLS is enabled on every table. Default posture for anon/authenticated is
--    DENY (no permissive policies). Service role bypasses RLS.
-- 3. Token-based team/host auth does NOT map to auth.uid(). Therefore RLS
--    alone cannot authorize "this browser owns team X". Ownership checks belong
--    in Next.js server code (or SECURITY DEFINER RPCs) that:
--      a) receive the raw session token from a httpOnly cookie / header
--      b) hash it and look up team_sessions / game_hosts
--      c) perform mutations with the service role
--    Never trust a client-supplied team_id without the matching session token.
-- 4. Browser publishable-key clients must not insert/update/delete game data.
--    Privileged writes (state advance, grading, secrets, publish, scores) use
--    the service role on the server only.
-- 5. Correctness is not on `answers`. Grades are exposed only after
--    questions.results_published_at is set (per-question publish for ROUND_REVIEW).
-- 6. Wager amounts stay private until wagers.revealed_at is set.
-- 7. Realtime publishes only non-secret tables. team_sessions is excluded so
--    roster realtime cannot leak token hashes.
--
-- Apply via Supabase SQL editor or CLI after creating a project manually.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.game_status as enum (
  'LOBBY',
  'QUESTION_OPEN',
  'QUESTION_CLOSED',
  'ROUND_BREAK',
  'ROUND_REVIEW',
  'REVEAL',
  'RESULTS_PUBLISHED',
  'SCOREBOARD',
  'WAGER_OPEN',
  'WAGER_LOCKED',
  'FINAL_QUESTION',
  'FINAL_REVIEW',
  'FINAL_RESULTS',
  'GAME_OVER'
);

create type public.round_kind as enum (
  'standard',
  'wager',
  'final'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Host-controlled bypass for rare unlocks (set locally in a transaction):
--   select set_config('trivia.bypass_locks', 'on', true);
create or replace function public.trivia_locks_bypassed()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('trivia.bypass_locks', true), ''), 'off') = 'on';
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  join_code text not null,
  title text not null default 'Trivia Night',
  status public.game_status not null default 'LOBBY',
  current_round_id uuid null,
  current_question_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_join_code_format check (join_code ~ '^[A-Z0-9]{4,8}$')
);

create unique index games_join_code_uidx on public.games (join_code);
create index games_status_idx on public.games (status);

comment on table public.games is
  'Host-advanced game. Public join_code; no host secrets on this row.';
comment on column public.games.status is
  'Host-authoritative state machine. Only service-role server code should update.';

-- Host credentials kept off the public games row / realtime payload.
create table public.game_hosts (
  game_id uuid primary key references public.games (id) on delete cascade,
  host_token_hash text not null,
  created_at timestamptz not null default now()
);

create unique index game_hosts_token_hash_uidx on public.game_hosts (host_token_hash);

comment on table public.game_hosts is
  'Host-only. Token hash never selectable by team-facing clients or realtime.';

-- Public team roster fields only (no session secrets).
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null,
  -- Updated only when score events are published (no pre-publish leakage).
  display_score integer not null default 0,
  created_at timestamptz not null default now(),
  constraint teams_name_not_blank check (char_length(btrim(name)) > 0),
  constraint teams_display_score_nonneg check (display_score >= 0)
);

create index teams_game_id_idx on public.teams (game_id);
create unique index teams_game_id_name_uidx on public.teams (game_id, lower(name));

comment on column public.teams.display_score is
  'Public scoreboard total. Must only change when score_events are published.';

-- Team session secrets isolated from roster/realtime table.
create table public.team_sessions (
  team_id uuid primary key references public.teams (id) on delete cascade,
  session_token_hash text not null,
  created_at timestamptz not null default now()
);

create unique index team_sessions_token_hash_uidx
  on public.team_sessions (session_token_hash);

comment on table public.team_sessions is
  'Team browser session token hashes. Never grant to anon or publish to realtime.';

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  position integer not null,
  title text not null default '',
  kind public.round_kind not null default 'standard',
  planned_question_count integer not null default 5,
  created_at timestamptz not null default now(),
  constraint rounds_position_positive check (position > 0),
  constraint rounds_planned_question_count_positive check (planned_question_count > 0),
  constraint rounds_game_position_uidx unique (game_id, position)
);

create index rounds_game_id_idx on public.rounds (game_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  position integer not null,
  prompt text not null,
  media_url text null,
  point_value integer not null default 1,
  -- Per-question publish gate for ROUND_REVIEW (not whole-round-at-once).
  results_published_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint questions_position_positive check (position > 0),
  constraint questions_point_value_nonneg check (point_value >= 0),
  constraint questions_round_position_uidx unique (round_id, position)
);

create index questions_game_id_idx on public.questions (game_id);
create index questions_round_id_idx on public.questions (round_id);
create index questions_round_unpublished_idx
  on public.questions (round_id)
  where results_published_at is null;

comment on column public.questions.results_published_at is
  'Null = grades/correctness hidden from teams. Set per question during review.';

-- Correct answers isolated from the public questions table.
create table public.question_secrets (
  question_id uuid primary key references public.questions (id) on delete cascade,
  correct_answer text not null,
  grading_notes text null
);

comment on table public.question_secrets is
  'Host-only answer key. Not for team clients or public realtime.';

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  answer_text text not null default '',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- When set, answer_text is immutable unless trivia.bypass_locks = on.
  locked_at timestamptz null,
  constraint answers_question_team_uidx unique (question_id, team_id)
);

create index answers_game_id_idx on public.answers (game_id);
create index answers_team_id_idx on public.answers (team_id);
create index answers_question_id_idx on public.answers (question_id);

comment on table public.answers is
  'Submission text only. One row per (question, team). Correctness in answer_grades.';
comment on column public.answers.locked_at is
  'When non-null, team cannot change answer_text without host bypass.';

-- Grading separated so SELECT on answers cannot leak marks.
create table public.answer_grades (
  answer_id uuid primary key references public.answers (id) on delete cascade,
  is_correct boolean null,
  points_awarded integer not null default 0,
  graded_at timestamptz null
);

comment on table public.answer_grades is
  'Host grading. Expose to teams only after that question is published.';

create table public.wagers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  amount integer not null,
  locked_at timestamptz null,
  revealed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wagers_amount_nonneg check (amount >= 0),
  constraint wagers_question_team_uidx unique (question_id, team_id)
);

create index wagers_game_id_idx on public.wagers (game_id);
create index wagers_team_id_idx on public.wagers (team_id);
create index wagers_unrevealed_idx
  on public.wagers (question_id)
  where revealed_at is null;

comment on column public.wagers.revealed_at is
  'Null means amount must stay private to the owning team / host.';

create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  question_id uuid null references public.questions (id) on delete set null,
  round_id uuid null references public.rounds (id) on delete set null,
  delta integer not null,
  reason text not null,
  published_at timestamptz null,
  created_at timestamptz not null default now()
);

create index score_events_game_id_idx on public.score_events (game_id);
create index score_events_team_id_idx on public.score_events (team_id);
create index score_events_question_id_idx on public.score_events (question_id);
create index score_events_unpublished_idx
  on public.score_events (question_id)
  where published_at is null;

comment on table public.score_events is
  'Scoring ledger. Unpublished rows are host-only; publish per question.';

-- Deferred FKs from games → current round/question.
alter table public.games
  add constraint games_current_round_id_fkey
  foreign key (current_round_id) references public.rounds (id) on delete set null;

alter table public.games
  add constraint games_current_question_id_fkey
  foreign key (current_question_id) references public.questions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create or replace function public.enforce_answer_game_consistency()
returns trigger
language plpgsql
as $$
declare
  team_game uuid;
  question_game uuid;
begin
  select game_id into team_game from public.teams where id = new.team_id;
  select game_id into question_game from public.questions where id = new.question_id;

  if team_game is null then
    raise exception 'answers: unknown team_id';
  end if;
  if question_game is null then
    raise exception 'answers: unknown question_id';
  end if;
  if new.game_id is distinct from team_game
     or new.game_id is distinct from question_game then
    raise exception 'answers: game_id must match team and question';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_answer_submission_window()
returns trigger
language plpgsql
as $$
declare
  game_row public.games%rowtype;
  text_changed boolean := false;
begin
  if public.trivia_locks_bypassed() then
    return new;
  end if;

  select * into game_row from public.games where id = new.game_id;
  if not found then
    raise exception 'answers: game not found';
  end if;

  if tg_op = 'UPDATE' then
    text_changed := new.answer_text is distinct from old.answer_text;

    -- Unlocking always requires an explicit host bypass.
    if old.locked_at is not null and new.locked_at is null then
      raise exception 'answers: cannot unlock without trivia.bypass_locks';
    end if;

    -- Locked rows are immutable for answer text.
    if old.locked_at is not null and text_changed then
      raise exception 'answers: locked answers cannot be modified';
    end if;

    -- Setting locked_at alone (e.g. host close) is allowed in any status.
    if not text_changed then
      return new;
    end if;
  end if;

  -- Inserts and text changes only while the host has a question open.
  if game_row.status not in ('QUESTION_OPEN', 'FINAL_QUESTION') then
    raise exception
      'answers: submissions not allowed while game status is %', game_row.status;
  end if;

  if game_row.current_question_id is not null
     and new.question_id is distinct from game_row.current_question_id then
    raise exception 'answers: question is not the current open question';
  end if;

  return new;
end;
$$;

create or replace function public.lock_answers_when_question_closes()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and new.status in (
       'QUESTION_CLOSED',
       'ROUND_REVIEW',
       'REVEAL',
       'RESULTS_PUBLISHED',
       'SCOREBOARD',
       'WAGER_LOCKED',
       'FINAL_REVIEW',
       'FINAL_RESULTS',
       'GAME_OVER'
     )
     and new.current_question_id is not null then
    update public.answers
    set locked_at = coalesce(locked_at, now())
    where question_id = new.current_question_id
      and locked_at is null;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_wager_game_consistency()
returns trigger
language plpgsql
as $$
declare
  team_game uuid;
  question_game uuid;
begin
  select game_id into team_game from public.teams where id = new.team_id;
  select game_id into question_game from public.questions where id = new.question_id;

  if team_game is null or question_game is null then
    raise exception 'wagers: team_id or question_id invalid';
  end if;
  if new.game_id is distinct from team_game
     or new.game_id is distinct from question_game then
    raise exception 'wagers: game_id must match team and question';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_wager_submission_window()
returns trigger
language plpgsql
as $$
declare
  game_status public.game_status;
begin
  if public.trivia_locks_bypassed() then
    return new;
  end if;

  select status into game_status from public.games where id = new.game_id;

  if tg_op = 'INSERT' then
    if game_status is distinct from 'WAGER_OPEN' then
      raise exception 'wagers: inserts only allowed while WAGER_OPEN';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.locked_at is not null or old.revealed_at is not null then
      if new.amount is distinct from old.amount then
        raise exception 'wagers: locked/revealed wager amount is immutable';
      end if;
    end if;
    if game_status is distinct from 'WAGER_OPEN'
       and new.amount is distinct from old.amount then
      raise exception 'wagers: amount changes only allowed while WAGER_OPEN';
    end if;
    if old.locked_at is not null and new.locked_at is null then
      raise exception 'wagers: cannot unlock without trivia.bypass_locks';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_score_event_game_consistency()
returns trigger
language plpgsql
as $$
declare
  team_game uuid;
begin
  select game_id into team_game from public.teams where id = new.team_id;
  if team_game is null or new.game_id is distinct from team_game then
    raise exception 'score_events: team must belong to game';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_question_round_game_consistency()
returns trigger
language plpgsql
as $$
declare
  round_game uuid;
begin
  select game_id into round_game from public.rounds where id = new.round_id;
  if round_game is null or new.game_id is distinct from round_game then
    raise exception 'questions: round must belong to the same game';
  end if;
  return new;
end;
$$;

create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

create trigger answers_set_updated_at
  before update on public.answers
  for each row execute function public.set_updated_at();

create trigger wagers_set_updated_at
  before update on public.wagers
  for each row execute function public.set_updated_at();

create trigger answers_game_consistency
  before insert or update on public.answers
  for each row execute function public.enforce_answer_game_consistency();

create trigger answers_submission_window
  before insert or update on public.answers
  for each row execute function public.enforce_answer_submission_window();

create trigger games_lock_answers_on_close
  after update of status on public.games
  for each row execute function public.lock_answers_when_question_closes();

create trigger wagers_game_consistency
  before insert or update on public.wagers
  for each row execute function public.enforce_wager_game_consistency();

create trigger wagers_submission_window
  before insert or update on public.wagers
  for each row execute function public.enforce_wager_submission_window();

create trigger score_events_game_consistency
  before insert or update on public.score_events
  for each row execute function public.enforce_score_event_game_consistency();

create trigger questions_round_game_consistency
  before insert or update on public.questions
  for each row execute function public.enforce_question_round_game_consistency();

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- Mutations are revoked from anon/authenticated. Service role retains access.
-- Token ownership is enforced in server code, not via client-supplied team_id.
-- ---------------------------------------------------------------------------

alter table public.games enable row level security;
alter table public.game_hosts enable row level security;
alter table public.teams enable row level security;
alter table public.team_sessions enable row level security;
alter table public.rounds enable row level security;
alter table public.questions enable row level security;
alter table public.question_secrets enable row level security;
alter table public.answers enable row level security;
alter table public.answer_grades enable row level security;
alter table public.wagers enable row level security;
alter table public.score_events enable row level security;

-- No permissive policies: anon/authenticated cannot read or write any rows
-- through the Data API until explicitly reviewed policies are added.
-- Secret tables additionally have table privileges revoked below.

revoke all on table public.game_hosts from anon, authenticated;
revoke all on table public.team_sessions from anon, authenticated;
revoke all on table public.question_secrets from anon, authenticated;
revoke all on table public.answer_grades from anon, authenticated;

revoke insert, update, delete, truncate on table public.games from anon, authenticated;
revoke insert, update, delete, truncate on table public.teams from anon, authenticated;
revoke insert, update, delete, truncate on table public.rounds from anon, authenticated;
revoke insert, update, delete, truncate on table public.questions from anon, authenticated;
revoke insert, update, delete, truncate on table public.answers from anon, authenticated;
revoke insert, update, delete, truncate on table public.wagers from anon, authenticated;
revoke insert, update, delete, truncate on table public.score_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime publication (safe tables only)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.questions;

-- Explicitly NOT published:
--   game_hosts, team_sessions, question_secrets, answers,
--   answer_grades, wagers, score_events
