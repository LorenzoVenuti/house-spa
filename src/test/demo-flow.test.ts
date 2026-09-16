import { describe, expect, it, vi } from 'vitest';
import {
  defaultMemberId,
  demoSnapshotStorageKey,
  DemoAdapter,
  formatTime,
  legacyDemoSnapshotStorageKey,
  legacyMemberSelectionStorageKey,
  memberSelectionStorageKey,
  readInitialMemberId,
} from '../lib/adapter';
import { formatHouseholdDateTimeLocal, householdDateTimeToIso, isoDay, seedSnapshot } from '../lib/demo-data';
import type { AppSnapshot } from '../lib/types';

const createMemoryStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  };
};

const createRoleOrderedLegacySnapshot = () => {
  const snapshot = structuredClone(seedSnapshot());
  const legacyIds = snapshot.members.map((_, index) => `legacy-member-${index + 1}`);
  const memberIdMap = new Map(snapshot.members.map((member, index) => [member.id, legacyIds[index]]));
  const remap = (memberId: string) => memberIdMap.get(memberId) ?? memberId;
  snapshot.members.forEach((member, index) => {
    member.id = legacyIds[index];
    member.displayName = `Legacy Profile ${index + 1}`;
  });
  delete (snapshot.members[0] as Partial<(typeof snapshot.members)[number]>).active;
  snapshot.meals.forEach((meal, index) => {
    meal.memberId = remap(meal.memberId);
    meal.id = `legacy-meal-${index + 1}`;
  });
  snapshot.presence.forEach((event) => { event.memberId = remap(event.memberId); });
  snapshot.tasks.forEach((task) => { if (task.assigneeId) task.assigneeId = remap(task.assigneeId); });
  snapshot.wallet.forEach((entry) => { entry.memberId = remap(entry.memberId); });
  snapshot.takeovers.forEach((takeover) => {
    takeover.payerId = remap(takeover.payerId);
    takeover.recipientId = remap(takeover.recipientId);
  });
  snapshot.deals.forEach((deal) => {
    deal.buyerId = remap(deal.buyerId);
    deal.providerId = remap(deal.providerId);
  });
  snapshot.members.push({ id: 'managed-profile-1', displayName: 'Guest Profile', role: 'participant', color: '#547C68', home: false, active: false });
  snapshot.wallet.push({ id: 'managed-wallet', memberId: 'managed-profile-1', kind: 'correction', amount: 7, label: 'Managed history', at: new Date().toISOString() });
  return snapshot as AppSnapshot;
};

