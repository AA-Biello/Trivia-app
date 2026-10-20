-- Allow answer/wager edits while the question is open (unlocked).
-- Lock wagers when entering FINAL_REVIEW (mirrors answer auto-lock).
-- No weakening of ownership, uniqueness, or post-lock immutability.

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

    -- Final review also freezes wagers for the current question.
    if new.status in ('FINAL_REVIEW', 'FINAL_RESULTS', 'GAME_OVER', 'WAGER_LOCKED') then
      update public.wagers
      set locked_at = coalesce(locked_at, now())
      where question_id = new.current_question_id
        and locked_at is null;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.lock_answers_when_question_closes() is
  'Auto-locks answers (and wagers on final/wager close) when the host advances past the open window.';
