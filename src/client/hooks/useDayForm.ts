import { useCallback, useEffect, useRef, useState } from 'react';
import { validateEntryInput } from '@shared/validation.ts';
import type { ValidationIssue } from '@shared/validation.ts';
import type { DayType, TimeEntry, TimeEntryInput } from '@shared/types.ts';

export interface DayDraft {
  dayType: DayType;
  arrival: string;
  leave: string;
  breakMinutes: number;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 600;

function draftFrom(entry: TimeEntry | null): DayDraft {
  return {
    dayType: entry?.dayType ?? 'normal',
    arrival: entry?.arrival ?? '',
    leave: entry?.leave ?? '',
    breakMinutes: entry?.breakMinutes ?? 0,
  };
}

/** An empty time input yields '', which must become null rather than an invalid ''. */
export function draftToInput(draft: DayDraft): TimeEntryInput {
  if (draft.dayType !== 'normal') {
    return { dayType: draft.dayType, arrival: null, leave: null, breakMinutes: null, note: null };
  }
  return {
    dayType: 'normal',
    arrival: draft.arrival === '' ? null : draft.arrival,
    leave: draft.leave === '' ? null : draft.leave,
    breakMinutes: draft.breakMinutes,
    note: null,
  };
}

/** Content identity of an entry, so a refetch returning the same row is a no-op. */
function signatureOf(entry: TimeEntry | null): string {
  return entry
    ? `${entry.dayType}|${entry.arrival}|${entry.leave}|${entry.breakMinutes}|${entry.updatedAt}`
    : 'none';
}

function isEmptyDraft(draft: DayDraft): boolean {
  return draft.dayType === 'normal'
    && draft.arrival === ''
    && draft.leave === ''
    && draft.breakMinutes === 0;
}

export function useDayForm({
  entry,
  onSave,
}: {
  entry: TimeEntry | null;
  onSave: (input: TimeEntryInput) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<DayDraft>(() => draftFrom(entry));
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [dirty, setDirty] = useState(false);

  // Remembers times across a switch to Vacation and back, so toggling day type
  // by accident does not throw away what was typed.
  const stashedTimes = useRef({ arrival: draft.arrival, leave: draft.leave, breakMinutes: draft.breakMinutes });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Adopt server state only when the server actually sends something different,
   * and only while the user is not mid-edit.
   *
   * Re-running this whenever `dirty` flips would blank the row: saving clears
   * dirty before the refetch lands, so the form would briefly re-sync from the
   * stale pre-save entry and throw away what was just typed.
   */
  const lastSeenEntry = useRef(signatureOf(entry));
  useEffect(() => {
    const signature = signatureOf(entry);
    if (signature === lastSeenEntry.current) return;
    lastSeenEntry.current = signature;
    if (!dirty) setDraft(draftFrom(entry));
  }, [entry, dirty]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const input = draftToInput(draft);
  const issues = isEmptyDraft(draft) ? [] : validateEntryInput(input);
  const canSave = issues.length === 0 && !isEmptyDraft(draft);

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const current = draftToInput(draft);
    if (validateEntryInput(current).length > 0) return;

    setStatus('saving');
    setServerIssues([]);
    try {
      await onSave(current);
      setDirty(false);
      setStatus('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus('idle'), 2000);
    } catch (error) {
      setStatus('error');
      const issuesFromServer = (error as { issues?: ValidationIssue[] })?.issues;
      if (issuesFromServer?.length) setServerIssues(issuesFromServer);
    }
  }, [draft, onSave]);

  const update = useCallback((patch: Partial<DayDraft>) => {
    setDirty(true);
    setStatus('idle');
    setServerIssues([]);

    setDraft((prev) => {
      const next = { ...prev, ...patch };

      if (patch.dayType && patch.dayType !== prev.dayType) {
        if (prev.dayType === 'normal') {
          stashedTimes.current = {
            arrival: prev.arrival, leave: prev.leave, breakMinutes: prev.breakMinutes,
          };
        }
        return patch.dayType === 'normal'
          ? { ...next, ...stashedTimes.current }
          : { ...next, arrival: '', leave: '', breakMinutes: 0 };
      }
      return next;
    });
  }, []);

  // Autosave is only safe because the validation gate blocks partial input:
  // a half-typed '08:0' never parses, so it never reaches the network.
  useEffect(() => {
    if (!dirty || !canSave) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, AUTOSAVE_DELAY_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirty, canSave, save]);

  const flush = useCallback(() => {
    if (dirty && canSave) void save();
  }, [dirty, canSave, save]);

  const allIssues = [...issues, ...serverIssues];

  return {
    draft,
    update,
    flush,
    status,
    issues: allIssues,
    issueFor: (path: string) => allIssues.find((i) => i.path === path),
    isEmpty: isEmptyDraft(draft),
  };
}
