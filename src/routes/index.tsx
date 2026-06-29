import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BarChart3,
  Calendar,
  CheckCircle2,
  Circle,
  Folder,
  History,
  Home,
  LogOut,
  Mic,
  Plus,
  Search,
  Sparkles,
  Square,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/saver-logo.png";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  summarizeTasksForAI,
  tasksStore,
  useTasks,
  type Priority,
  type Task,
} from "@/lib/tasks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Saver — AI-powered tasks that finish themselves" },
      {
        name: "description",
        content:
          "An AI-powered Google Tasks replacement. Capture, prioritize, and finish what matters — Saver plans your day so you never miss another deadline.",
      },
      { property: "og:title", content: "Saver — AI-powered tasks" },
      {
        property: "og:description",
        content:
          "Capture, prioritize, and finish what matters. Saver is the AI companion that turns task chaos into a clear plan.",
      },
    ],
  }),
  component: Index,
});

const CHAT_STORAGE_KEY = "saver:chat:v2";

const QUICK_CHIPS = [
  { label: "/ Break it down", text: "Break down my most urgent task into a 25-minute first step." },
  { label: "/ Rescue me", text: "I'm overwhelmed. Which two tasks should I do first today and why?" },
  { label: "/ Plan my day", text: "Plan my day using my current tasks. Give me a time-boxed schedule." },
  { label: "/ Habit check", text: "Quick weekly review: what did I finish and what habits should I anchor next week?" },
];

const PRIORITIES: { key: Priority; label: string; dot: string; ring: string; gradient: string }[] = [
  { key: "high", label: "High priority", dot: "bg-rose-400", ring: "ring-rose-400/40", gradient: "from-rose-500/15" },
  { key: "medium", label: "Medium priority", dot: "bg-amber-400", ring: "ring-amber-400/40", gradient: "from-amber-500/15" },
  { key: "low", label: "Low priority", dot: "bg-emerald-400", ring: "ring-emerald-400/40", gradient: "from-emerald-500/15" },
];

function loadMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UIMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function Index() {
  const tasks = useTasks();
  const [chatOpen, setChatOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Hydrate task store on mount (after SSR).
  useEffect(() => {
    tasksStore.hydrate();
  }, []);

  const [initialMessages] = useState<UIMessage[]>(() => loadMessages());
  const [input, setInput] = useState("");
  const processedToolIds = useRef<Set<string>>(new Set());

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...(body ?? {}), messages, taskSnapshot: summarizeTasksForAI() },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: "saver-main",
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error(err);
      toast.error(err.message || "Something went wrong.");
    },
  });

  // Persist chat messages.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status === "submitted" || status === "streaming") return;
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, status]);

  // Apply tool calls to the task store as they stream in.
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts) {
        // AI SDK v7 tool parts are typed as `tool-${name}` with a `state` field.
        if (!part.type || !part.type.startsWith("tool-")) continue;
        const tp = part as {
          type: string;
          toolCallId?: string;
          state?: string;
          input?: Record<string, unknown>;
        };
        if (!tp.toolCallId || processedToolIds.current.has(tp.toolCallId)) continue;
        // Apply once the tool input is complete.
        if (tp.state !== "input-available" && tp.state !== "output-available") continue;
        const name = tp.type.slice("tool-".length);
        const args = tp.input ?? {};
        try {
          applyToolCall(name, args);
          processedToolIds.current.add(tp.toolCallId);
        } catch (e) {
          console.error("Failed to apply tool", name, e);
        }
      }
    }
  }, [messages]);

  const isBusy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || isBusy) return;
    setChatOpen(true);
    sendMessage({ text: t });
    setInput("");
  };

  const handleClearChat = () => {
    setMessages([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    }
    processedToolIds.current.clear();
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.group?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const groups = useMemo(() => {
    const open = filtered.filter((t) => !t.done);
    return {
      high: open.filter((t) => t.priority === "high"),
      medium: open.filter((t) => t.priority === "medium"),
      low: open.filter((t) => t.priority === "low"),
    };
  }, [filtered]);

  const completedCount = tasks.filter((t) => t.done).length;
  const openCount = tasks.length - completedCount;

  return (
    <div className="flex min-h-screen">
      <Toaster richColors theme="dark" position="top-center" />

      <Sidebar logoSrc={logo} />

      <div className="ml-16 flex w-full min-w-0 flex-col">
        <TopBar
          search={search}
          setSearch={setSearch}
          onOpenChat={() => setChatOpen(true)}
          isBusy={isBusy}
        />

        <main className="relative mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-6">
          <GuestBanner />

          <Hero openCount={openCount} completedCount={completedCount} />

          <CommandBar
            input={input}
            setInput={setInput}
            onSubmit={() => submit(input)}
            onChip={(t) => submit(t)}
            isBusy={isBusy}
          />

          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Today's tasks</h2>
              <div className="text-xs text-muted-foreground">
                {openCount} open · {completedCount} done
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {PRIORITIES.map((p) => (
                <PriorityColumn
                  key={p.key}
                  meta={p}
                  tasks={groups[p.key]}
                />
              ))}
            </div>
            {completedCount > 0 && <CompletedDrawer tasks={tasks.filter((t) => t.done)} />}
          </section>
        </main>

        {/* Pulse AI side handle */}
        <button
          onClick={() => setChatOpen(true)}
          className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1.5 rounded-l-lg border border-r-0 border-border bg-card/80 px-2 py-3 text-xs font-medium text-muted-foreground backdrop-blur-md transition-all hover:text-foreground hover:brand-glow"
          style={{ writingMode: "vertical-rl" }}
          aria-label="Open Saver AI"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          SAVER AI
        </button>
      </div>

      <ChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        messages={messages}
        status={status}
        onSubmit={submit}
        onStop={stop}
        input={input}
        setInput={setInput}
        onClear={handleClearChat}
      />
    </div>
  );
}

function applyToolCall(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "add_task": {
      const task = tasksStore.add({
        title: String(args.title ?? "Untitled"),
        priority: (args.priority as Priority) ?? "medium",
        due: args.due ? String(args.due) : undefined,
        group: args.group ? String(args.group) : undefined,
        notes: args.notes ? String(args.notes) : undefined,
      });
      toast.success(`Added: ${task.title}`);
      return;
    }
    case "complete_task": {
      const id = String(args.id ?? "");
      const t = tasksStore.get().find((x) => x.id === id);
      if (!t) return;
      if (!t.done) tasksStore.toggle(id);
      toast.success(`Completed: ${t.title}`);
      return;
    }
    case "delete_task": {
      const id = String(args.id ?? "");
      const t = tasksStore.get().find((x) => x.id === id);
      if (!t) return;
      tasksStore.remove(id);
      toast(`Deleted: ${t.title}`);
      return;
    }
    case "update_task": {
      const id = String(args.id ?? "");
      const { id: _i, ...patch } = args;
      void _i;
      tasksStore.update(id, patch as Partial<Task>);
      toast(`Updated`);
      return;
    }
  }
}

/* ─────────────────────────────── Sidebar ─────────────────────────────── */

