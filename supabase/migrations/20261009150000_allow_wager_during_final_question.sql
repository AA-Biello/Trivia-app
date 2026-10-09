-- Fix: combined final answer+wager submits during FINAL_QUESTION.
-- The live DB still enforced legacy WAGER_OPEN-only inserts
-- (error: "wagers: inserts only allowed while WAGER_OPEN").
--
-- Replaces public.enforce_wager_submission_window() used by trigger
-- public.wagers_submission_window.
--
-- Preserved protections:
-- - amount immutable after locked_at / revealed_at
-- - unlock still requires trivia.bypass_locks
-- - WAGER_OPEN kept for backward compatibility
-- - other wager consistency / uniqueness unchanged

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
    if game_status is distinct from 'FINAL_QUESTION'
       and game_status is distinct from 'WAGER_OPEN' then
      raise exception
        'wagers: inserts only allowed while FINAL_QUESTION or WAGER_OPEN (got %)',
        game_status;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.locked_at is not null or old.revealed_at is not null then
      if new.amount is distinct from old.amount then
        raise exception 'wagers: locked/revealed wager amount is immutable';
      end if;
    end if;

    if new.amount is distinct from old.amount
       and game_status is distinct from 'FINAL_QUESTION'
       and game_status is distinct from 'WAGER_OPEN' then
      raise exception
        'wagers: amount changes only allowed while FINAL_QUESTION or WAGER_OPEN (got %)',
        game_status;
    end if;

    if old.locked_at is not null and new.locked_at is null then
      raise exception 'wagers: cannot unlock without trivia.bypass_locks';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_wager_submission_window() is
  'Allows wager insert/amount change during FINAL_QUESTION (combined final response) or legacy WAGER_OPEN. Locked/revealed amounts stay immutable.';
