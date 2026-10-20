-- Host-authored waiting copy shown to teams during ROUND_BREAK / ROUND_REVIEW.
-- Public-safe (no secrets). Null means use the app default message.

alter table public.games
  add column waiting_message text null;

alter table public.games
  add constraint games_waiting_message_length
  check (waiting_message is null or char_length(waiting_message) <= 280);

comment on column public.games.waiting_message is
  'Optional host message for teams while the round is closed for grading.';