function Sidebar({ logoSrc }: { logoSrc: string }) {
  const items = [
    { icon: Home, label: "Home", active: true },
    { icon: Star, label: "Starred" },
    { icon: Folder, label: "Projects" },
    { icon: Calendar, label: "Calendar" },
    { icon: BarChart3, label: "Insights" },
    { icon: History, label: "History" },
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-16 flex-col items-center justify-between border-r border-border/60 bg-sidebar/80 py-4 backdrop-blur-md">
      <div className="flex flex-col items-center gap-5">
        <img src={logoSrc} alt="Saver" width={28} height={28} className="h-7 w-7 drop-shadow-[0_0_18px_rgba(124,92,255,0.55)]" />
        <div className="flex flex-col items-center gap-1.5">
          {items.map((it) => (
            <button
              key={it.label}
              title={it.label}
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                it.active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {it.active && (
                <span className="absolute -left-2 h-6 w-1 rounded-r bg-primary" />
              )}
              <it.icon className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-semibold text-primary-foreground">
        JI
      </div>
    </aside>
  );
}

/* ─────────────────────────────── Top bar ─────────────────────────────── */

function TopBar({
  search,
  setSearch,
  onOpenChat,
  isBusy,
}: {
  search: string;
  setSearch: (v: string) => void;
  onOpenChat: () => void;
  isBusy: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border/60 bg-background/70 px-6 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">Saver Tasks</span>
        <span className="rounded-full bg-card/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          2.0
        </span>
      </div>

      <div className="relative mx-auto w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="h-9 rounded-full border-border/60 bg-card/60 pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-primary/40"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] text-muted-foreground sm:flex">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isBusy ? "bg-amber-400" : "bg-emerald-400",
            )}
            style={{ animation: "pulse-dot 2.2s ease-in-out infinite" }}
          />
          {isBusy ? "Saver thinking" : "Saver standby"}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onOpenChat}
          aria-label="Open AI chat"
          className="text-primary hover:bg-primary/15"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-semibold text-primary-foreground">
          JI
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Sign out" className="text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Banner ─────────────────────────────── */

function GuestBanner() {
  return (
    <div className="mb-6 -mx-6 border-b border-border/60 bg-primary/[0.06] px-6 py-2.5 text-center text-xs text-muted-foreground">
      <span className="mr-1">👋</span> You're in guest mode — this runs locally in your browser.
      Connect to save tasks across devices.
    </div>
  );
}

/* ─────────────────────────────── Hero ─────────────────────────────── */

function Hero({ openCount, completedCount }: { openCount: number; completedCount: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 px-8 py-12 brand-glow">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, oklch(0.66 0.21 290 / 0.18), transparent 55%), radial-gradient(circle at 80% 80%, oklch(0.78 0.16 175 / 0.12), transparent 50%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_1px_1px,oklch(1_0_0/0.08)_1px,transparent_0)] [background-size:24px_24px]" />
      <div className="relative text-center">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
          Tasks <span className="gradient-text">2.0</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Don't forget yours. {openCount > 0 ? `${openCount} open · ${completedCount} done today.` : "You're all caught up."}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Command bar ─────────────────────────────── */

function CommandBar({
  input,
  setInput,
  onSubmit,
  onChip,
  isBusy,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: () => void;
  onChip: (t: string) => void;
  isBusy: boolean;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-border/60 bg-card/50 p-3 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="I have a meeting at 3 and a dinner at 8, plan my day"
          className="h-9 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Voice (coming soon)"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => toast("Voice input coming soon")}
        >
          <Mic className="h-4 w-4" />
        </Button>
        <Button
          size="icon-sm"
          onClick={onSubmit}
          disabled={!input.trim() || isBusy}
          aria-label="Send"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-12">
        {QUICK_CHIPS.map((c) => (
          <button
            key={c.label}
            onClick={() => onChip(c.text)}
            disabled={isBusy}
            className="rounded-full border border-border/70 bg-background/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Board ─────────────────────────────── */

function PriorityColumn({
  meta,
  tasks,
}: {
  meta: typeof PRIORITIES[number];
  tasks: Task[];
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const submitDraft = () => {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    tasksStore.add({ title, priority: meta.key });
    setDraft("");
    setAdding(false);
  };

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors", `bg-gradient-to-b ${meta.gradient} to-transparent`)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">{meta.label}</h3>
        <span className={cn("h-2 w-2 rounded-full ring-4", meta.dot, meta.ring)} />
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && !adding && (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/30 px-3 py-6 text-center text-xs text-muted-foreground">
            Nothing here. Breathe.
          </div>
        )}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
        {adding ? (
          <div className="rounded-lg border border-primary/40 bg-card/80 p-2.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitDraft();
                if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              placeholder="What needs doing?"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Task
          </button>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const meta = PRIORITIES.find((p) => p.key === task.priority)!;
  return (
    <div className="group relative rounded-lg border border-border/60 bg-card/70 p-3 transition-all hover:border-primary/30 hover:bg-card">
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => tasksStore.toggle(task.id)}
          aria-label={task.done ? "Mark not done" : "Complete task"}
          className="mt-0.5 shrink-0"
        >
          {task.done ? (
            <CheckCircle2 className="h-4 w-4 text-accent" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          )}
        </button>
        <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm leading-snug", task.done && "text-muted-foreground line-through")}>
            {task.title}
          </div>
          {(task.group || task.due) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {task.group && (
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-full bg-muted" />
                  {task.group}
                </span>
              )}
              {task.due && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {task.due}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => tasksStore.remove(task.id)}
          className="opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Delete task"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}

function CompletedDrawer({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {tasks.length} completed {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Chat sheet ─────────────────────────────── */

function ChatSheet({
  open,
  onOpenChange,
  messages,
  status,
  onSubmit,
  onStop,
  input,
  setInput,
  onClear,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  onSubmit: (text: string) => void;
  onStop: () => void;
  input: string;
  setInput: (v: string) => void;
  onClear: () => void;
}) {
  const isBusy = status === "submitted" || status === "streaming";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open, status]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border/60 bg-background/95 p-0 backdrop-blur-xl sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <SheetTitle className="text-sm">Saver AI</SheetTitle>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClear}
                aria-label="Clear chat"
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <SheetDescription className="sr-only">
            Conversation with your AI productivity companion.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-medium">Say what's on your plate</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                I'll capture it, prioritize it, and tell you what to do next.
              </p>
            </div>
          ) : (
            <Conversation className="h-full">
              <ConversationContent className="space-y-3 p-4">
                {messages.map((m) => (
                  <Message key={m.id} from={m.role}>
                    <MessageContent
                      className={
                        m.role === "assistant"
                          ? "bg-transparent p-0 text-foreground"
                          : "bg-primary text-primary-foreground"
                      }
                    >
                      {m.parts.map((part, i) => {
                        if (part.type === "text") {
                          return m.role === "assistant" ? (
                            <MessageResponse key={i}>{part.text}</MessageResponse>
                          ) : (
                            <span key={i} className="whitespace-pre-wrap">
                              {part.text}
                            </span>
                          );
                        }
                        if (part.type?.startsWith("tool-")) {
                          const tp = part as { type: string; input?: { title?: string; id?: string } };
                          const name = tp.type.slice("tool-".length).replace("_", " ");
                          const label = tp.input?.title ?? tp.input?.id ?? "";
                          return (
                            <div
                              key={i}
                              className="my-1.5 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] text-foreground/90"
                            >
                              <Sparkles className="h-3 w-3 text-primary" />
                              <span className="font-medium capitalize">{name}</span>
                              {label && <span className="text-muted-foreground">· {label}</span>}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </MessageContent>
                  </Message>
                ))}
                {status === "submitted" && (
                  <Message from="assistant">
                    <MessageContent className="bg-transparent p-0">
                      <Shimmer>Saver is thinking…</Shimmer>
                    </MessageContent>
                  </Message>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          )}
        </div>

        <div className="border-t border-border/60 bg-background/80 p-3">
          <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-card/60 p-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(input);
                }
              }}
              placeholder="Message Saver…"
              rows={1}
              className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {isBusy ? (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                onClick={onStop}
                aria-label="Stop"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon-sm"
                onClick={() => onSubmit(input)}
                disabled={!input.trim()}
                aria-label="Send"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
