# Database security verification

Apply `supabase/migrations/20261008120000_initial_schema.sql`, then run
`anon_access_verification.sql` in the Supabase SQL editor.

The script seeds disposable rows inside a transaction, switches to the `anon`
role, and asserts that secret tables are unreadable and that integrity rules
(duplicate answers, post-close submits, per-question publish) hold. It rolls
back at the end.

Also spot-check with the publishable key against PostgREST:

```http
GET /rest/v1/question_secrets?select=*
GET /rest/v1/game_hosts?select=*
GET /rest/v1/team_sessions?select=*
GET /rest/v1/answer_grades?select=*
GET /rest/v1/wagers?select=*
GET /rest/v1/score_events?select=*
```

Expected: empty array or HTTP 401/403 — never secret values.
