import { householdTimeZone, isHouseholdWeekend, isoDay, seedSnapshot } from './demo-data';
import type { ActionSource, AppSnapshot, HouseholdAdapter, MealPlanStatus, Member, PresenceAction, Role, RpcResult, TaskCompletion } from './types';

export const demoSnapshotStorageKey = 'house-spa-demo-v4';
export const memberSelectionStorageKey = 'house-spa-member-v4';
export const defaultMemberId = 'child-1';
// Compatibility inputs are read only when their v4 replacement does not exist.
export const legacyDemoSnapshotStorageKey = 'milli-e-misfatti-demo-v3';
export const legacyMemberSelectionStorageKey = 'milli-e-misfatti-member-v3';
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const memberColors = ['#D9924A', '#4E8D9A', '#9A6CD0', '#D86B72', '#5982C0', '#6D9E75', '#B8795A', '#547C68'];
const fixedProfilesByRole = {
  participant: [
    { id: 'child-1', displayName: 'Child 1' },
    { id: 'child-2', displayName: 'Child 2' },
    { id: 'child-3', displayName: 'Child 3' },
  ],
  parent: [
    { id: 'parent-1', displayName: 'Mamma' },
    { id: 'parent-2', displayName: 'Papà' },
  ],
  referee: [{ id: 'referee-1', displayName: 'Cleaning Lady' }],
} satisfies Record<Role, Array<{ id: string; displayName: string }>>;
const fixedDisplayNames: Record<string, string> = {
  'child-1': 'Child 1',
  'child-2': 'Child 2',
  'child-3': 'Child 3',
  'parent-1': 'Mamma',
  'parent-2': 'Papà',
  'referee-1': 'Cleaning Lady',
};

