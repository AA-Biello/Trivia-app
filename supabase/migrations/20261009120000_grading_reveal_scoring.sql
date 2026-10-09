-- Milestone 5: persist reveal progress + idempotent answer-grade scoring.
-- Do not grant anon/authenticated access to reveal internals or grades.

-- ---------------------------------------------------------------------------
-- Reveal state (server-authoritative; survives refresh)
-- ---------------------------------------------------------------------------

create table public.game_reveal_state (
  game_id uuid primary key references public.games (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  current_question_id uuid null references public.questions (id) on delete set null,
  correct_answer_revealed boolean not null default false,
  team_answers_revealed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index game_reveal_state_round_id_idx on public.game_reveal_state (round_id);

comment on table public.game_reveal_state is
  'Host-controlled reveal cursor. Teams only see fields after host reveals them via app layer.';

create trigger game_reveal_state_set_updated_at
  before update on public.game_reveal_state
  for each row execute function public.set_updated_at();

alter table public.game_reveal_state enable row level security;
revoke all on table public.game_reveal_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Idempotent scoring: one answer_grade ledger row per team+question
-- ---------------------------------------------------------------------------

create unique index score_events_answer_grade_uidx
  on public.score_events (game_id, team_id, question_id)
  where reason = 'answer_grade' and question_id is not null;

comment on index public.score_events_answer_grade_uidx is
  'Prevents double-awarding when scoreboard publish is triggered more than once.';
