-- Widens the workload percentage from one decimal place to two (e.g. 42.37%),
-- by storing hundredths of a percent instead of tenths. SQLite can't alter a
-- CHECK constraint in place, so the table is recreated, same as 0002 did.

ALTER TABLE settings RENAME TO settings_old;

CREATE TABLE settings (
  user_id                  INTEGER PRIMARY KEY CHECK (user_id >= 0),

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
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

INSERT INTO settings (user_id, full_time_weekly_minutes, workload_percent_x100,
  target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
  target_minutes_fri, target_minutes_sat, target_minutes_sun, updated_at)
SELECT user_id, full_time_weekly_minutes, workload_percent_x10 * 10,
  target_minutes_mon, target_minutes_tue, target_minutes_wed, target_minutes_thu,
  target_minutes_fri, target_minutes_sat, target_minutes_sun, updated_at
FROM settings_old;
DROP TABLE settings_old;
