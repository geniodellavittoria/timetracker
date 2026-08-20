import { useCallback, useEffect, useRef, useState } from 'react';
import { validateEntryInput } from '@shared/validation.ts';
import type { ValidationIssue } from '@shared/validation.ts';
import type { DayType, TimeEntry, TimeEntryInput } from '@shared/types.ts';

export interface TimeBlockDraft {
  arrival: string;
  leave: string;
  breakMinutes: number;
}

export interface DayDraft {
  dayType: DayType;
  blocks: TimeBlockDraft[];
  note: string;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 600;

const emptyBlock = (): TimeBlockDraft => ({ arrival: '', leave: '', breakMinutes: 0 });

function draftFrom(entry: TimeEntry | null): DayDraft {
  return {
    dayType: entry?.dayType ?? 'normal',
    // A brand new normal day starts with one empty block ready to type into,
    // matching the old single-block UI's default state.
    blocks: entry && entry.blocks.length > 0
      ? entry.blocks.map((b) => ({ ...b }))
      : [emptyBlock()],
    note: entry?.note ?? '',
  };
}

/** A block nobody has touched yet ('', '', 0) doesn't count as real input. */
function isBlankBlock(block: TimeBlockDraft): boolean {
  return block.arrival === '' && block.leave === '' && block.breakMinutes === 0;
}

function noteOf(draft: Pick<DayDraft, 'note'>): string | null {
  const trimmed = draft.note.trim();
  return trimmed === '' ? null : trimmed;
}

export function draftToInput(draft: DayDraft): TimeEntryInput {
  if (draft.dayType !== 'normal') {
    return { dayType: draft.dayType, blocks: [], note: noteOf(draft) };
  }
  return {
    dayType: 'normal',
    blocks: draft.blocks.filter((b) => !isBlankBlock(b)).map((b) => ({ ...b })),
    note: noteOf(draft),
  };
}

/**
 * What the draft would persist, ignoring updatedAt. Adding an empty block
 * changes the UI but not the data, so this stays identical and no save fires.
 */
function inputSignatureOf(input: TimeEntryInput): string {
  const blocks = input.blocks.map((b) => `${b.arrival}-${b.leave}-${b.breakMinutes}`).join(',');
  return `${input.dayType}|${blocks}|${input.note ?? ''}`;
}

/** The same signature for what the server already holds. */
function persistedSignatureOf(entry: TimeEntry | null): string {
  if (!entry) return 'none|';
  return inputSignatureOf({ dayType: entry.dayType, blocks: entry.blocks, note: entry.note });
}

/**
 * A blank block is UI state — a row the user opened and hasn't filled in yet.
 * Server data must never erase it, or "add block" appears to undo itself a
 * moment later.
 */
function withPendingBlanks(next: DayDraft, prev: DayDraft): DayDraft {
  if (next.dayType !== 'normal' || prev.dayType !== 'normal') return next;
  const pending = prev.blocks.filter(isBlankBlock).length;
  if (pending === 0) return next;
  const filled = next.blocks.filter((b) => !isBlankBlock(b));
  return { ...next, blocks: [...filled, ...Array.from({ length: pending }, emptyBlock)] };
}

/** Content identity of an entry, so a refetch returning the same row is a no-op. */
function signatureOf(entry: TimeEntry | null): string {
  if (!entry) return 'none';
  const blocks = entry.blocks.map((b) => `${b.arrival}-${b.leave}-${b.breakMinutes}`).join(',');
  return `${entry.dayType}|${blocks}|${entry.note ?? ''}|${entry.updatedAt}`;
}

function isEmptyDraft(draft: DayDraft): boolean {
  return draft.dayType === 'normal' && draft.blocks.every(isBlankBlock);
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

  // Remembers blocks across a switch to Vacation and back, so toggling day
  // type by accident does not throw away what was typed.
  const stashedBlocks = useRef<TimeBlockDraft[]>(draft.blocks);
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
    if (dirty) return;
    setDraft((prev) => withPendingBlanks(draftFrom(entry), prev));
  }, [entry, dirty]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const input = draftToInput(draft);
  const issues = isEmptyDraft(draft) ? [] : validateEntryInput(input);
  // Nothing to persist means nothing to save. Without this, opening an empty
  // block triggers a write that bumps updatedAt, and the refetch that follows
  // resyncs the row and throws the empty block away.
  const hasUnsavedChanges = inputSignatureOf(input) !== persistedSignatureOf(entry);
  const canSave = issues.length === 0 && !isEmptyDraft(draft) && hasUnsavedChanges;

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
        if (prev.dayType === 'normal') stashedBlocks.current = prev.blocks;
        return patch.dayType === 'normal'
          ? { ...next, blocks: stashedBlocks.current }
          : { ...next, blocks: [] };
      }
      return next;
    });
  }, []);

  const updateBlock = useCallback((index: number, patch: Partial<TimeBlockDraft>) => {
    update({ blocks: draft.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  }, [draft.blocks, update]);

  const addBlock = useCallback(() => {
    update({ blocks: [...draft.blocks, emptyBlock()] });
  }, [draft.blocks, update]);

  const removeBlock = useCallback((index: number) => {
    update({ blocks: draft.blocks.filter((_, i) => i !== index) });
  }, [draft.blocks, update]);

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
    updateBlock,
    addBlock,
    removeBlock,
    flush,
    status,
    issues: allIssues,
    issueFor: (path: string) => allIssues.find((i) => i.path === path),
    isEmpty: isEmptyDraft(draft),
  };
}
