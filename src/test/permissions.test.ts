import { describe, expect, it } from 'vitest';
import { can, navForRole } from '../lib/permissions';

describe('role permissions', () => {
  it('keeps parent corrections behind parent role', () => {
    expect(can('parent', 'apply-correction')).toBe(true);
    expect(can('referee', 'apply-correction')).toBe(false);
    expect(can('participant', 'apply-correction')).toBe(false);
  });

  it('allows only parents to manage family members', () => {
    expect(can('parent', 'manage-members')).toBe(true);
    expect(can('referee', 'manage-members')).toBe(false);
    expect(can('participant', 'manage-members')).toBe(false);
  });

  it('allows referee operational recording without wallet powers', () => {
    expect(can('referee', 'create-task')).toBe(true);
    expect(can('referee', 'record-for-other')).toBe(true);
    expect(can('referee', 'invalidate-completion')).toBe(true);
    expect(can('referee', 'trade')).toBe(false);
    expect(can('participant', 'invalidate-completion')).toBe(false);
  });

  it('shows role-aware navigation', () => {
    expect(navForRole('participant').map((item) => item.to)).toContain('/market');
    expect(navForRole('parent').map((item) => item.to)).toContain('/admin');
    expect(navForRole('referee').map((item) => item.to)).not.toContain('/milli');
  });
});
