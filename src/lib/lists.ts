import { useSyncExternalStore } from "react";

export interface UserList {
  id: string;
  name: string;
  createdAt: number;
}

const KEY = "pulse:lists:v1";
let lists: UserList[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(lists)); } catch { /* ignore */ }
}
function emit() { for (const l of listeners) l(); }

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) lists = JSON.parse(raw) as UserList[];
  } catch { /* ignore */ }
  emit();
}

export const listsStore = {
  get(): UserList[] { ensureHydrated(); return lists; },
  hydrate() { ensureHydrated(); },
  add(name: string): UserList {
    ensureHydrated();
    const l: UserList = { id: "l-" + Math.random().toString(36).slice(2, 10), name, createdAt: Date.now() };
    lists = [...lists, l];
    persist(); emit();
    return l;
  },
  remove(id: string) {
    ensureHydrated();
    lists = lists.filter((l) => l.id !== id);
    persist(); emit();
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
};

const EMPTY: UserList[] = [];
export function useLists() {
  return useSyncExternalStore(
    (cb) => listsStore.subscribe(cb),
    () => listsStore.get(),
    () => EMPTY,
  );
}
