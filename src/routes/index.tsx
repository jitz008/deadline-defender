import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home, Star, ListChecks, CalendarClock, Activity, History,
  Search, Sparkles, Mic, ArrowUp, X, Lightbulb, Plus, Check,
} from "lucide-react";
import { tasksStore, useTasks, type Priority, type Task } from "@/lib/tasks";

export const Route = createFileRoute("/")({ component: PulseTasks });

// ---------- AI helpers ----------
type Suggestion = { title: string; priority?: Priority; due?: string };
type Parsed = { body: string; followUps: string[]; suggestions: Suggestion[]; addedIds?: string[] };

function parseAiText(raw: string): Parsed {
  let body = raw;
  let followUps: string[] = [];
  let suggestions: Suggestion[] = [];

  const fuMatch = body.match(/FOLLOW_UPS:\s*(\[[\s\S]*?\])/);
  if (fuMatch) {
    try { followUps = JSON.parse(fuMatch[1]); } catch { /* ignore */ }
    body = body.replace(fuMatch[0], "").trim();
  }
  const stMatch = body.match(/SUGGESTED_TASKS:\s*(\[[\s\S]*?\])/);
  if (stMatch) {
    try { suggestions = JSON.parse(stMatch[1]); } catch { /* ignore */ }
    body = body.replace(stMatch[0], "").trim();
  }
  return { body, followUps, suggestions };
}

