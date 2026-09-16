import type { AppSnapshot, Member, MealPlan } from './types';

export const householdTimeZone = 'Europe/Rome';

const householdDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: householdTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const householdDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: householdTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const dateTimeParts = (instant: Date) => Object.fromEntries(
  householdDateTimeFormatter.formatToParts(instant).map(({ type, value }) => [type, value]),
);

export const isoDay = (offset: number, instant = new Date()) => {
  const parts = Object.fromEntries(householdDateFormatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset));
  return date.toISOString().slice(0, 10);
};

export const isHouseholdWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

export const formatHouseholdDateTimeLocal = (instant: Date) => {
  const parts = dateTimeParts(instant);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

export const householdDateTimeToIso = (localDateTime: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localDateTime);
  if (!match) throw new Error('INVALID_LOCAL_TIME');
  const [, year, month, day, hour, minute, second = '00'] = match;
  const wallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const probe = new Date(wallTime + delta * 60 * 60_000);
    const parts = dateTimeParts(probe);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    offsets.add(representedAsUtc - probe.getTime());
  }
  const expected = `${year}-${month}-${day}T${hour}:${minute}`;
  const candidates = [...offsets]
    .map((offset) => new Date(wallTime - offset))
    .filter((candidate) => formatHouseholdDateTimeLocal(candidate) === expected)
    .sort((left, right) => left.getTime() - right.getTime());
  if (!candidates.length) throw new Error('INVALID_LOCAL_TIME');
  return candidates[0].toISOString();
};

const seedMembers: Member[] = [
  { id: 'child-1', displayName: 'Child 1', role: 'participant', color: '#D9924A', home: true, active: true },
  { id: 'child-2', displayName: 'Child 2', role: 'participant', color: '#4E8D9A', home: true, active: true },
  { id: 'child-3', displayName: 'Child 3', role: 'participant', color: '#9A6CD0', home: false, active: true },
  { id: 'parent-1', displayName: 'Mamma', role: 'parent', color: '#D86B72', home: true, active: true },
  { id: 'parent-2', displayName: 'Papà', role: 'parent', color: '#5982C0', home: true, active: true },
  { id: 'referee-1', displayName: 'Cleaning Lady', role: 'referee', color: '#6D9E75', home: true, active: true },
];

const mealPlans = (instant: Date): MealPlan[] => {
  const weekendOffsets = Array.from({ length: 7 }, (_, offset) => offset).filter((offset) => isHouseholdWeekend(isoDay(offset, instant)));
  return [...seedMembers.flatMap((member) => Array.from({ length: 7 }, (_, offset) => {
    const date = isoDay(offset, instant);
    const status = offset === 0 ? (member.id === 'child-3' || member.id === 'referee-1' ? 'unknown' : 'present') : offset === 1 && member.id === 'child-3' ? 'absent' : 'unknown';
    return { id: `meal-${date}-${member.id}-dinner`, memberId: member.id, date, type: 'dinner' as const, status: status as 'present' | 'absent' | 'unknown' };
  })), ...seedMembers.flatMap((member) => weekendOffsets.map((offset) => {
    const date = isoDay(offset, instant);
    return { id: `meal-${date}-${member.id}-lunch`, memberId: member.id, date, type: 'lunch' as const, status: 'unknown' as const };
  }))] as MealPlan[];
};

export const seedSnapshot = (instant = new Date()): AppSnapshot => ({
  members: seedMembers,
  meals: mealPlans(instant),
  presence: [
    { id: 'presence-1', memberId: 'child-1', action: 'arrive', at: instant.toISOString() },
    { id: 'presence-2', memberId: 'child-2', action: 'arrive', at: new Date(instant.getTime() - 45 * 60_000).toISOString() },
  ],
  tasks: [
    { id: 'task-dishes-today', activityCode: 'dishes', title: 'Piatti della cena', date: isoDay(0, instant), dueAt: householdDateTimeToIso(`${isoDay(0, instant)}T23:00`), status: 'assigned', assigneeId: 'child-2', rewardMilli: 3 },
    { id: 'task-rubbish', activityCode: 'rubbish', title: 'Portare fuori la spazzatura', date: isoDay(0, instant), dueAt: householdDateTimeToIso(`${isoDay(0, instant)}T22:00`), status: 'open', rewardMilli: 1 },
    { id: 'task-parcel', activityCode: 'parcel', title: 'Ritirare il pacco Amazon', date: isoDay(0, instant), dueAt: householdDateTimeToIso(`${isoDay(0, instant)}T19:30`), status: 'completed', assigneeId: 'child-2', rewardMilli: 2 },
  ],
  wallet: [
    { id: 'wallet-1', memberId: 'child-1', kind: 'activity_reward', amount: 3, label: 'Piatti — ieri', at: new Date(instant.getTime() - 86_400_000).toISOString() },
    { id: 'wallet-2', memberId: 'child-1', kind: 'activity_reward', amount: 2, label: 'Pacco Amazon', at: new Date(instant.getTime() - 172_800_000).toISOString() },
    { id: 'wallet-demo-funding', memberId: 'child-1', kind: 'correction', amount: 15, label: 'Dotazione demo', at: new Date(instant.getTime() - 259_200_000).toISOString() },
    { id: 'wallet-3', memberId: 'child-2', kind: 'activity_reward', amount: 2, label: 'Pacco Amazon', at: new Date(instant.getTime() - 86_400_000).toISOString() },
    { id: 'wallet-4', memberId: 'child-3', kind: 'correction', amount: -2, label: 'Rettifica genitoriale', at: new Date(instant.getTime() - 259_200_000).toISOString() },
  ],
  takeovers: [
    { id: 'takeover-1', taskId: 'task-dishes-today', payerId: 'child-1', recipientId: 'child-2', costMilli: 9, status: 'pending' },
  ],
  deals: [
    { id: 'deal-1', buyerId: 'child-3', providerId: 'child-2', description: 'Passaggio in stazione', priceMilli: 3, dueAt: new Date(instant.getTime() + 86_400_000).toISOString(), status: 'accepted' },
  ],
});
