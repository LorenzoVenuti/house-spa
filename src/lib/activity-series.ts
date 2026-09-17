import { isoDay } from './demo-data';
import type { AppSnapshot } from './types';

export interface MonthlyActivitySeries {
  memberId: string;
  displayName: string;
  color: string;
  values: number[];
}

export interface MonthlyActivityChartData {
  month: string;
  days: number[];
  max: number;
  series: MonthlyActivitySeries[];
}

export const currentHouseholdMonth = (instant = new Date()) => isoDay(0, instant).slice(0, 7);

export const buildMonthlyActivitySeries = (snapshot: AppSnapshot, month: string): MonthlyActivityChartData => {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('INVALID_MONTH');
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  if (!daysInMonth || monthNumber < 1 || monthNumber > 12) throw new Error('INVALID_MONTH');
  const validCompletions = snapshot.completions.filter((completion) => (
    completion.status === 'valid' && isoDay(0, new Date(completion.completedAt)).startsWith(month)
  ));
  const participantIdsWithActivity = new Set(validCompletions.flatMap((completion) => completion.countedMemberIds));
  const participants = snapshot.members.filter((member) => member.role === 'participant' && (member.active || participantIdsWithActivity.has(member.id)));
  const series = participants.map((member) => {
    const dailyCounts = Array.from({ length: daysInMonth }, () => 0);
    validCompletions
      .filter((completion) => completion.countedMemberIds.includes(member.id))
      .forEach((completion) => {
        const day = Number(isoDay(0, new Date(completion.completedAt)).slice(8, 10));
        dailyCounts[day - 1] += 1;
      });
    let cumulative = 0;
    return {
      memberId: member.id,
      displayName: member.displayName,
      color: member.color,
      values: dailyCounts.map((count) => (cumulative += count)),
    };
  });
  return {
    month,
    days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    max: Math.max(1, ...series.flatMap((item) => item.values)),
    series,
  };
};
