import { useSyncExternalStore } from "react";

export type Priority = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  notes?: string;
  due?: string; // human readable, e.g. "Today 3pm" or ISO
  group?: string; // e.g. "Sequoia Capital team"
  starred?: boolean;
  createdAt: number;
  completedAt?: number;
}

const STORAGE_KEY = "saver:tasks:v2";

const seedTasks: Task[] = [];


let tasks: Task[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Task[];
      tasks = Array.isArray(parsed) ? parsed : seedTasks;
    } else {
      tasks = seedTasks;
      persist();
    }
  } catch {
    tasks = seedTasks;
  }
  emit();
}

function uid() {
  return "t-" + Math.random().toString(36).slice(2, 10);
}

export const tasksStore = {
  get(): Task[] {
    ensureHydrated();
    return tasks;
  },
  hydrate() {
    ensureHydrated();
  },
  add(partial: Omit<Task, "id" | "createdAt" | "done"> & { done?: boolean }): Task {
    ensureHydrated();
    const t: Task = {
      id: uid(),
      createdAt: Date.now(),
      done: partial.done ?? false,
      ...partial,
    };
    tasks = [t, ...tasks];
    persist();
    emit();
    return t;
  },
  update(id: string, patch: Partial<Task>) {
    ensureHydrated();
    tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    persist();
    emit();
  },
  toggle(id: string) {
    ensureHydrated();
    tasks = tasks.map((t) =>
      t.id === id
        ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined }
        : t,
    );
    persist();
    emit();
  },
  remove(id: string) {
    ensureHydrated();
    tasks = tasks.filter((t) => t.id !== id);
    persist();
    emit();
  },
  reset() {
    tasks = seedTasks;
    persist();
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

const EMPTY: Task[] = [];

export function useTasks() {
  return useSyncExternalStore(
    (cb) => tasksStore.subscribe(cb),
    () => tasksStore.get(),
    () => EMPTY,
  );
}

export function summarizeTasksForAI(): string {
  const open = tasks.filter((t) => !t.done);
  if (open.length === 0) return "The user currently has no open tasks.";
  const by = (p: Priority) =>
    open
      .filter((t) => t.priority === p)
      .map(
        (t) =>
          `  - [${t.id}] ${t.title}${t.due ? ` (due ${t.due})` : ""}${t.group ? ` — ${t.group}` : ""}`,
      )
      .join("\n") || "  (none)";
  return [
    "Current open tasks:",
    "High priority:",
    by("high"),
    "Medium priority:",
    by("medium"),
    "Low priority:",
    by("low"),
  ].join("\n");
}
