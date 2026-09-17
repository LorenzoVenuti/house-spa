export type Role = 'participant' | 'referee' | 'parent';
export type MealType = 'lunch' | 'dinner';
export type MealPlanStatus = 'present' | 'absent' | 'unknown';
export type PresenceAction = 'arrive' | 'leave';
export type ActionSource = 'app' | 'nfc' | 'staff';
export type TaskStatus = 'planned' | 'open' | 'assigned' | 'completed' | 'expired' | 'cancelled';
export type TakeoverStatus = 'pending' | 'completed' | 'refused' | 'expired' | 'cancelled';
export type DealStatus = 'proposed' | 'accepted' | 'performed' | 'settled' | 'rejected' | 'cancelled' | 'expired' | 'disputed';
export type WalletEntryKind = 'activity_reward' | 'activity_reversal' | 'takeover_cost' | 'deal_transfer' | 'penalty' | 'correction';

export interface Member { id: string; displayName: string; role: Role; color: string; home: boolean; active: boolean }
export interface MealPlan { id: string; memberId: string; date: string; type: MealType; status: MealPlanStatus }
export interface PresenceEvent { id: string; memberId: string; action: PresenceAction; at: string; source?: ActionSource }
export interface Activity { code: 'dishes' | 'rubbish' | 'parcel'; label: string; baseReward: number; singleParticipantReward: number }
export interface Task { id: string; activityCode: Activity['code']; title: string; date: string; dueAt: string; status: TaskStatus; assigneeId?: string; rewardMilli: number; onlyParticipant?: boolean }
export interface TaskCompletion { id: string; taskId: string; performedByMemberId: string; recordedByMemberId: string; countedMemberIds: string[]; completedAt: string; rewardMilli: number; source: ActionSource; status: 'valid' | 'invalidated'; invalidatedAt?: string; invalidatedByMemberId?: string; invalidationReason?: string }
export interface WalletEntry { id: string; memberId: string; kind: WalletEntryKind; amount: number; label: string; at: string; taskId?: string }
export interface Takeover { id: string; taskId: string; payerId: string; recipientId: string; costMilli: number; status: TakeoverStatus }
export interface Deal { id: string; buyerId: string; providerId: string; description: string; priceMilli: number; dueAt: string; status: DealStatus }
export interface AppSnapshot { members: Member[]; meals: MealPlan[]; presence: PresenceEvent[]; tasks: Task[]; completions: TaskCompletion[]; wallet: WalletEntry[]; takeovers: Takeover[]; deals: Deal[]; }

export interface RpcResult { [key: string]: unknown }
export interface HouseholdAdapter {
  mode: 'demo' | 'supabase';
  snapshot(): Promise<AppSnapshot>;
  complete_task(input: { taskId: string; idempotencyKey: string; performedByMemberId: string | null; source?: ActionSource; tagToken?: string }): Promise<RpcResult>;
  invalidate_task_completion(input: { completionId: string; reason: string; idempotencyKey: string }): Promise<RpcResult>;
  create_takeover(input: { taskId: string; recipientMemberId: string; idempotencyKey: string }): Promise<RpcResult>;
  resolve_takeover(input: { takeoverId: string; resolution: 'completed' | 'refused'; idempotencyKey: string }): Promise<RpcResult>;
  create_deal(input: { providerMemberId: string; description: string; priceMilli: number; dueAt: string; idempotencyKey: string }): Promise<RpcResult>;
  accept_deal(input: { dealId: string; idempotencyKey: string }): Promise<RpcResult>;
  settle_deal(input: { dealId: string; idempotencyKey: string }): Promise<RpcResult>;
  apply_parent_correction(input: { targetType: string; targetId: string; reason: string; changes: Record<string, unknown>; idempotencyKey: string }): Promise<RpcResult>;
  create_on_demand_task(input: { activityCode: 'rubbish' | 'parcel'; title: string; dueAt: string; idempotencyKey: string }): Promise<RpcResult>;
  create_member(input: { displayName: string; role: Role }): Promise<RpcResult>;
  set_member_active(input: { memberId: string; active: boolean }): Promise<RpcResult>;
  setMealStatus(mealId: string, status: MealPlanStatus): Promise<void>;
  recordPresence(action: PresenceAction, source?: ActionSource, tagToken?: string): Promise<void>;
}
