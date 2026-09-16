import type { Role } from './types';

export const can = (role: Role, action: 'complete-own-task' | 'create-task' | 'record-for-other' | 'apply-correction' | 'manage-members' | 'trade' | 'request-takeover') => {
  if (action === 'complete-own-task' || action === 'trade' || action === 'request-takeover') return role === 'participant';
  if (action === 'create-task' || action === 'record-for-other') return role === 'referee' || role === 'parent';
  if (action === 'apply-correction' || action === 'manage-members') return role === 'parent';
  return false;
};

export const navForRole = (role: Role) => [
  { to: '/today', label: 'Oggi', icon: '◈' },
  { to: '/calendar', label: 'Calendario', icon: '▦' },
  ...(role === 'participant' ? [{ to: '/tribunal', label: 'Tribunale', icon: '⚖' }, { to: '/market', label: 'Mercato', icon: '◇' }, { to: '/milli', label: 'Milli', icon: 'M' }] : []),
  ...(role === 'parent' ? [{ to: '/tribunal', label: 'Tribunale', icon: '⚖' }, { to: '/admin', label: 'Admin', icon: '⌘' }] : []),
  ...(role === 'referee' ? [{ to: '/tribunal', label: 'Tribunale', icon: '⚖' }] : []),
];
