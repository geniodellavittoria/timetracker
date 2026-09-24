-- Ferien allowance per user and Ferien year (1 Aug – 31 Jul, keyed by the
-- start year). Days are stored in tenths so half days stay exact integers,
-- the same idea as `workload_percent_x100`. Taken/planned days are never
-- stored — they're counted from `vacation` entries by `summarizeVacation`.

CREATE TABLE vacation_allowances (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year                INTEGER NOT NULL CHECK (year BETWEEN 1970 AND 9998),
  days_x10            INTEGER NOT NULL CHECK (days_x10 BETWEEN 0 AND 3650),
  carry_over_days_x10 INTEGER NOT NULL DEFAULT 0 CHECK (carry_over_days_x10 BETWEEN -3650 AND 3650),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (user_id, year)
);
