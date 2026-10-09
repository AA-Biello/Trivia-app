-- Milestone 6: final wager round config + idempotent final_wager scoring.
-- Do not grant anon/authenticated access to wagers or grades.

-- ---------------------------------------------------------------------------
-- Max wager for final/wager rounds (null for standard rounds)
-- ---------------------------------------------------------------------------

alter table public.rounds
  add column max_wager integer null;

alter table public.rounds
  add constraint rounds_max_wager_nonneg
  check (max_wager is null or max_wager >= 0);

comment on column public.rounds.max_wager is
  'Host-configured maximum wager for final/wager rounds. Null for standard rounds.';

-- ---------------------------------------------------------------------------
-- Idempotent final wager ledger rows
-- ---------------------------------------------------------------------------

create unique index score_events_final_wager_uidx
  on public.score_events (game_id, team_id, question_id)
  where reason = 'final_wager' and question_id is not null;

comment on index public.score_events_final_wager_uidx is
  'Prevents double-awarding when final results publish is triggered more than once.';
