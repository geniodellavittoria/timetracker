-- Adds accounts (users/sessions) and gives `entries`/`settings` an owner.
--
-- `entries` also gets a surrogate `id` here, ahead of a follow-up migration
-- that lets a normal day carry more than one time block: a normal day can
-- already have zero or many rows sharing (user_id, date) once that ships,
-- so a composite (user_id, date) primary key would not have worked.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- id = SHA-256 hex of the raw cookie token; the raw token itself never
-- touches the database, only the cookie, so a DB read/leak can't be
-- replayed as a live session.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- user_id = 0 is a reserved sentinel meaning "legacy data, unclaimed" —
-- never a real users.id, since AUTOINCREMENT starts at 1. The first
-- registration to claim it (see the register route) inherits whatever this
-- deployment already had before accounts existed.
ALTER TABLE entries RENAME TO entries_old;

CREATE TABLE entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL DEFAULT 0 CHECK (user_id >= 0),
  date            TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  day_type        TEXT    NOT NULL DEFAULT 'normal' CHECK (day_type IN ('normal','vacation','sick','holiday')),
  arrival_minutes INTEGER CHECK (arrival_minutes BETWEEN 0 AND 1439),
  leave_minutes   INTEGER CHECK (leave_minutes   BETWEEN 0 AND 1439),
  break_minutes   INTEGER CHECK (break_minutes   BETWEEN 0 AND 1440),
  note            TEXT    CHECK (note IS NULL OR length(note) <= 500),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- The row's shape depends on its day type, and overnight shifts are
  -- rejected at the storage layer rather than only in application code.
  CHECK (
    (day_type =  'normal' AND arrival_minutes IS NOT NULL
                          AND leave_minutes   IS NOT NULL
                          AND break_minutes   IS NOT NULL
                          AND leave_minutes > arrival_minutes
                          AND break_minutes <= leave_minutes - arrival_minutes)
    OR
    (day_type <> 'normal' AND arrival_minutes IS NULL
                          AND leave_minutes   IS NULL
                          AND break_minutes   IS NULL)
  )
);
CREATE INDEX idx_entries_user_date ON entries(user_id, date);
-- A special day (vacation/sick/holiday) stays exclusive: at most one such
-- row per user/date. Normal-day rows are deliberately NOT covered by any
-- uniqueness constraint — a normal day is allowed several rows (time
-- blocks); that's enforced/prevented from colliding with a special row at
-- the application layer, not here.
CREATE UNIQUE INDEX idx_entries_special_unique ON entries(user_id, date) WHERE day_type <> 'normal';

INSERT INTO entries (user_id, date, day_type, arrival_minutes, leave_minutes, break_minutes, note, updated_at)
SELECT 0, date, day_type, arrival_minutes, leave_minutes, break_minutes, note, updated_at FROM entries_old;
DROP TABLE entries_old;

-- settings' PK moves from a hardcoded id=1 to user_id. Same sentinel-0
-- convention as entries, for the same "unclaimed legacy row" purpose.
ALTER TABLE settings RENAME TO settings_old;

CREATE TABLE settings (
  user_id                  INTEGER PRIMARY KEY CHECK (user_id >= 0),

  -- Workload inputs. Remembered so Settings can redisplay and recompute;
  -- the seven per-weekday columns below stay authoritative for every calculation.
  full_time_weekly_minutes INTEGER NOT NULL DEFAULT 2520
                           CHECK (full_time_weekly_minutes BETWEEN 0 AND 10080),
  workload_percent_x10     INTEGER NOT NULL DEFAULT 1000
                           CHECK (workload_percent_x10 BETWEEN 0 AND 1000),

  -- A target of 0 means "day off" — weekday or weekend, no distinction.
  target_minutes_mon INTEGER NOT NULL CHECK (target_minutes_mon BETWEEN 0 AND 1440),
  target_minutes_tue INTEGER NOT NULL CHECK (target_minutes_tue BETWEEN 0 AND 1440),
  target_minutes_wed INTEGER NOT NULL CHECK (target_minutes_wed BETWEEN 0 AND 1440),
  target_minutes_thu INTEGER NOT NULL CHECK (target_minutes_thu BETWEEN 0 AND 1440),
  target_minutes_fri INTEGER NOT NULL CHECK (target_minutes_fri BETWEEN 0 AND 1440),
  target_minutes_sat INTEGER NOT NULL CHECK (target_minutes_sat BETWEEN 0 AND 1440),
  target_minutes_sun INTEGER NOT NULL CHECK (target_minutes_sun BETWEEN 0 AND 1440),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

INSERT INTO settings (user_id, full_time_weekly_minutes, workload_percent_x10,
  target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
  target_minutes_fri, target_minutes_sat, target_minutes_sun, updated_at)
SELECT 0, full_time_weekly_minutes, workload_percent_x10,
  target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
  target_minutes_fri, target_minutes_sat, target_minutes_sun, updated_at
FROM settings_old;
DROP TABLE settings_old;
