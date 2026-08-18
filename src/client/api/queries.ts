import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthUser, GroupBy, IsoDate, RangeSummary, Settings, SettingsInput, TimeEntry, TimeEntryInput,
} from '@shared/types.ts';
import { api } from './client.ts';

export const queryKeys = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  summary: (from: IsoDate, to: IsoDate, groupBy: GroupBy, today: IsoDate) =>
    ['summary', from, to, groupBy, today] as const,
};

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<AuthUser>('/auth/me'),
    retry: false,
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => api.post<AuthUser>('/auth/register', input),
    onSuccess: (user) => qc.setQueryData(queryKeys.me, user),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => api.post<AuthUser>('/auth/login', input),
    onSuccess: (user) => qc.setQueryData(queryKeys.me, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout', {}),
    // Wipe every cached query, not just `me` — otherwise a second account
    // logging in on the same tab would briefly see the first account's data.
    onSuccess: () => qc.clear(),
  });
}

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