describe('demo adapter local flows', () => {
  it('seeds every member for seven dinners and weekend lunches', () => {
    const snapshot = seedSnapshot();
    expect(snapshot.members.map((member) => member.displayName)).toEqual(['Child 1', 'Child 2', 'Child 3', 'Mamma', 'Papà', 'Cleaning Lady']);
    expect(snapshot.members.every((member) => member.active)).toBe(true);
    expect(snapshot.meals.filter((meal) => meal.type === 'dinner')).toHaveLength(42);
    expect(snapshot.meals.filter((meal) => meal.type === 'lunch')).toHaveLength(12);
    expect(snapshot.meals.filter((meal) => meal.type === 'lunch').every((meal) => [0, 6].includes(new Date(`${meal.date}T12:00:00`).getDay()))).toBe(true);
    expect(new Set(snapshot.meals.map((meal) => meal.memberId))).toEqual(new Set(snapshot.members.map((member) => member.id)));
  });

  it('derives calendar dates from Europe/Rome across UTC and daylight-saving boundaries', () => {
    expect(isoDay(0, new Date('2026-01-15T22:59:59Z'))).toBe('2026-01-15');
    expect(isoDay(0, new Date('2026-01-15T23:00:00Z'))).toBe('2026-01-16');
    expect(isoDay(0, new Date('2026-06-15T21:59:59Z'))).toBe('2026-06-15');
    expect(isoDay(0, new Date('2026-06-15T22:00:00Z'))).toBe('2026-06-16');

    const snapshot = seedSnapshot(new Date('2026-03-28T23:30:00Z'));
    const dinnerDates = [...new Set(snapshot.meals.filter((meal) => meal.type === 'dinner').map((meal) => meal.date))];
    expect(dinnerDates).toEqual(['2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04']);
    expect(snapshot.meals.filter((meal) => meal.type === 'lunch').every((meal) => [0, 6].includes(new Date(`${meal.date}T00:00:00Z`).getUTCDay()))).toBe(true);
  });

  it('converts and formats Rome wall times in winter, summer, and DST transitions', () => {
    expect(householdDateTimeToIso('2026-01-15T23:00')).toBe('2026-01-15T22:00:00.000Z');
    expect(householdDateTimeToIso('2026-06-15T23:00')).toBe('2026-06-15T21:00:00.000Z');
    expect(formatTime('2026-01-15T22:00:00.000Z')).toBe('23:00');
    expect(formatTime('2026-06-15T21:00:00.000Z')).toBe('23:00');
    expect(householdDateTimeToIso('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z');
    expect(() => householdDateTimeToIso('2026-03-29T02:30')).toThrow('INVALID_LOCAL_TIME');
    expect(formatHouseholdDateTimeLocal(new Date('2026-06-15T21:00:00.000Z'))).toBe('2026-06-15T23:00');
    expect(seedSnapshot(new Date('2026-01-15T12:00:00.000Z')).tasks.find((task) => task.id === 'task-dishes-today')?.dueAt).toBe('2026-01-15T22:00:00.000Z');
    expect(seedSnapshot(new Date('2026-06-15T12:00:00.000Z')).tasks.find((task) => task.id === 'task-dishes-today')?.dueAt).toBe('2026-06-15T21:00:00.000Z');
  });

  it('completes an open task once and credits its reward', async () => {
    const adapter = new DemoAdapter(seedSnapshot());
    const first = await adapter.complete_task({ taskId: 'task-rubbish', idempotencyKey: 'one', performedByMemberId: 'child-1' });
    const second = await adapter.complete_task({ taskId: 'task-rubbish', idempotencyKey: 'two', performedByMemberId: 'child-1' });
    expect(first.alreadyCompleted).toBe(false);
    expect(second.alreadyCompleted).toBe(true);
    expect(adapter.balance('child-1')).toBe(21);
  });

  it('resolves a takeover and credits only the performer', async () => {
    const seed = seedSnapshot();
    seed.wallet.push({ id: 'wallet-test', memberId: 'child-1', kind: 'correction', amount: 10, label: 'Test funding', at: new Date().toISOString() });
    seed.takeovers = [];
    const task = seed.tasks.find((item) => item.id === 'task-dishes-today');
    if (task) task.assigneeId = 'child-1';
    const adapter = new DemoAdapter(seed);
    adapter.setActiveMember('child-1');
    const created = await adapter.create_takeover({ taskId: 'task-dishes-today', recipientMemberId: 'child-2', idempotencyKey: 'takeover' });
    adapter.setActiveMember('child-2');
    await adapter.complete_task({ taskId: 'task-dishes-today', performedByMemberId: 'child-2', idempotencyKey: 'complete' });
    await adapter.resolve_takeover({ takeoverId: String(created.takeoverId), resolution: 'completed', idempotencyKey: 'resolve' });
    expect(adapter.balance('child-1')).toBe(21);
    expect(adapter.balance('child-2')).toBe(5);
    expect((await adapter.snapshot()).wallet.filter((entry) => entry.memberId === 'child-2' && entry.kind === 'activity_reward')).toHaveLength(2);
  });

  it('does not credit a takeover performer twice when completion precedes resolution', async () => {
    const seed = seedSnapshot();
    seed.wallet.push({ id: 'wallet-test', memberId: 'child-1', kind: 'correction', amount: 10, label: 'Test funding', at: new Date().toISOString() });
    seed.takeovers = [];
    const task = seed.tasks.find((item) => item.id === 'task-dishes-today');
    if (task) task.assigneeId = 'child-1';
    const adapter = new DemoAdapter(seed);
    adapter.setActiveMember('child-1');
    const created = await adapter.create_takeover({ taskId: 'task-dishes-today', recipientMemberId: 'child-2', idempotencyKey: 'takeover' });
    adapter.setActiveMember('child-2');
    await adapter.complete_task({ taskId: 'task-dishes-today', performedByMemberId: 'child-2', idempotencyKey: 'complete' });
    await adapter.resolve_takeover({ takeoverId: String(created.takeoverId), resolution: 'completed', idempotencyKey: 'resolve' });
    const entries = (await adapter.snapshot()).wallet.filter((entry) => entry.memberId === 'child-2' && entry.taskId === 'task-dishes-today' && entry.kind === 'activity_reward');
    expect(entries).toHaveLength(1);
    expect(adapter.balance('child-1')).toBe(21);
  });

  it('requires enough funds before accepting a proposed deal', async () => {
    const adapter = new DemoAdapter(seedSnapshot());
    const created = await adapter.create_deal({ providerMemberId: 'child-2', description: 'Passaggio', priceMilli: 2, dueAt: new Date().toISOString(), idempotencyKey: 'deal' });
    adapter.setActiveMember('child-2');
    await expect(adapter.accept_deal({ dealId: String(created.dealId), idempotencyKey: 'accept' })).resolves.toMatchObject({ status: 'accepted' });
  });

  it('sends a market proposal to the selected participant', async () => {
    const adapter = new DemoAdapter(seedSnapshot());
    adapter.setActiveMember('child-2');
    const created = await adapter.create_deal({ providerMemberId: 'child-1', description: 'Passaggio', priceMilli: 3, dueAt: new Date(Date.now() + 86_400_000).toISOString(), idempotencyKey: 'child-two-deal' });
    const deal = (await adapter.snapshot()).deals.find((item) => item.id === created.dealId);
    expect(deal).toMatchObject({ buyerId: 'child-2', providerId: 'child-1', status: 'proposed' });
  });

  it('removes invalid self-deals created by the previous demo selector bug', async () => {
    const seed = seedSnapshot();
    seed.deals.push({ id: 'invalid-self-deal', buyerId: 'child-2', providerId: 'child-2', description: 'Invalid', priceMilli: 5, dueAt: new Date().toISOString(), status: 'proposed' });
    const adapter = new DemoAdapter(seed);
    expect((await adapter.snapshot()).deals.some((deal) => deal.id === 'invalid-self-deal')).toBe(false);
  });

  it('creates an on-demand task for referee operations', async () => {
    const adapter = new DemoAdapter(seedSnapshot());
    adapter.setActiveMember('referee-1');
    const result = await adapter.create_on_demand_task({ activityCode: 'parcel', title: 'Ritira il pacco', dueAt: new Date().toISOString(), idempotencyKey: 'on-demand' });
    expect(result.status).toBe('open');
    expect((await adapter.snapshot()).tasks.some((task) => task.id === result.taskId && task.activityCode === 'parcel')).toBe(true);
  });

  it('derives an on-demand task date from the Rome calendar day of its instant', async () => {
    const adapter = new DemoAdapter(seedSnapshot());
    adapter.setActiveMember('referee-1');
    const result = await adapter.create_on_demand_task({ activityCode: 'parcel', title: 'Boundary task', dueAt: '2026-01-15T23:30:00.000Z', idempotencyKey: 'boundary-task' });
    expect((await adapter.snapshot()).tasks.find((task) => task.id === result.taskId)).toMatchObject({ date: '2026-01-16', dueAt: '2026-01-15T23:30:00.000Z' });
  });

  it('migrates a role-ordered legacy snapshot to v3 and remaps every member relationship', async () => {
    const { storage, values } = createMemoryStorage();
    const legacy = createRoleOrderedLegacySnapshot();
    const legacyValue = JSON.stringify(legacy);
    values.set(legacyDemoSnapshotStorageKey, legacyValue);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
      const snapshot = await new DemoAdapter().snapshot();
      expect(snapshot.members.map(({ id, displayName, active }) => ({ id, displayName, active }))).toEqual([
        { id: 'child-1', displayName: 'Child 1', active: true },
        { id: 'child-2', displayName: 'Child 2', active: true },
        { id: 'child-3', displayName: 'Child 3', active: true },
        { id: 'parent-1', displayName: 'Mamma', active: true },
        { id: 'parent-2', displayName: 'Papà', active: true },
        { id: 'referee-1', displayName: 'Cleaning Lady', active: true },
        { id: 'managed-profile-1', displayName: 'Guest Profile', active: false },
      ]);
      const fixedIds = new Set(snapshot.members.slice(0, 6).map((member) => member.id));
      expect(snapshot.meals.every((meal) => fixedIds.has(meal.memberId) && meal.id === `meal-${meal.date}-${meal.memberId}-${meal.type}`)).toBe(true);
      expect(snapshot.presence.every((event) => fixedIds.has(event.memberId))).toBe(true);
      expect(snapshot.tasks.every((task) => !task.assigneeId || fixedIds.has(task.assigneeId))).toBe(true);
      expect(snapshot.takeovers.every((takeover) => fixedIds.has(takeover.payerId) && fixedIds.has(takeover.recipientId))).toBe(true);
      expect(snapshot.deals.every((deal) => fixedIds.has(deal.buyerId) && fixedIds.has(deal.providerId))).toBe(true);
      expect(snapshot.wallet.some((entry) => entry.memberId === 'managed-profile-1' && entry.id === 'managed-wallet')).toBe(true);
      expect(JSON.parse(values.get(demoSnapshotStorageKey) ?? '{}')).toEqual(snapshot);
      expect(values.get(legacyDemoSnapshotStorageKey)).toBe(legacyValue);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('migrates the legacy selector to the branded key without retaining its value', () => {
    const { storage, values } = createMemoryStorage();
    values.set(legacyMemberSelectionStorageKey, 'legacy-selected-profile');
    expect(readInitialMemberId(storage)).toBe(defaultMemberId);
    expect(values.get(memberSelectionStorageKey)).toBe(defaultMemberId);
    values.set(memberSelectionStorageKey, 'parent-2');
    expect(readInitialMemberId(storage)).toBe('parent-2');
  });

  it('preserves a valid v3 stored snapshot when its meal plan is empty', async () => {
    const { storage, values } = createMemoryStorage();
    const stored = seedSnapshot();
    stored.meals = [];
    stored.tasks[0].title = 'Persisted task';
    stored.wallet.push({ id: 'persisted-wallet', memberId: 'child-1', kind: 'correction', amount: 7, label: 'Persisted wallet', at: new Date().toISOString() });
    stored.takeovers[0].costMilli = 12;
    stored.deals[0].description = 'Persisted deal';
    values.set(demoSnapshotStorageKey, JSON.stringify(stored));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
      const snapshot = await new DemoAdapter().snapshot();
      expect(snapshot.meals).toEqual([]);
      expect(snapshot.tasks[0].title).toBe('Persisted task');
      expect(snapshot.wallet.some((entry) => entry.id === 'persisted-wallet')).toBe(true);
      expect(snapshot.takeovers[0].costMilli).toBe(12);
      expect(snapshot.deals[0].description).toBe('Persisted deal');
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('allows only parents to create a unique active member and seeds seven days of meals', async () => {
    const adapter = new DemoAdapter(seedSnapshot());
    await expect(adapter.create_member({ displayName: 'Guest Child', role: 'participant' })).rejects.toThrow('FORBIDDEN');
    adapter.setActiveMember('parent-1');
    const result = await adapter.create_member({ displayName: '  Guest Child  ', role: 'participant' });
    const snapshot = await adapter.snapshot();
    const member = snapshot.members.find((item) => item.id === result.memberId);
    const meals = snapshot.meals.filter((meal) => meal.memberId === result.memberId);
    expect(member).toMatchObject({ displayName: 'Guest Child', role: 'participant', home: false, active: true });
    expect(meals.filter((meal) => meal.type === 'dinner')).toHaveLength(7);
    expect(meals.filter((meal) => meal.type === 'lunch')).toHaveLength(2);
    expect(meals.every((meal) => meal.status === 'unknown')).toBe(true);
    expect(meals.filter((meal) => meal.type === 'lunch').every((meal) => [0, 6].includes(new Date(`${meal.date}T12:00:00`).getDay()))).toBe(true);
    await adapter.set_member_active({ memberId: String(result.memberId), active: false });
    await expect(adapter.create_member({ displayName: 'guest child', role: 'referee' })).rejects.toThrow('INVALID_STATE');
  });

  it('creates member meal dates from the Rome day at a UTC-midnight boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T23:30:00Z'));
    try {
      const adapter = new DemoAdapter(structuredClone(seedSnapshot()));
      adapter.setActiveMember('parent-1');
      const result = await adapter.create_member({ displayName: 'Boundary Child', role: 'participant' });
      const meals = (await adapter.snapshot()).meals.filter((meal) => meal.memberId === result.memberId);
      expect([...new Set(meals.filter((meal) => meal.type === 'dinner').map((meal) => meal.date))]).toEqual([
        '2026-01-16', '2026-01-17', '2026-01-18', '2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22',
      ]);
      expect(meals.filter((meal) => meal.type === 'lunch').map((meal) => meal.date)).toEqual(['2026-01-17', '2026-01-18']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('protects parent profiles while supporting deactivation and reactivation', async () => {
    const adapter = new DemoAdapter(seedSnapshot());
    adapter.setActiveMember('child-1');
    await expect(adapter.set_member_active({ memberId: 'child-3', active: false })).rejects.toThrow('FORBIDDEN');
    adapter.setActiveMember('parent-1');
    await expect(adapter.set_member_active({ memberId: 'parent-1', active: false })).rejects.toThrow('INVALID_STATE');
    await adapter.set_member_active({ memberId: 'parent-2', active: false });
    expect((await adapter.snapshot()).members.filter((member) => member.role === 'parent' && member.active)).toHaveLength(1);
    await expect(adapter.set_member_active({ memberId: 'parent-1', active: false })).rejects.toThrow('INVALID_STATE');
    await adapter.set_member_active({ memberId: 'parent-2', active: true });
    expect((await adapter.snapshot()).members.find((member) => member.id === 'parent-2')?.active).toBe(true);
  });

  it('preserves history on deactivation and blocks inactive actors selected from stale state', async () => {
    const adapter = new DemoAdapter(seedSnapshot());
    const before = await adapter.snapshot();
    adapter.setActiveMember('parent-1');
    await adapter.set_member_active({ memberId: 'child-1', active: false });
    const inactive = await adapter.snapshot();
    expect(inactive.wallet.filter((entry) => entry.memberId === 'child-1')).toEqual(before.wallet.filter((entry) => entry.memberId === 'child-1'));
    expect(inactive.takeovers.filter((takeover) => takeover.payerId === 'child-1')).toEqual(before.takeovers.filter((takeover) => takeover.payerId === 'child-1'));
    expect(inactive.meals.filter((meal) => meal.memberId === 'child-1')).toEqual(before.meals.filter((meal) => meal.memberId === 'child-1'));
    adapter.setActiveMember('child-1');
    await expect(adapter.recordPresence('arrive')).rejects.toThrow('FORBIDDEN');
    adapter.setActiveMember('parent-1');
    await adapter.set_member_active({ memberId: 'child-1', active: true });
    expect((await adapter.snapshot()).members.find((member) => member.id === 'child-1')?.active).toBe(true);
  });
});
