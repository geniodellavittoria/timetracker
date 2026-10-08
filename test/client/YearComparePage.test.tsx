import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YearComparePage } from '@client/pages/YearComparePage.tsx';
import { buildYearComparison } from '@shared/calc.ts';
import type { Settings, TimeEntry } from '@shared/types.ts';

const fullTime: Settings = [{
  id: 1,
  effectiveFrom: '2000-01-01',
  targetMinutesByWeekday: [504, 504, 504, 504, 504, 0, 0],
  fullTimeWeeklyMinutes: 2520,
  workloadPercentX100: 10000,
  updatedAt: '2026-08-01T00:00:00Z',
}];

const day = (date: string, leave = '17:00'): TimeEntry => ({
  date,
  dayType: 'normal',
  blocks: [{ arrival: '08:00', leave, breakMinutes: 0 }],
  note: null,
  updatedAt: '2026-08-18T10:00:00Z',
});

function renderPage(entries: TimeEntry[]) {
  const body = buildYearComparison({ entries, settings: fullTime, today: '2026-10-08' });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><YearComparePage /></QueryClientProvider>);
}

afterEach(() => vi.restoreAllMocks());

describe('YearComparePage', () => {
  it('shows a legend toggle per year and toggles a year off', async () => {
    renderPage([day('2025-08-18'), day('2026-08-17')]);

    const y2025 = await screen.findByRole('button', { name: '2025' });
    const y2026 = screen.getByRole('button', { name: '2026' });
    expect(y2025).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelectorAll('.year-lines-path')).toHaveLength(2);

    await userEvent.click(y2025);
    expect(y2025).toHaveAttribute('aria-pressed', 'false');
    expect(y2026).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelectorAll('.year-lines-path')).toHaveLength(1);
  });

  it('lists yearly totals, newest first', async () => {
    renderPage([day('2025-08-18'), day('2026-08-17', '12:00'), day('2026-08-18', '12:00')]);

    const rows = within(await screen.findByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['2026', '2025']);
    expect(rows[0]).toHaveTextContent('8 Std 00 Min');
    expect(rows[1]).toHaveTextContent('9 Std 00 Min');
  });

  it('shows every year\'s value for the week chosen with the keyboard', async () => {
    renderPage([day('2025-08-18'), day('2026-08-17', '12:00')]);

    const plot = await screen.findByRole('img');
    plot.focus();
    // From KW 1, 33 steps right lands on KW 34.
    for (let i = 0; i < 33; i++) await userEvent.keyboard('{ArrowRight}');

    const tooltip = screen.getByRole('status');
    expect(tooltip).toHaveTextContent('KW 34');
    expect(tooltip).toHaveTextContent('2026');
    expect(tooltip).toHaveTextContent('4 Std 00 Min');
    expect(tooltip).toHaveTextContent('9 Std 00 Min');
  });

  it('says so when nothing has been recorded yet', async () => {
    renderPage([]);
    expect(await screen.findByText('Noch keine Einträge erfasst.')).toBeInTheDocument();
  });
});
