import { render, screen } from '@testing-library/react';
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

describe('DayRow', () => {
  it('computes worked hours locally as you type', async () => {
    const user = userEvent.setup();
    renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Arrival'), '08:00');
    await user.type(screen.getByLabelText('Leaving time'), '17:15');
    await user.clear(screen.getByLabelText('Break in minutes'));
    await user.type(screen.getByLabelText('Break in minutes'), '45');

    // 17:15 − 08:00 − 45m, computed by the shared module with no network involved.
    expect(screen.getByText('8h 30m')).toBeInTheDocument();
    expect(screen.getByText('+0h 06m')).toBeInTheDocument();
  });

  it('replaces the time inputs when the day becomes vacation', async () => {
    const user = userEvent.setup();
    renderRow(MON, fullTime);

    expect(screen.getByLabelText('Arrival')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Day type'), 'vacation');

    expect(screen.queryByLabelText('Arrival')).not.toBeInTheDocument();
    expect(screen.getByText(/counts as target/)).toBeInTheDocument();
  });

  it('shows an error and refuses to save when breaks exceed the span', async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Arrival'), '09:00');
    await user.type(screen.getByLabelText('Leaving time'), '17:00');
    await user.clear(screen.getByLabelText('Break in minutes'));
    await user.type(screen.getByLabelText('Break in minutes'), '600');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(/breaks are longer/i);
    // A valid intermediate state may autosave; the invalid one never may.
    expect(savedPayloads(onSave)).not.toContainEqual(
      expect.objectContaining({ breakMinutes: 600 }),
    );
  });

  it('rejects an overnight shift with a message naming the limitation', async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow(MON, fullTime);

    await user.type(screen.getByLabelText('Arrival'), '22:00');
    await user.type(screen.getByLabelText('Leaving time'), '06:00');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(/overnight/i);
    expect(savedPayloads(onSave)).not.toContainEqual(
      expect.objectContaining({ leave: '06:00' }),
    );
  });

  it('collapses a mid-week day off but still lets you log hours on it', async () => {
    const user = userEvent.setup();
    renderRow(FRI, partTime);

    expect(screen.getByText('Day off')).toBeInTheDocument();
    expect(screen.queryByLabelText('Arrival')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /log hours anyway/i }));
    expect(screen.getByLabelText('Arrival')).toBeInTheDocument();
  });

  it('books hours on a day off as pure overtime', async () => {
    const user = userEvent.setup();
    renderRow(FRI, partTime);

    await user.click(screen.getByRole('button', { name: /log hours anyway/i }));
    await user.type(screen.getByLabelText('Arrival'), '09:00');
    await user.type(screen.getByLabelText('Leaving time'), '13:00');

    expect(screen.getByText('4h 00m')).toBeInTheDocument();
    expect(screen.getByText('+4h 00m')).toBeInTheDocument();
  });
});
