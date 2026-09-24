import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthUser, DayType, GroupBy, IsoDate, RangeSummary, Settings, SettingsPeriod, SettingsPeriodInput, TimeEntry,
  TimeEntryInput, VacationAllowance, VacationAllowanceInput, VacationSummary,
} from '@shared/types.ts';
import { api } from './client.ts';

export const queryKeys = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  summary: (from: IsoDate, to: IsoDate, groupBy: GroupBy, today: IsoDate) =>
    ['summary', from, to, groupBy, today] as const,
  entriesRange: (from: IsoDate, to: IsoDate) => ['entries', from, to] as const,
  vacationSummary: (year: number, today: IsoDate) => ['vacation', 'summary', year, today] as const,
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
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => (await api.get<{ periods: Settings }>('/settings')).periods,
  });
}

/** Shared by create/update/delete: a Pensum change makes every balance ever computed stale. */
function invalidateSettings(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.settings });
  void qc.invalidateQueries({ queryKey: ['summary'] });
  // Ferien days only count on days with a target, which the Pensum decides.
  void qc.invalidateQueries({ queryKey: ['vacation'] });
}

export function useCreateSettingsPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsPeriodInput) => api.post<SettingsPeriod>('/settings/periods', input),
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useUpdateSettingsPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SettingsPeriodInput }) =>
      api.put<SettingsPeriod>(`/settings/periods/${id}`, input),
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useDeleteSettingsPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/settings/periods/${id}`),
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useVacationSummary({ year, today }: { year: number; today: IsoDate }) {
  return useQuery({
    queryKey: queryKeys.vacationSummary(year, today),
    queryFn: () => api.get<VacationSummary>(`/vacation/summary?year=${year}&today=${today}`),
    placeholderData: (previous) => previous,
  });
}

export function useUpsertVacationAllowance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, input }: { year: number; input: VacationAllowanceInput }) =>
      api.put<VacationAllowance>(`/vacation/allowances/${year}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacation'] }),
  });
}

export function useDeleteVacationAllowance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => api.del(`/vacation/allowances/${year}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacation'] }),
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
    // Marking a day as Ferien also changes the Ferien counts.
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['summary'] }),
      qc.invalidateQueries({ queryKey: ['vacation'] }),
    ]),
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: IsoDate) => api.del(`/entries/${date}`),
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['summary'] }),
      qc.invalidateQueries({ queryKey: ['vacation'] }),
    ]),
  });
}

/** Raw entries in a date range — unlike `useSummary`, no targets/balances computed, just what's on record. */
export function useEntriesInRange({ from, to }: { from: IsoDate; to: IsoDate }) {
  return useQuery({
    queryKey: queryKeys.entriesRange(from, to),
    queryFn: async () => (await api.get<{ entries: TimeEntry[] }>(`/entries?from=${from}&to=${to}`)).entries,
  });
}

/** After a bulk write: raw entries, every summary and the Ferien counts are all stale. */
function invalidateEntries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['entries'] });
  void qc.invalidateQueries({ queryKey: ['summary'] });
  void qc.invalidateQueries({ queryKey: ['vacation'] });
}

/**
 * Writes many special days at once (a holiday template, a Ferien range): one
 * PUT per date, run in parallel since it's at most a few dozen dates. Callers
 * decide which dates to write — anything given here is overwritten.
 */
export function useApplySpecialDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: { date: IsoDate; dayType: Exclude<DayType, 'normal'>; note: string | null }[]) => Promise.all(
      days.map(({ date, dayType, note }) =>
        api.put<TimeEntry>(`/entries/${date}`, { dayType, blocks: [], note } satisfies TimeEntryInput)),
    ),
    onSuccess: () => invalidateEntries(qc),
  });
}

/** Deletes whole days in parallel, e.g. removing a Ferien range. */
export function useDeleteEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dates: IsoDate[]) => Promise.all(dates.map((date) => api.del(`/entries/${date}`))),
    onSuccess: () => invalidateEntries(qc),
  });
}
