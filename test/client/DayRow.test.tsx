import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DayRow } from '@client/components/DayRow.tsx';
import { summarizeDay } from '@shared/calc.ts';
import type { ByWeekday, Settings, TimeEntry } from '@shared/types.ts';

const MON = '2026-08-17';
const FRI = '2026-08-21';

function settings(targets: ByWeekday<number>): Settings {
  return {
    targetMinutesByWeekday: targets,
    fullTimeWeeklyMinutes: 2520,
    workloadPercentX10: 1000,
    updatedAt: '2026-08-01T00:00:00Z',
  };
}

const fullTime = settings([504, 504, 504, 504, 504, 0, 0]);
const partTime = settings([504, 504, 504, 504, 0, 0, 0]);

function renderRow(date: string, s: Settings, entry: TimeEntry | null = null) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(
    <DayRow
      day={summarizeDay(date, entry, s, '2026-08-23')}
      settings={s}
      isToday={false}
      onSave={onSave}
      onDelete={onDelete}
    />,
  );
  return { onSave, onDelete };
}

/** Every payload that actually reached the save callback. */
function savedPayloads(onSave: ReturnType<typeof vi.fn>) {
  return onSave.mock.calls.map(([input]) => input);
}

/**
 * Mirrors what the real app does after a save: the mutation invalidates the
 * summary, the refetch lands, and the row re-renders with a NEW entry object
 * carrying a bumped `updatedAt`. Rendering a static entry hides every bug in
 * that resync path, which is exactly where they live.
 */
function renderLiveRow(date: string, s: Settings, initial: TimeEntry | null) {
  const onSave = vi.fn();

  function Harness() {
    const [entry, setEntry] = useState<TimeEntry | null>(initial);
    const handleSave = async (input: any) => {
      onSave(input);
      setEntry({
        date,
        updatedAt: new Date(Date.now() + 1000).toISOString(),
        ...input,
      } as TimeEntry);
    };
    return (
      <DayRow
        day={summarizeDay(date, entry, s, '2026-08-23')}
        settings={s}
        isToday={false}
        onSave={handleSave}
        onDelete={async () => {}}
      />
    );
  }

  render(<Harness />);
  return { onSave };
}

