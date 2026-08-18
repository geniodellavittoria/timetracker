import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GroupBy, IsoDate, RangeSummary, Settings, SettingsInput, TimeEntry, TimeEntryInput,
} from '@shared/types.ts';
import { api } from './client.ts';

export const queryKeys = {
  settings: ['settings'] as const,
  summary: (from: IsoDate, to: IsoDate, groupBy: GroupBy, today: IsoDate) =>
    ['summary', from, to, groupBy, today] as const,
};

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => api.get<Settings>('/settings') });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => api.put<Settings>('/settings', input),
    onSuccess: (settings) => {
      qc.setQueryData(queryKeys.settings, settings);
      // Targets moved, so every balance ever computed is now stale.
      void qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

export interface SummaryArgs {
  from: IsoDate;
  to: IsoDate;
  groupBy: GroupBy;
  today: IsoDate;
}

export function useSummary({ from, to, groupBy, today }: SummaryArgs) {
  return useQuery({
    queryKey: queryKeys.summary(from, to, groupBy, today),
    queryFn: () =>
      api.get<RangeSummary>(
        `/summary?from=${from}&to=${to}&groupBy=${groupBy}&today=${today}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useUpsertEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, input }: { date: IsoDate; input: TimeEntryInput }) =>
      api.put<TimeEntry>(`/entries/${date}`, input),
    // One saved day changes the week totals, the month totals and the
    // cumulative header balance — refetching the summary covers all three.
    onSettled: () => qc.invalidateQueries({ queryKey: ['summary'] }),
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: IsoDate) => api.del(`/entries/${date}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['summary'] }),
  });
}