type MigratableMember = Omit<Member, 'active'> & { active?: boolean };
type MigratableCompletion = Omit<TaskCompletion, 'countedMemberIds'> & { countedMemberIds?: string[] };
type MigratableSnapshot = Omit<AppSnapshot, 'members' | 'completions'> & { members: MigratableMember[]; completions?: MigratableCompletion[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isString = (value: unknown) => typeof value === 'string';
const isOptionalString = (value: unknown) => value === undefined || isString(value);
const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T => isString(value) && allowed.includes(value as T);

const isMigratableSnapshot = (value: unknown): value is MigratableSnapshot => {
  if (!isRecord(value)) return false;
  const arrays = ['members', 'meals', 'presence', 'tasks', 'wallet', 'takeovers', 'deals'] as const;
  if (!arrays.every((field) => Array.isArray(value[field]))) return false;
  const members = value.members as unknown[];
  const meals = value.meals as unknown[];
  const presence = value.presence as unknown[];
  const tasks = value.tasks as unknown[];
  const wallet = value.wallet as unknown[];
  const takeovers = value.takeovers as unknown[];
  const deals = value.deals as unknown[];
  const completions = value.completions === undefined ? [] : value.completions as unknown[];
  return members.every((member) => isRecord(member)
      && isString(member.id) && isString(member.displayName)
      && isOneOf(member.role, ['participant', 'referee', 'parent'])
      && isString(member.color) && typeof member.home === 'boolean'
      && (member.active === undefined || typeof member.active === 'boolean'))
    && meals.every((meal) => isRecord(meal)
      && isString(meal.id) && isString(meal.memberId) && isString(meal.date)
      && isOneOf(meal.type, ['lunch', 'dinner']) && isOneOf(meal.status, ['present', 'absent', 'unknown']))
    && presence.every((event) => isRecord(event)
      && isString(event.id) && isString(event.memberId) && isOneOf(event.action, ['arrive', 'leave']) && isString(event.at))
    && tasks.every((task) => isRecord(task)
      && isString(task.id) && isOneOf(task.activityCode, ['dishes', 'rubbish', 'parcel'])
      && isString(task.title) && isString(task.date) && isString(task.dueAt)
      && isOneOf(task.status, ['planned', 'open', 'assigned', 'completed', 'expired', 'cancelled'])
      && isOptionalString(task.assigneeId) && typeof task.rewardMilli === 'number'
      && (task.onlyParticipant === undefined || typeof task.onlyParticipant === 'boolean'))
    && wallet.every((entry) => isRecord(entry)
      && isString(entry.id) && isString(entry.memberId)
      && isOneOf(entry.kind, ['activity_reward', 'activity_reversal', 'takeover_cost', 'deal_transfer', 'penalty', 'correction'])
      && typeof entry.amount === 'number' && isString(entry.label) && isString(entry.at) && isOptionalString(entry.taskId))
    && completions.every((completion) => isRecord(completion)
      && isString(completion.id) && isString(completion.taskId)
      && isString(completion.performedByMemberId) && isString(completion.recordedByMemberId)
      && (completion.countedMemberIds === undefined || (Array.isArray(completion.countedMemberIds) && completion.countedMemberIds.every(isString)))
      && isString(completion.completedAt) && typeof completion.rewardMilli === 'number'
      && isOneOf(completion.source, ['app', 'nfc', 'staff'])
      && isOneOf(completion.status, ['valid', 'invalidated'])
      && isOptionalString(completion.invalidatedAt) && isOptionalString(completion.invalidatedByMemberId)
      && isOptionalString(completion.invalidationReason))
    && takeovers.every((takeover) => isRecord(takeover)
      && isString(takeover.id) && isString(takeover.taskId) && isString(takeover.payerId) && isString(takeover.recipientId)
      && typeof takeover.costMilli === 'number' && isOneOf(takeover.status, ['pending', 'completed', 'refused', 'expired', 'cancelled']))
    && deals.every((deal) => isRecord(deal)
      && isString(deal.id) && isString(deal.buyerId) && isString(deal.providerId) && isString(deal.description)
      && typeof deal.priceMilli === 'number' && isString(deal.dueAt)
      && isOneOf(deal.status, ['proposed', 'accepted', 'performed', 'settled', 'rejected', 'cancelled', 'expired', 'disputed']));
};

const parseStoredSnapshot = (stored: string | null) => {
  if (!stored) return undefined;
  try {
    const parsed: unknown = JSON.parse(stored);
    return isMigratableSnapshot(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const normalizeSnapshot = (snapshot: MigratableSnapshot) => {
  let changed = false;
  if (!snapshot.completions) {
    snapshot.completions = snapshot.tasks.flatMap((task) => {
      if (task.status !== 'completed' || !task.assigneeId) return [];
      const reward = snapshot.wallet.find((entry) => entry.taskId === task.id && entry.kind === 'activity_reward');
      return [{
        id: `completion-migrated-${task.id}`,
        taskId: task.id,
        performedByMemberId: task.assigneeId,
        recordedByMemberId: task.assigneeId,
        countedMemberIds: [task.assigneeId],
        completedAt: reward?.at ?? task.dueAt,
        rewardMilli: task.rewardMilli,
        source: 'app' as const,
        status: 'valid' as const,
      }];
    });
    changed = true;
  }
  snapshot.completions.forEach((completion) => {
    if (!completion.countedMemberIds?.length) {
      completion.countedMemberIds = [completion.performedByMemberId];
      changed = true;
    }
  });
  snapshot.members.forEach((member) => {
    if (typeof member.active !== 'boolean') {
      member.active = true;
      changed = true;
    }
    const fixedName = fixedDisplayNames[member.id];
    if (fixedName && member.displayName !== fixedName) {
      member.displayName = fixedName;
      changed = true;
    }
  });
  return { snapshot: snapshot as AppSnapshot, changed };
};

const migrateLegacySnapshot = (snapshot: MigratableSnapshot) => {
  const memberIds = new Map<string, string>();
  const roleIndexes: Record<Role, number> = { participant: 0, parent: 0, referee: 0 };
  snapshot.members.forEach((member) => {
    const fixedProfile = fixedProfilesByRole[member.role][roleIndexes[member.role]];
    roleIndexes[member.role] += 1;
    if (!fixedProfile) return;
    memberIds.set(member.id, fixedProfile.id);
    member.id = fixedProfile.id;
    member.displayName = fixedProfile.displayName;
  });
  const remap = (memberId: string) => memberIds.get(memberId) ?? memberId;
  snapshot.meals.forEach((meal) => {
    meal.memberId = remap(meal.memberId);
    meal.id = `meal-${meal.date}-${meal.memberId}-${meal.type}`;
  });
  snapshot.presence.forEach((event) => { event.memberId = remap(event.memberId); });
  snapshot.tasks.forEach((task) => { if (task.assigneeId) task.assigneeId = remap(task.assigneeId); });
  snapshot.wallet.forEach((entry) => { entry.memberId = remap(entry.memberId); });
  snapshot.completions?.forEach((completion) => {
    completion.performedByMemberId = remap(completion.performedByMemberId);
    completion.recordedByMemberId = remap(completion.recordedByMemberId);
    if (completion.countedMemberIds) completion.countedMemberIds = completion.countedMemberIds.map(remap);
    if (completion.invalidatedByMemberId) completion.invalidatedByMemberId = remap(completion.invalidatedByMemberId);
  });
  snapshot.takeovers.forEach((takeover) => {
    takeover.payerId = remap(takeover.payerId);
    takeover.recipientId = remap(takeover.recipientId);
  });
  snapshot.deals.forEach((deal) => {
    deal.buyerId = remap(deal.buyerId);
    deal.providerId = remap(deal.providerId);
  });
  return snapshot;
};

type SelectionStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const readInitialMemberId = (storage?: SelectionStorage) => {
  const selected = storage?.getItem(memberSelectionStorageKey);
  if (selected) return selected;
  if (storage && storage.getItem(legacyMemberSelectionStorageKey) !== null) {
    storage.setItem(memberSelectionStorageKey, defaultMemberId);
  }
  return defaultMemberId;
};

export class DemoAdapter implements HouseholdAdapter {
  mode = 'demo' as const;
  private activeMemberId = defaultMemberId;
  private data: AppSnapshot;
  private listeners = new Set<() => void>();

  constructor(initial?: AppSnapshot) {
    const currentStored = typeof localStorage !== 'undefined' ? parseStoredSnapshot(localStorage.getItem(demoSnapshotStorageKey)) : undefined;
    const legacyStored = !initial && !currentStored && typeof localStorage !== 'undefined'
      ? parseStoredSnapshot(localStorage.getItem(legacyDemoSnapshotStorageKey))
      : undefined;
    const baseSnapshot = initial ?? currentStored ?? (legacyStored ? migrateLegacySnapshot(legacyStored) : seedSnapshot());
    const migrated = normalizeSnapshot(baseSnapshot);
    this.data = migrated.snapshot;
    let { changed } = migrated;
    const validDeals = this.data.deals.filter((deal) => deal.buyerId !== deal.providerId);
    if (validDeals.length !== this.data.deals.length) {
      this.data.deals = validDeals;
      changed = true;
    }
    if (!initial && typeof localStorage !== 'undefined' && (legacyStored || (currentStored && changed))) {
      localStorage.setItem(demoSnapshotStorageKey, JSON.stringify(this.data));
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private emit() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(demoSnapshotStorageKey, JSON.stringify(this.data));
    this.listeners.forEach((listener) => listener());
  }
  async snapshot() { return structuredClone(this.data); }

  setActiveMember(memberId: string) { this.activeMemberId = memberId; }

  private activeActor() {
    const actor = this.data.members.find((item) => item.id === this.activeMemberId);
    if (!actor?.active) throw new Error('FORBIDDEN');
    return actor;
  }

  async setMealStatus(mealId: string, status: MealPlanStatus) {
    this.activeActor();
    const meal = this.data.meals.find((item) => item.id === mealId);
    if (!meal || meal.memberId !== this.activeMemberId) throw new Error('FORBIDDEN');
    meal.status = status; this.emit();
  }

  async recordPresence(action: PresenceAction, source: ActionSource = 'app', tagToken?: string) {
    this.activeActor();
    if (source === 'nfc' && tagToken !== `demo-${action}`) throw new Error('INVALID_STATE');
    const member = this.data.members.find((item) => item.id === this.activeMemberId);
    const nextHome = action === 'arrive';
    if (!member || member.home === nextHome) return;
    this.data.presence.push({ id: uuid(), memberId: this.activeMemberId, action, at: new Date().toISOString(), source });
    member.home = nextHome;
    this.emit();
  }

  async complete_task(input: { taskId: string; idempotencyKey: string; performedByMemberId: string | null; source?: ActionSource; tagToken?: string }): Promise<RpcResult> {
    const actor = this.activeActor();
    const task = this.data.tasks.find((item) => item.id === input.taskId);
    if (!task) throw new Error('INVALID_STATE');
    if (input.source === 'nfc' && input.tagToken !== `demo-${task.activityCode}`) throw new Error('INVALID_STATE');
    if (input.source === 'staff' && !['parent', 'referee'].includes(actor.role)) throw new Error('FORBIDDEN');
    const existing = this.data.completions.find((completion) => completion.taskId === task.id && completion.status === 'valid');
    if (existing) return { completionId: existing.id, rewardMilli: existing.rewardMilli, walletBalance: this.balance(existing.performedByMemberId), alreadyCompleted: true };
    if (!input.performedByMemberId) throw new Error('INVALID_STATE');
    const performer = this.data.members.find((item) => item.id === input.performedByMemberId);
    const recordingForAnother = input.performedByMemberId !== this.activeMemberId;
    if (input.source === 'nfc' && (recordingForAnother || actor.role !== 'participant')) throw new Error('FORBIDDEN');
    if (!performer?.active || (recordingForAnother && actor.role === 'participant')) throw new Error('FORBIDDEN');
    if (!recordingForAnother && task.status === 'assigned' && task.assigneeId !== this.activeMemberId) throw new Error('FORBIDDEN');
    const completionId = uuid();
    const completedAt = new Date().toISOString();
    const completedTakeoverPayer = this.data.takeovers.find((takeover) => takeover.taskId === task.id && takeover.status === 'completed')?.payerId;
    const countedMemberIds = completedTakeoverPayer && completedTakeoverPayer !== input.performedByMemberId
      ? [input.performedByMemberId, completedTakeoverPayer]
      : [input.performedByMemberId];
    task.status = 'completed'; task.assigneeId = input.performedByMemberId;
    this.data.completions.push({ id: completionId, taskId: task.id, performedByMemberId: input.performedByMemberId, recordedByMemberId: actor.id, countedMemberIds, completedAt, rewardMilli: task.rewardMilli, source: input.source ?? (recordingForAnother ? 'staff' : 'app'), status: 'valid' });
    this.data.wallet.push({ id: uuid(), memberId: input.performedByMemberId, kind: 'activity_reward', amount: task.rewardMilli, label: task.title, at: completedAt, taskId: task.id });
    this.emit();
    return { completionId, rewardMilli: task.rewardMilli, walletBalance: this.balance(input.performedByMemberId), alreadyCompleted: false };
  }

  async invalidate_task_completion(input: { completionId: string; reason: string; idempotencyKey: string }): Promise<RpcResult> {
    const actor = this.activeActor();
    if (!['parent', 'referee'].includes(actor.role)) throw new Error('FORBIDDEN');
    if (!input.reason.trim()) throw new Error('INVALID_STATE');
    const completion = this.data.completions.find((item) => item.id === input.completionId);
    if (!completion || completion.status !== 'valid') throw new Error('INVALID_STATE');
    const task = this.data.tasks.find((item) => item.id === completion.taskId);
    if (!task) throw new Error('INVALID_STATE');
    const invalidatedAt = new Date().toISOString();
    completion.status = 'invalidated';
    completion.invalidatedAt = invalidatedAt;
    completion.invalidatedByMemberId = actor.id;
    completion.invalidationReason = input.reason.trim();
    task.status = task.assigneeId ? 'assigned' : 'open';
    this.data.wallet.push({ id: uuid(), memberId: completion.performedByMemberId, kind: 'activity_reversal', amount: -completion.rewardMilli, label: `Attività annullata: ${task.title}`, at: invalidatedAt, taskId: task.id });
    this.emit();
    return { completionId: completion.id, status: completion.status, reversedMilli: completion.rewardMilli };
  }

  async create_takeover(input: { taskId: string; recipientMemberId: string; idempotencyKey: string }): Promise<RpcResult> {
    this.activeActor();
    const task = this.data.tasks.find((item) => item.id === input.taskId);
    const recipient = this.data.members.find((item) => item.id === input.recipientMemberId);
    if (!task || !task.assigneeId || task.assigneeId !== this.activeMemberId) throw new Error('INVALID_STATE');
    if (!recipient?.active || !recipient.home || recipient.role !== 'participant') throw new Error('MEMBER_NOT_HOME');
    const costMilli = task.rewardMilli * 3;
    if (this.balance(task.assigneeId) < Math.max(15, costMilli) || this.data.takeovers.some((item) => item.taskId === task.id && item.status === 'pending')) throw new Error('INSUFFICIENT_MILLI');
    const takeover = { id: uuid(), taskId: task.id, payerId: task.assigneeId, recipientId: input.recipientMemberId, costMilli, status: 'pending' as const };
    this.data.takeovers.push(takeover);
    task.assigneeId = input.recipientMemberId;
    task.status = 'assigned';
    this.emit();
    return { takeoverId: takeover.id, costMilli, reservedMilli: costMilli };
  }

  async resolve_takeover(input: { takeoverId: string; resolution: 'completed' | 'refused'; idempotencyKey: string }): Promise<RpcResult> {
    const actor = this.activeActor();
    const takeover = this.data.takeovers.find((item) => item.id === input.takeoverId);
    if (!takeover || takeover.status !== 'pending') throw new Error('INVALID_STATE');
    if (this.activeMemberId !== takeover.recipientId && actor.role !== 'parent') throw new Error('FORBIDDEN');
    takeover.status = input.resolution;
    const task = this.data.tasks.find((item) => item.id === takeover.taskId);
    const alreadyCompleted = task?.status === 'completed';
    if (input.resolution === 'completed' && task) {
      task.status = 'completed'; task.assigneeId = takeover.recipientId;
      const completion = this.data.completions.find((item) => item.taskId === task.id && item.status === 'valid');
      if (completion && !completion.countedMemberIds.includes(takeover.payerId)) completion.countedMemberIds.push(takeover.payerId);
      this.data.wallet.push({ id: uuid(), memberId: takeover.payerId, kind: 'takeover_cost', amount: -takeover.costMilli, label: 'Takeover completato', at: new Date().toISOString(), taskId: task.id });
      if (!alreadyCompleted) this.data.wallet.push({ id: uuid(), memberId: takeover.recipientId, kind: 'activity_reward', amount: task.rewardMilli, label: task.title, at: new Date().toISOString(), taskId: task.id });
    }
    if (input.resolution === 'refused' && task) {
      task.assigneeId = takeover.payerId;
      task.status = 'assigned';
    }
    this.emit();
    return { status: takeover.status, pendingParentReview: input.resolution === 'refused' };
  }

  async create_deal(input: { providerMemberId: string; description: string; priceMilli: number; dueAt: string; idempotencyKey: string }): Promise<RpcResult> {
    const actor = this.activeActor();
    const provider = this.data.members.find((item) => item.id === input.providerMemberId);
    if (input.priceMilli <= 0 || actor.role !== 'participant' || !provider?.active || provider.role !== 'participant' || provider.id === this.activeMemberId) throw new Error('INVALID_STATE');
    const deal = { id: uuid(), buyerId: this.activeMemberId, providerId: input.providerMemberId, description: input.description, priceMilli: input.priceMilli, dueAt: input.dueAt, status: 'proposed' as const };
    this.data.deals.push(deal); this.emit(); return { dealId: deal.id, status: deal.status };
  }

  async accept_deal(input: { dealId: string; idempotencyKey: string }): Promise<RpcResult> {
    this.activeActor();
    const deal = this.data.deals.find((item) => item.id === input.dealId);
    if (!deal || deal.status !== 'proposed' || deal.providerId !== this.activeMemberId) throw new Error('INVALID_STATE');
    if (this.balance(deal.buyerId) < deal.priceMilli) throw new Error('INSUFFICIENT_MILLI');
    deal.status = 'accepted'; this.emit(); return { status: deal.status, reservedMilli: deal.priceMilli };
  }

  async settle_deal(input: { dealId: string; idempotencyKey: string }): Promise<RpcResult> {
    const actor = this.activeActor();
    const deal = this.data.deals.find((item) => item.id === input.dealId);
    if (!deal || !['accepted', 'performed'].includes(deal.status)) throw new Error('INVALID_STATE');
    if (![deal.buyerId, deal.providerId].includes(this.activeMemberId) && actor.role !== 'parent') throw new Error('FORBIDDEN');
    deal.status = 'settled';
    this.data.wallet.push({ id: uuid(), memberId: deal.buyerId, kind: 'deal_transfer', amount: -deal.priceMilli, label: `Fai: ${deal.description}`, at: new Date().toISOString() });
    this.data.wallet.push({ id: uuid(), memberId: deal.providerId, kind: 'deal_transfer', amount: deal.priceMilli, label: `Ricevi: ${deal.description}`, at: new Date().toISOString() });
    this.emit(); return { status: deal.status, buyerBalance: this.balance(deal.buyerId), providerBalance: this.balance(deal.providerId) };
  }

  async apply_parent_correction(input: { targetType: string; targetId: string; reason: string; changes: Record<string, unknown>; idempotencyKey: string }): Promise<RpcResult> {
    if (this.activeActor().role !== 'parent') throw new Error('FORBIDDEN');
    if (input.targetType !== 'task') throw new Error('INVALID_STATE');
    const task = this.data.tasks.find((item) => item.id === input.targetId);
    if (!task) throw new Error('INVALID_STATE');
    if (typeof input.changes.status === 'string') task.status = input.changes.status as typeof task.status;
    if ('assignedMemberId' in input.changes) task.assigneeId = typeof input.changes.assignedMemberId === 'string' ? input.changes.assignedMemberId : undefined;
    this.emit(); return { auditEventId: uuid() };
  }

  async create_on_demand_task(input: { activityCode: 'rubbish' | 'parcel'; title: string; dueAt: string; idempotencyKey: string }): Promise<RpcResult> {
    const role = this.activeActor().role;
    if (role !== 'parent' && role !== 'referee') throw new Error('FORBIDDEN');
    const rewardMilli = input.activityCode === 'rubbish' ? 1 : 2;
    const dueAt = new Date(input.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw new Error('INVALID_STATE');
    const task = { id: uuid(), activityCode: input.activityCode, title: input.title, date: isoDay(0, dueAt), dueAt: dueAt.toISOString(), status: 'open' as const, rewardMilli };
    this.data.tasks.push(task); this.emit(); return { taskId: task.id, status: task.status };
  }

  async create_member(input: { displayName: string; role: Role }): Promise<RpcResult> {
    if (this.activeActor().role !== 'parent') throw new Error('FORBIDDEN');
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 40 || !['participant', 'referee', 'parent'].includes(input.role)) throw new Error('INVALID_STATE');
    if (this.data.members.some((member) => member.displayName.toLocaleLowerCase() === displayName.toLocaleLowerCase())) throw new Error('INVALID_STATE');
    const memberId = uuid();
    this.data.members.push({
      id: memberId,
      displayName,
      role: input.role,
      color: memberColors[this.data.members.length % memberColors.length],
      home: false,
      active: true,
    });
    const instant = new Date();
    Array.from({ length: 7 }, (_, offset) => isoDay(offset, instant)).forEach((calendarDay) => {
      this.data.meals.push({ id: `meal-${calendarDay}-${memberId}-dinner`, memberId, date: calendarDay, type: 'dinner', status: 'unknown' });
      if (isHouseholdWeekend(calendarDay)) {
        this.data.meals.push({ id: `meal-${calendarDay}-${memberId}-lunch`, memberId, date: calendarDay, type: 'lunch', status: 'unknown' });
      }
    });
    this.emit();
    return { memberId, displayName, role: input.role, isActive: true };
  }

  async set_member_active(input: { memberId: string; active: boolean }): Promise<RpcResult> {
    const actor = this.activeActor();
    if (actor.role !== 'parent') throw new Error('FORBIDDEN');
    const target = this.data.members.find((member) => member.id === input.memberId);
    if (!target) throw new Error('INVALID_STATE');
    if (!input.active && target.id === actor.id) throw new Error('INVALID_STATE');
    const activeParents = this.data.members.filter((member) => member.active && member.role === 'parent').length;
    if (!input.active && target.active && target.role === 'parent' && activeParents <= 1) throw new Error('INVALID_STATE');
    target.active = input.active;
    this.emit();
    return { memberId: target.id, isActive: target.active };
  }

  balance(memberId?: string) { return this.data.wallet.filter((entry) => entry.memberId === memberId).reduce((sum, entry) => sum + entry.amount, 0); }
}

export const adapter = new DemoAdapter();
export const formatDate = (date: string) => new Intl.DateTimeFormat('it-IT', { timeZone: householdTimeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`));
export const formatTime = (date: string) => new Intl.DateTimeFormat('it-IT', { timeZone: householdTimeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(date));
export const memberName = (snapshot: AppSnapshot, memberId?: string) => snapshot.members.find((member) => member.id === memberId)?.displayName ?? 'Non assegnato';
