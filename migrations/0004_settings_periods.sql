-- Turns `settings` from one unversioned row per user into a history of dated
-- Pensum periods: each row now only applies from its `effective_from` date
-- onward, until the next period (by effective_from) takes over. Same
-- recreate-table pattern as 0002/0003 — SQLite can't alter this shape in
-- place.
--
-- Every existing row becomes exactly one period per user, backdated to the
-- epoch (1970-01-01) rather than any "school year" date — this is what keeps
-- every existing user's past balances identical to what they were before
-- this migration. The Aug-1 default is only used going forward, when a new
-- account is provisioned (see `provisionDefaultSettings`).

ALTER TABLE settings RENAME TO settings_old;

CREATE TABLE settings (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                  INTEGER NOT NULL CHECK (user_id >= 0),
  effective_from           TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

  -- Workload inputs. Remembered so Settings can redisplay and recompute;
  -- the seven per-weekday columns below stay authoritative for every calculation.
  full_time_weekly_minutes INTEGER NOT NULL DEFAULT 2520
                           CHECK (full_time_weekly_minutes BETWEEN 0 AND 10080),
  workload_percent_x100    INTEGER NOT NULL DEFAULT 10000
                           CHECK (workload_percent_x100 BETWEEN 0 AND 10000),

  -- A target of 0 means "day off" — weekday or weekend, no distinction.
  target_minutes_mon INTEGER NOT NULL CHECK (target_minutes_mon BETWEEN 0 AND 1440),
  target_minutes_tue INTEGER NOT NULL CHECK (target_minutes_tue BETWEEN 0 AND 1440),
  target_minutes_wed INTEGER NOT NULL CHECK (target_minutes_wed BETWEEN 0 AND 1440),
  target_minutes_thu INTEGER NOT NULL CHECK (target_minutes_thu BETWEEN 0 AND 1440),
  target_minutes_fri INTEGER NOT NULL CHECK (target_minutes_fri BETWEEN 0 AND 1440),
  target_minutes_sat INTEGER NOT NULL CHECK (target_minutes_sat BETWEEN 0 AND 1440),
  target_minutes_sun INTEGER NOT NULL CHECK (target_minutes_sun BETWEEN 0 AND 1440),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Two periods can't both start on the same date for the same user — which
  -- one would apply is ambiguous. Also the lookup index `periodFor` relies on.
  UNIQUE (user_id, effective_from)
);
CREATE INDEX idx_settings_user_effective ON settings(user_id, effective_from);

INSERT INTO settings (user_id, effective_from, full_time_weekly_minutes, workload_percent_x100,
  target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
  target_minutes_fri, target_minutes_sat, target_minutes_sun, updated_at)
SELECT user_id, '1970-01-01', full_time_weekly_minutes, workload_percent_x100,
  target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
  target_minutes_fri, target_minutes_sat, target_minutes_sun, updated_at
FROM settings_old;
DROP TABLE settings_old;
