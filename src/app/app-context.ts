import { createContext, useContext } from 'react';
import type { AppSnapshot, Member } from '../lib/types';

export interface AppContextValue {
  snapshot: AppSnapshot;
  member: Member;
  setMemberId: (id: string) => void;
  refresh: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
};