// Very small markdown: **bold**, bullet lines, headings (###)
function MD({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-white/90">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const isList = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-white/40">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        if (/^#{1,3}\s+/.test(lines[0])) {
          const h = lines[0].replace(/^#{1,3}\s+/, "");
          return (
            <div key={i}>
              <div className="mb-1 font-semibold text-white">{inline(h)}</div>
              {lines.slice(1).map((l, j) => (
                <div key={j}>{inline(l)}</div>
              ))}
            </div>
          );
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l)}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}
function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

// ---------- Sidebar ----------
const navItems = [
  { icon: Home, label: "Home" },
  { icon: Star, label: "Starred" },
  { icon: ListChecks, label: "All Lists" },
  { icon: CalendarClock, label: "Today's Plan", badge: "AI" },
  { icon: Activity, label: "Habit Tracker" },
  { icon: History, label: "Previous Tasks" },
];

function Sidebar() {
  return (
    <aside
      className="group fixed left-0 top-0 z-30 flex h-screen w-[52px] flex-col justify-between border-r border-white/5 bg-white/[0.02] py-4 backdrop-blur-xl transition-[width] duration-300 hover:w-[220px]"
    >
      <div className="flex flex-col gap-1 px-2">
        <div className="mb-4 flex h-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#4f8ef7] to-[#a78bfa] text-sm font-bold text-white">P</div>
        {navItems.map((it) => (
          <button
            key={it.label}
            className="flex h-10 items-center gap-3 rounded-lg px-2 text-sm text-white/70 hover:bg-white/5 hover:text-white"
          >
            <it.icon className="size-5 shrink-0" />
            <span className="hidden truncate group-hover:inline">{it.label}</span>
            {it.badge && (
              <span className="ml-auto hidden rounded-md bg-gradient-to-br from-[#4f8ef7] to-[#a78bfa] px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:inline">
                {it.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 px-2">
        <div className="flex items-center gap-2 rounded-lg p-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#a78bfa] to-[#4f8ef7] text-xs font-bold text-white">YO</div>
          <span className="hidden truncate text-sm text-white/80 group-hover:inline">You</span>
        </div>
        <div className="hidden items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs group-hover:flex">
          <span className="text-white/60">Pulse</span>
          <span className="font-semibold text-emerald-300">78</span>
        </div>
      </div>
    </aside>
  );
}

// ---------- Main ----------
function PulseTasks() {
  const tasks = useTasks();
  const [aiActive, setAiActive] = useState(false);
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { tasksStore.hydrate(); }, []);

  const counts = useMemo(() => {
    const open = tasks.filter((t) => !t.done).length;
    const todayDone = tasks.filter((t) => t.done && t.completedAt && Date.now() - t.completedAt < 86_400_000).length;
    return { open, todayDone };
  }, [tasks]);

  async function ask(message: string) {
    setError(null);
    setAiActive(true);
    setPanel({ body: "Thinking…", followUps: [], suggestions: [] });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          taskContext: tasks.filter((t) => !t.done).map((t) => ({
            id: t.id, title: t.title, priority: t.priority, due: t.due, group: t.group,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI error");
      const parsed = parseAiText(data.text);
      // Auto-add any tasks the AI captured from the user's message
      const added = parsed.suggestions.map((s) =>
        tasksStore.add({
          title: s.title,
          priority: (s.priority as Priority) || "medium",
          due: s.due,
        }).id,
      );
      setPanel({ ...parsed, addedIds: added });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setPanel(null);
    } finally {
      setAiActive(false);
    }
  }

  function submit() {
    const v = input.trim();
    if (!v) return;
    setInput("");
    ask(v);
  }

  function startMic() {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) { setError("Voice input not supported in this browser"); return; }
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e: any) => setInput(e.results[0][0].transcript);
    r.onerror = () => setError("Mic error");
    r.start();
  }

  const quickActions = [
    "Break it down",
    "Rescue me",
    "Plan my day",
    "Habit check",
  ];

  return (
    <div className="min-h-screen pl-[52px]">
      <Sidebar />

      {/* Top navbar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-white/5 bg-[#0d0f14]/70 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Pulse Tasks</span>
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">2.0</span>
        </div>
        <div className="mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
          <Search className="size-4 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="h-full w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span
              className={`block size-2 rounded-full ${aiActive ? "bg-emerald-400 pulse-dot" : "bg-emerald-400/50"}`}
            />
            Gemini
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#a78bfa] to-[#4f8ef7] text-xs font-bold">YO</div>
        </div>
      </header>

      {/* Guest banner */}
      <div className="border-b border-white/5 bg-white/[0.02] px-6 py-2 text-center text-xs text-white/60">
        👋 You are in guest mode — this is a live demo of Pulse Tasks 2.0. Sign in with Google to save your real tasks.
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Hero */}
        <section className="glass-panel relative overflow-hidden p-8">
          <div className="mesh-bg" />
          <div className="dot-grid" />
          <div className="relative z-10">
            <h1 className="text-5xl font-bold tracking-tight">
              <span className="text-white">Tasks </span>
              <span className="gradient-text">2.0</span>
            </h1>
            <p className="mt-2 text-white/60">
              Don't forget yours.{" "}
              <span className="text-white/80">
                {counts.open} open · {counts.todayDone} done today
              </span>
            </p>
          </div>
        </section>

        {/* AI input bar */}
        <section className="relative mt-6">
          <div className="glass-panel flex items-center gap-3 p-3">
            <Sparkles className="ml-1 size-5 shrink-0 text-[#a78bfa]" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); if (panel) setPanel(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="Ask Gemini to plan your day, break down tasks, or rescue your schedule…"
              className="h-10 w-full bg-transparent text-[15px] text-white placeholder:text-white/40 focus:outline-none"
            />
            <button
              onClick={startMic}
              className="grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white"
              aria-label="Voice input"
            >
              <Mic className="size-4" />
            </button>
            <button
              onClick={submit}
              disabled={!input.trim() || aiActive}
              className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-[#4f8ef7] to-[#a78bfa] text-white shadow-lg shadow-[#4f8ef7]/20 disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {quickActions.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                <span className="text-[#a78bfa]">/</span> {q}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {panel && (
            <FloatingPanel
              parsed={panel}
              onClose={() => setPanel(null)}
              onFollowUp={(q) => ask(q)}
              onUndo={(id) => tasksStore.remove(id)}
            />
          )}
        </section>

        {/* Tasks */}
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-semibold text-white">Today's tasks</h2>
            <div className="text-sm text-white/50">{counts.open} open · {counts.todayDone} done</div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Column priority="high" title="High priority" tasks={tasks.filter((t) => t.priority === "high" && matchSearch(t, search))} onInsight={(t) => ask(`Give me insights on this task: "${t.title}"${t.due ? ` (due ${t.due})` : ""}. Why it matters, dependencies, risk.`)} />
            <Column priority="medium" title="Medium priority" tasks={tasks.filter((t) => t.priority === "medium" && matchSearch(t, search))} onInsight={(t) => ask(`Give me insights on this task: "${t.title}"${t.due ? ` (due ${t.due})` : ""}. Why it matters, dependencies, risk.`)} />
            <Column priority="low" title="Low priority" tasks={tasks.filter((t) => t.priority === "low" && matchSearch(t, search))} onInsight={(t) => ask(`Give me insights on this task: "${t.title}"${t.due ? ` (due ${t.due})` : ""}. Why it matters, dependencies, risk.`)} />
          </div>
        </section>
      </main>
    </div>
  );
}

function matchSearch(t: Task, q: string) {
  if (!q.trim()) return true;
  return t.title.toLowerCase().includes(q.toLowerCase());
}

// ---------- Floating panel ----------
function FloatingPanel({
  parsed, onClose, onFollowUp, onAdd,
}: {
  parsed: Parsed;
  onClose: () => void;
  onFollowUp: (q: string) => void;
  onAdd: (s: Suggestion) => void;
}) {
  const [added, setAdded] = useState<Set<number>>(new Set());
  return (
    <div className="slide-down glass-panel absolute left-0 right-0 top-[calc(100%+0.75rem)] z-10 p-5 shadow-2xl shadow-black/40">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#a78bfa]" />
          <span className="text-sm font-semibold text-white">Gemini</span>
        </div>
        <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white">
          <X className="size-4" />
        </button>
      </div>

      <MD text={parsed.body} />

      {parsed.suggestions.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs uppercase tracking-wide text-white/40">Suggested tasks</div>
          {parsed.suggestions.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${s.priority === "high" ? "bg-red-400" : s.priority === "low" ? "bg-emerald-400" : "bg-amber-400"}`} />
                <div>
                  <div className="text-sm text-white">{s.title}</div>
                  {s.due && <div className="text-xs text-white/40">{s.due}</div>}
                </div>
              </div>
              <button
                disabled={added.has(i)}
                onClick={() => { onAdd(s); setAdded((p) => new Set(p).add(i)); }}
                className="flex items-center gap-1 rounded-md bg-gradient-to-br from-[#4f8ef7] to-[#a78bfa] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {added.has(i) ? <><Check className="size-3" /> Added</> : <><Plus className="size-3" /> Add</>}
              </button>
            </div>
          ))}
        </div>
      )}

      {parsed.followUps.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-3">
          {parsed.followUps.map((q, i) => (
            <button
              key={i}
              onClick={() => onFollowUp(q)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:border-[#4f8ef7]/40 hover:bg-[#4f8ef7]/10 hover:text-white"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Column ----------
function Column({
  priority, title, tasks, onInsight,
}: {
  priority: Priority;
  title: string;
  tasks: Task[];
  onInsight: (t: Task) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");
  const dotColor = priority === "high" ? "bg-red-400" : priority === "low" ? "bg-emerald-400" : "bg-amber-400";
  const colClass = priority === "high" ? "col-high" : priority === "low" ? "col-low" : "col-medium";

  return (
    <div className={`${colClass} rounded-2xl p-4 backdrop-blur-md`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${dotColor}`} />
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        <span className="text-xs text-white/40">{tasks.filter((t) => !t.done).length}</span>
      </div>

      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} dotColor={dotColor} onInsight={() => onInsight(t)} />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/40">
            Nothing here.
          </div>
        )}
      </div>

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (val.trim()) tasksStore.add({ title: val.trim(), priority });
            setVal(""); setAdding(false);
          }}
          className="mt-2"
        >
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => { if (!val.trim()) setAdding(false); }}
            placeholder="New task…"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
          />
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/50 hover:bg-white/5 hover:text-white"
        >
          <Plus className="size-4" /> Add Task
        </button>
      )}
    </div>
  );
}

function TaskRow({ task, dotColor, onInsight }: { task: Task; dotColor: string; onInsight: () => void }) {
  return (
    <div className="group fade-in flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.05]">
      <button
        onClick={() => tasksStore.toggle(task.id)}
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition ${
          task.done ? "border-emerald-400 bg-emerald-400/20" : "border-white/30 hover:border-white"
        }`}
        aria-label="Toggle"
      >
        {task.done && <Check className="size-3 text-emerald-300" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`size-1.5 shrink-0 rounded-full ${dotColor}`} />
          <span className={`truncate text-sm ${task.done ? "text-white/40 line-through" : "text-white"}`}>
            {task.title}
          </span>
        </div>
        {(task.group || task.due) && (
          <div className="mt-0.5 flex gap-2 pl-3.5 text-xs text-white/40">
            {task.group && <span>{task.group}</span>}
            {task.group && task.due && <span>·</span>}
            {task.due && <span>{task.due}</span>}
          </div>
        )}
      </div>
      <button
        onClick={onInsight}
        className="opacity-0 transition group-hover:opacity-100"
        aria-label="Insights"
        title="Insights"
      >
        <Lightbulb className="size-4 text-[#4f8ef7]" />
      </button>
    </div>
  );
}