describe('DayRow', () => {
  it('computes worked hours locally as you type', async () => {
    const user = userEvent.setup();
    renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Kommen'), '08:00');
    await user.type(screen.getByLabelText('Gehen'), '17:15');
    await user.clear(screen.getByLabelText('Pause in Minuten'));
    await user.type(screen.getByLabelText('Pause in Minuten'), '45');

    // 17:15 − 08:00 − 45m, computed by the shared module with no network involved.
    expect(screen.getByText('8 Std 30 Min')).toBeInTheDocument();
    expect(screen.getByText('+0 Std 06 Min')).toBeInTheDocument();
  });

  it('replaces the time inputs when the day becomes vacation', async () => {
    const user = userEvent.setup();
    renderRow(MON, fullTime);

    expect(screen.getByLabelText('Kommen')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tagestyp'), 'vacation');

    expect(screen.queryByLabelText('Kommen')).not.toBeInTheDocument();
    expect(screen.getByText(/zählt als Ziel/)).toBeInTheDocument();
  });

  it('shows an error and refuses to save when breaks exceed the span', async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Kommen'), '09:00');
    await user.type(screen.getByLabelText('Gehen'), '17:00');
    await user.clear(screen.getByLabelText('Pause in Minuten'));
    await user.type(screen.getByLabelText('Pause in Minuten'), '600');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(/pause ist länger/i);
    // A valid intermediate state may autosave; the invalid one never may.
    expect(savedPayloads(onSave)).not.toContainEqual(
      expect.objectContaining({ blocks: [expect.objectContaining({ breakMinutes: 600 })] }),
    );
  });

  it('rejects an overnight shift with a message naming the limitation', async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Kommen'), '22:00');
    await user.type(screen.getByLabelText('Gehen'), '06:00');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(/nachtschicht/i);
    expect(savedPayloads(onSave)).not.toContainEqual(
      expect.objectContaining({ blocks: [expect.objectContaining({ leave: '06:00' })] }),
    );
  });

  it('collapses a mid-week day off but still lets you log hours on it', async () => {
    const user = userEvent.setup();
    renderRow(FRI, partTime);

    expect(screen.getByText('Frei')).toBeInTheDocument();
    expect(screen.queryByLabelText('Kommen')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /trotzdem stunden erfassen/i }));
    expect(screen.getByLabelText('Kommen')).toBeInTheDocument();
  });

  it('books hours on a day off as pure overtime', async () => {
    const user = userEvent.setup();
    renderRow(FRI, partTime);

    await user.click(screen.getByRole('button', { name: /trotzdem stunden erfassen/i }));
    await user.type(screen.getByLabelText('Kommen'), '09:00');
    await user.type(screen.getByLabelText('Gehen'), '13:00');

    expect(screen.getByText('4 Std 00 Min')).toBeInTheDocument();
    expect(screen.getByText('+4 Std 00 Min')).toBeInTheDocument();
  });

  it('sums a second time block (e.g. an evening of home office) into the worked total', async () => {
    const user = userEvent.setup();
    renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Kommen'), '08:00');
    await user.type(screen.getByLabelText('Gehen'), '12:00');

    await user.click(screen.getByRole('button', { name: /weiterer zeitblock/i }));
    await user.type(screen.getByLabelText('Kommen (Block 2)'), '20:00');
    await user.type(screen.getByLabelText('Gehen (Block 2)'), '21:00');

    // 4h + 1h = 5h, computed locally with no network involved.
    expect(screen.getByText('5 Std 00 Min')).toBeInTheDocument();
  });

  it('rejects overlapping blocks on the same day', async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Kommen'), '08:00');
    await user.type(screen.getByLabelText('Gehen'), '17:00');
    await user.click(screen.getByRole('button', { name: /weiterer zeitblock/i }));
    await user.type(screen.getByLabelText('Kommen (Block 2)'), '16:00');
    await user.type(screen.getByLabelText('Gehen (Block 2)'), '18:00');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(/nicht überschneiden/i);
    // The first block alone is a valid intermediate state and may autosave;
    // the overlapping two-block state never may.
    expect(savedPayloads(onSave)).not.toContainEqual(
      expect.objectContaining({
        blocks: expect.arrayContaining([expect.objectContaining({ arrival: '16:00' })]),
      }),
    );
  });

  it('removes a block via its own ✕, keeping the other block and its total', async () => {
    const user = userEvent.setup();
    renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Kommen'), '08:00');
    await user.type(screen.getByLabelText('Gehen'), '12:00');
    await user.click(screen.getByRole('button', { name: /weiterer zeitblock/i }));
    await user.type(screen.getByLabelText('Kommen (Block 2)'), '20:00');
    await user.type(screen.getByLabelText('Gehen (Block 2)'), '21:00');
    expect(screen.getByText('5 Std 00 Min')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /zeitblock 1 entfernen/i }));

    expect(screen.queryByLabelText('Kommen (Block 2)')).not.toBeInTheDocument();
    expect(screen.getByText('1 Std 00 Min')).toBeInTheDocument();
  });

  it('keeps a newly added time block instead of collapsing it after the autosave', async () => {
    const user = userEvent.setup();
    // A day that is already saved with one block — the situation where the
    // autosave/refetch cycle actually runs.
    const saved: TimeEntry = {
      date: MON,
      dayType: 'normal',
      blocks: [{ arrival: '08:00', leave: '12:00', breakMinutes: 0 }],
      note: null,
      updatedAt: '2026-08-17T10:00:00Z',
    };
    renderLiveRow(MON, fullTime, saved);

    await user.click(screen.getByRole('button', { name: /Weiterer Zeitblock/i }));
    expect(screen.getByLabelText('Kommen (Block 2)')).toBeInTheDocument();

    // Past the 600ms autosave debounce and the refetch that follows it.
    await new Promise((r) => setTimeout(r, 1200));

    await waitFor(() => {
      expect(screen.getByLabelText('Kommen (Block 2)')).toBeInTheDocument();
    });
  });

  it('does not fire a save when adding an empty block changes nothing', async () => {
    const user = userEvent.setup();
    const saved: TimeEntry = {
      date: MON,
      dayType: 'normal',
      blocks: [{ arrival: '08:00', leave: '12:00', breakMinutes: 0 }],
      note: null,
      updatedAt: '2026-08-17T10:00:00Z',
    };
    const { onSave } = renderLiveRow(MON, fullTime, saved);

    await user.click(screen.getByRole('button', { name: /Weiterer Zeitblock/i }));
    await new Promise((r) => setTimeout(r, 1200));

    // An empty block carries no data, so there is nothing to persist.
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps an open empty block even when a real save and refetch happen', async () => {
    const user = userEvent.setup();
    const saved: TimeEntry = {
      date: MON,
      dayType: 'normal',
      blocks: [{ arrival: '08:00', leave: '12:00', breakMinutes: 0 }],
      note: null,
      updatedAt: '2026-08-17T10:00:00Z',
    };
    const { onSave } = renderLiveRow(MON, fullTime, saved);

    // Open a second block, then edit the FIRST one — that is a genuine change,
    // so a save really does fire and the row really does resync.
    await user.click(screen.getByRole('button', { name: /Weiterer Zeitblock/i }));
    await user.clear(screen.getByLabelText('Pause in Minuten (Block 1)'));
    await user.type(screen.getByLabelText('Pause in Minuten (Block 1)'), '30');
    await new Promise((r) => setTimeout(r, 1400));

    expect(onSave).toHaveBeenCalled();
    // The edit persisted...
    expect(savedPayloads(onSave).at(-1).blocks).toEqual([
      { arrival: '08:00', leave: '12:00', breakMinutes: 30 },
    ]);
    // ...and the empty block the user opened is still on screen.
    await waitFor(() => {
      expect(screen.getByLabelText('Kommen (Block 2)')).toBeInTheDocument();
    });
  });
});
