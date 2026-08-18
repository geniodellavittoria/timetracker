-- Times are stored as integer minutes since midnight so the database can enforce
-- the business rules itself; 'HH:MM' only exists on the wire and in the UI.

CREATE TABLE entries (
  date            TEXT    PRIMARY KEY
                          CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  day_type        TEXT    NOT NULL DEFAULT 'normal'
                          CHECK (day_type IN ('normal','vacation','sick','holiday')),
  arrival_minutes INTEGER CHECK (arrival_minutes BETWEEN 0 AND 1439),
  leave_minutes   INTEGER CHECK (leave_minutes   BETWEEN 0 AND 1439),
  break_minutes   INTEGER CHECK (break_minutes   BETWEEN 0 AND 1440),
  note            TEXT    CHECK (note IS NULL OR length(note) <= 500),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- The row's shape depends on its day type, and overnight shifts are rejected
  -- at the storage layer rather than only in application code.
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

CREATE TABLE settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),

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

-- 2520 min = a 42h full-time week at 100%, giving 504 min (8h 24m) Mon-Fri.
INSERT OR IGNORE INTO settings (id, full_time_weekly_minutes, workload_percent_x10,
  target_minutes_mon, target_minutes_tue, target_minutes_wed,
  target_minutes_thu, target_minutes_fri, target_minutes_sat, target_minutes_sun)
VALUES (1, 2520, 1000, 504, 504, 504, 504, 504, 0, 0);
