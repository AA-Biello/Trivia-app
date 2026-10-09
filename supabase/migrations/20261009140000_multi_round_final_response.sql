-- Milestone 6.5: multi-round games + combined inserts during FINAL_QUESTION.
-- Combined final answer+wager flow uses FINAL_QUESTION (WAGER_OPEN remains
-- allowed for backward compatibility with any in-flight games).

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
    if game_status is distinct from 'WAGER_OPEN'
       and game_status is distinct from 'FINAL_QUESTION' then
      raise exception 'wagers: inserts only allowed while WAGER_OPEN or FINAL_QUESTION';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.locked_at is not null or old.revealed_at is not null then
      if new.amount is distinct from old.amount then
        raise exception 'wagers: locked/revealed wager amount is immutable';
      end if;
    end if;
    if game_status is distinct from 'WAGER_OPEN'
       and game_status is distinct from 'FINAL_QUESTION'
       and new.amount is distinct from old.amount then
      raise exception
        'wagers: amount changes only allowed while WAGER_OPEN or FINAL_QUESTION';
    end if;
    if old.locked_at is not null and new.locked_at is null then
      raise exception 'wagers: cannot unlock without trivia.bypass_locks';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_wager_submission_window() is
  'Wagers may be submitted during FINAL_QUESTION (combined final response) or legacy WAGER_OPEN.';
