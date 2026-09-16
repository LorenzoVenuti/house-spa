import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { adapter, memberSelectionStorageKey, readInitialMemberId } from '../lib/adapter';
import type { AppSnapshot } from '../lib/types';
import { AppContext } from './app-context';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => ({ members: [], meals: [], presence: [], tasks: [], wallet: [], takeovers: [], deals: [] }));
  const [memberId, setMemberIdState] = useState(() => readInitialMemberId(globalThis.localStorage));
  const memberIdRef = useRef(memberId);
  useEffect(() => {
    const load = () => void adapter.snapshot().then((nextSnapshot) => {
      const nextMember = nextSnapshot.members.find((item) => item.id === memberIdRef.current && item.active)
        ?? nextSnapshot.members.find((item) => item.active);
      if (nextMember) {
        memberIdRef.current = nextMember.id;
        adapter.setActiveMember(nextMember.id);
        globalThis.localStorage?.setItem(memberSelectionStorageKey, nextMember.id);
        setMemberIdState(nextMember.id);
      }
      setSnapshot(nextSnapshot);
    });
    load();
    return adapter.subscribe(load);
  }, []);
  const activeMembers = snapshot.members.filter((item) => item.active);
  const member = activeMembers.find((item) => item.id === memberId) ?? activeMembers[0];
  const value = useMemo(() => ({
    snapshot,
    member,
    setMemberId: (id: string) => {
      const nextMember = snapshot.members.find((item) => item.id === id && item.active) ?? activeMembers[0];
      if (!nextMember) return;
      memberIdRef.current = nextMember.id;
      adapter.setActiveMember(nextMember.id);
      setMemberIdState(nextMember.id);
      globalThis.localStorage?.setItem(memberSelectionStorageKey, nextMember.id);
    },
    refresh: () => void adapter.snapshot().then(setSnapshot),
  }), [activeMembers, member, snapshot]);
  if (!member) return <div className="page"><p>Caricamento del tribunale…</p></div>;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
