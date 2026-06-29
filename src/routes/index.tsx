import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home, Star, ListChecks, CalendarClock, Activity, History,
  Search, Sparkles, Mic, ArrowUp, X, Lightbulb, Plus, Check,
  LogOut, Clock, Trash2, User as UserIcon, ChevronRight, ChevronUp, Info,
} from "lucide-react";
import { tasksStore, useTasks, type Priority, type Task } from "@/lib/tasks";

export const Route = createFileRoute("/")({ component: PulseTasks });

// ============ Types & Parsing ============
type Block = { time: string; task: string; priority: Priority };
type Parsed = {
  intro: string;
  blocks: Block[];
  subtasks: string[];
  insights: string[];
  now?: string;
  habits: { name: string; status: string; note: string }[];
  suggestions: { title: string; priority: Priority; time?: string }[];
  quickOptions: string[];
  followUps: string[];
};

function parseAiText(raw: string): Parsed {
  const out: Parsed = {
    intro: "", blocks: [], subtasks: [], insights: [],
    habits: [], suggestions: [], quickOptions: [], followUps: [],
  };
  const lines = raw.split("\n");
  const introLines: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("TIME:") && line.includes("TASK:")) {
      const m = line.match(/TIME:\s*([^|]+)\|\s*TASK:\s*([^|]+)(?:\|\s*PRIORITY:\s*(\w+))?/i);
      if (m) out.blocks.push({ time: m[1].trim(), task: m[2].trim(), priority: (m[3]?.toLowerCase() as Priority) || "medium" });
    } else if (line.startsWith("SUBTASK:")) {
      out.subtasks.push(line.replace(/^SUBTASK:\s*/i, "").trim());
    } else if (line.startsWith("INSIGHT:")) {
      out.insights.push(line.replace(/^INSIGHT:\s*/i, "").trim());
    } else if (line.startsWith("NOW:")) {
      out.now = line.replace(/^NOW:\s*/i, "").trim();
    } else if (line.startsWith("HABIT:")) {
      const m = line.match(/HABIT:\s*([^|]+)\|\s*STATUS:\s*([^|]+)(?:\|\s*NOTE:\s*(.+))?/i);
      if (m) out.habits.push({ name: m[1].trim(), status: m[2].trim(), note: m[3]?.trim() || "" });
    } else if (line.startsWith("SUGGEST_TASK:")) {
      const m = line.match(/SUGGEST_TASK:\s*([^|]+)(?:\|\s*PRIORITY:\s*(\w+))?(?:\|\s*TIME:\s*(.+))?/i);
      if (m) out.suggestions.push({ title: m[1].trim(), priority: (m[2]?.toLowerCase() as Priority) || "medium", time: m[3]?.trim() });
    } else if (line.startsWith("QUICK_OPTIONS:")) {
      try { out.quickOptions = JSON.parse(line.replace(/^QUICK_OPTIONS:\s*/i, "")); } catch {}
    } else if (line.startsWith("FOLLOW_UPS:")) {
      try { out.followUps = JSON.parse(line.replace(/^FOLLOW_UPS:\s*/i, "")); } catch {}
    } else {
      introLines.push(line);
    }
  }
  out.intro = introLines.join(" ").trim();
  return out;
}

// Render text with inline teal time pills
const TIME_RE = /\b(\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)|today|tomorrow|tonight|this (morning|afternoon|evening)|tomorrow (morning|afternoon|evening)|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/gi;
function withTimePills(text: string) {
  const parts: (string | { pill: string })[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ pill: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) =>
    typeof p === "string"
      ? <span key={i}>{p}</span>
      : <span key={i} className="time-pill"><Clock className="size-3" />{p.pill}</span>
  );
}

// ============ Profile / Greeting ============
interface Profile { name: string; title: string; initials: string; email: string; phone: string; aiContext: string; pulseScore: number; }
const DEFAULT_PROFILE: Profile = {
  name: "Jitesh", title: "Chief of Staff", initials: "JI",
  email: "", phone: "", aiContext: "", pulseScore: 78,
};
const PROFILE_KEY = "pulse:profile:v1";
function loadProfile(): Profile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try { const raw = localStorage.getItem(PROFILE_KEY); if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }; } catch {}
  return DEFAULT_PROFILE;
}
function saveProfile(p: Profile) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {} }

function timeGreeting(name: string) {
  const h = new Date().getHours();
  const period = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${period}, ${name}.`;
}

// ============ Chat history ============
type ChatMsg = { role: "user" | "ai"; text: string; parsed?: Parsed; ts: number };
type ChatSession = { id: string; messages: ChatMsg[]; startedAt: number };
const CHAT_KEY = "pulse:chat-sessions:v1";
function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"); } catch { return []; }
}
function saveSessions(s: ChatSession[]) { try { localStorage.setItem(CHAT_KEY, JSON.stringify(s)); } catch {} }

// ============ Typewriter ============
function useTypewriter(full: string, speed = 22) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    if (!full) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setOut(full.slice(0, i));
      if (i >= full.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [full, speed]);
  return out;
}

// ============ Sidebar ============
type Page = "home" | "starred" | "lists" | "plan" | "habits" | "previous";
const navItems: { key: Page; icon: typeof Home; label: string; badge?: string }[] = [
  { key: "home", icon: Home, label: "Home" },
  { key: "starred", icon: Star, label: "Starred" },
  { key: "lists", icon: ListChecks, label: "All Lists" },
  { key: "plan", icon: CalendarClock, label: "Today's Plan", badge: "AI" },
  { key: "habits", icon: Activity, label: "Habit Tracker" },
  { key: "previous", icon: History, label: "Previous Tasks" },
];

function Sidebar({ page, setPage, profile, onAvatar }: { page: Page; setPage: (p: Page) => void; profile: Profile; onAvatar: () => void }) {
  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-[60px] flex-col justify-between border-r border-white/5 bg-white/[0.02] py-4 backdrop-blur-xl">
      <div className="flex flex-col items-center gap-1 px-2">
        {navItems.map((it) => {
          const active = page === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setPage(it.key)}
              title={it.label}
              className={`relative grid size-10 place-items-center rounded-xl transition-all duration-200 ${active ? "bg-[#4f8ef7]/15 text-[#7dafff]" : "text-white/45 hover:bg-white/5 hover:text-white"}`}
            >
              {active && <span className="absolute left-[-10px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#4f8ef7]" />}
              <it.icon className="size-5" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>
      <div className="flex flex-col items-center gap-2 px-2">
        <button onClick={onAvatar} title={profile.name} className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#a78bfa] to-[#4f8ef7] text-xs font-bold text-white transition hover:scale-105">{profile.initials}</button>
      </div>
    </aside>
  );
}

// ============ Main ============
function PulseTasks() {
  const tasks = useTasks();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [page, setPage] = useState<Page>("home");
  const [aiActive, setAiActive] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [search, setSearch] = useState("");
  const [scorePop, setScorePop] = useState(false);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    tasksStore.hydrate();
    setProfile(loadProfile());
    setSessions(loadSessions());
  }, []);

  // greeting message
  useEffect(() => {
    if (messages.length === 0 && profile.name) {
      const open = tasksStore.get().filter((t) => !t.done);
      const urgent = open.find((t) => t.priority === "high");
      const greet = `${timeGreeting(profile.name)} You have ${open.length} open tasks${urgent ? `, most urgent: ${urgent.title}${urgent.due ? ` at ${urgent.due}` : ""}` : ""}. How can I help you crush today?`;
      setMessages([{ role: "ai", text: greet, ts: Date.now() }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.name]);

  const counts = useMemo(() => {
    const open = tasks.filter((t) => !t.done).length;
    const todayDone = tasks.filter((t) => t.done && t.completedAt && Date.now() - t.completedAt < 86_400_000).length;
    return { open, todayDone };
  }, [tasks]);

  function bumpScore() {
    const next = { ...profile, pulseScore: profile.pulseScore + 2 };
    setProfile(next); saveProfile(next);
    setScorePop(true); setTimeout(() => setScorePop(false), 650);
  }

  function toggleTask(id: string, e?: React.MouseEvent) {
    const t = tasks.find((x) => x.id === id);
    const wasDone = t?.done;
    tasksStore.toggle(id);
    if (!wasDone) {
      bumpScore();
      if (e) {
        const fid = Date.now();
        setFloats((f) => [...f, { id: fid, x: e.clientX, y: e.clientY }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== fid)), 1000);
      }
    }
  }

  async function ask(message: string) {
    setError(null);
    setAiActive(true);
    const userMsg: ChatMsg = { role: "user", text: message, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          profile: profile.aiContext,
          taskContext: tasks.filter((t) => !t.done).map((t) => ({
            id: t.id, title: t.title, priority: t.priority, due: t.due, group: t.group,
          })),
          history: next.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI error");
      const parsed = parseAiText(data.text);
      // Auto-add captured tasks
      for (const s of parsed.suggestions) {
        tasksStore.add({ title: s.title, priority: s.priority, due: s.time });
      }
      const aiMsg: ChatMsg = { role: "ai", text: data.text, parsed, ts: Date.now() };
      const finalMsgs = [...next, aiMsg];
      setMessages(finalMsgs);
      // persist session
      const sid = sessions[0]?.id && Date.now() - (sessions[0]?.startedAt || 0) < 3600_000
        ? sessions[0].id
        : "s-" + Date.now();
      const updatedSessions = sessions[0]?.id === sid
        ? sessions.map((s) => s.id === sid ? { ...s, messages: finalMsgs } : s)
        : [{ id: sid, messages: finalMsgs, startedAt: Date.now() }, ...sessions];
      setSessions(updatedSessions); saveSessions(updatedSessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setAiActive(false);
    }
  }

  function submit() {
    const v = input.trim(); if (!v) return;
    setInput(""); ask(v);
  }

  function startMic() {
    const W = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) { setError("Voice input not supported in this browser"); return; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = false;
    r.onresult = (e: any) => setInput(e.results[0][0].transcript);
    r.onerror = () => setError("Mic error");
    r.start();
  }

  function clearChat() {
    setMessages([]);
  }

  const quickActions = ["Break it down", "Rescue me", "Plan my day", "Habit check"];

  return (
    <div className="min-h-screen pl-[60px]">
      <div className="page-mesh" />
      <Sidebar page={page} setPage={setPage} profile={profile} onAvatar={() => setShowProfile(true)} />

      {/* Vertical PULSE AI label */}
      <div className="pointer-events-none fixed right-3 top-1/2 z-20 -translate-y-1/2 select-none text-[10px] font-semibold tracking-[0.3em] text-white/30" style={{ writingMode: "vertical-rl" }}>
        PULSE AI
      </div>

      {/* Floating +2 */}
      {floats.map((f) => (
        <div key={f.id} className="pointer-events-none fixed z-50 float-up text-sm font-bold text-emerald-300" style={{ left: f.x, top: f.y }}>
          +2
        </div>
      ))}

      {/* Top navbar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-white/5 bg-[#0d0f14]/70 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-full bg-[#4f8ef7]">
            <Check className="size-4 text-white" strokeWidth={3} />
          </div>
          <span className="text-sm font-semibold text-white">Pulse Tasks</span>
          <span className="text-[11px] font-medium text-white/40">2.0</span>
        </div>
        <div className="mx-auto flex h-9 w-full max-w-xl items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-4">
          <Search className="size-4 text-white/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="h-full w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${aiActive ? "border-emerald-400/40 bg-emerald-400/5 text-emerald-200" : "border-white/10 bg-white/[0.03] text-white/70"}`}>
            <span className={`block size-1.5 rounded-full ${aiActive ? "bg-emerald-400 pulse-dot" : "bg-emerald-400"}`} />
            {aiActive ? "Gemini thinking" : "Gemini standby"}
          </div>
          <button onClick={() => setShowHistory(true)} className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/5 hover:text-white" aria-label="History">
            <Sparkles className="size-4" />
          </button>
          <button onClick={() => setShowProfile(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#a78bfa] to-[#4f8ef7] text-xs font-bold transition hover:scale-105">{profile.initials}</button>
          <button className="grid size-8 place-items-center rounded-lg text-white/40 hover:text-white" aria-label="Sign out"><LogOut className="size-4" /></button>
        </div>
      </header>

      <div className="border-b border-white/5 bg-white/[0.02] px-6 py-2 text-center text-xs text-white/60">
        You are in guest mode &mdash; this is a live demo of Pulse Tasks 2.0. Sign in with Google to save your real tasks.
      </div>

      {/* Bottom score chip */}
      <div className={`fixed bottom-4 right-4 z-30 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0d0f14]/80 px-3 py-1.5 text-xs backdrop-blur-xl ${scorePop ? "score-pop" : ""}`}>
        <Info className="size-3.5 text-white/40" />
        <span className="font-semibold text-white">{profile.pulseScore}</span>
        <ChevronUp className="size-3 text-white/40" />
      </div>


      <main className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        {page === "home" && (
          <HomePage
            tasks={tasks} counts={counts} input={input} setInput={setInput}
            aiActive={aiActive} ask={ask} submit={submit} startMic={startMic}
            quickActions={quickActions} messages={messages} clearChat={clearChat}
            error={error} search={search} onToggle={toggleTask}
            onStar={(id) => { const t = tasks.find((x) => x.id === id); tasksStore.update(id, { starred: !t?.starred }); }}
          />
        )}
        {page === "starred" && <StarredPage tasks={tasks} onToggle={toggleTask} onStar={(id) => { const t = tasks.find((x) => x.id === id); tasksStore.update(id, { starred: !t?.starred }); }} />}
        {page === "plan" && <PlanPage tasks={tasks} onToggle={toggleTask} ask={ask} />}
        {page === "habits" && <HabitsPage tasks={tasks} profile={profile} />}
        {page === "previous" && <PreviousPage tasks={tasks} />}
        {page === "lists" && <div className="glass-panel p-10 text-center text-white/60">All Lists view coming soon.</div>}
      </main>

      {showHistory && <HistoryPanel sessions={sessions} onClose={() => setShowHistory(false)} onPick={(s) => { setMessages(s.messages); setShowHistory(false); }} onClear={() => { setSessions([]); saveSessions([]); }} />}
      {showProfile && <ProfileModal profile={profile} onSave={(p) => { setProfile(p); saveProfile(p); setShowProfile(false); }} onClose={() => setShowProfile(false)} />}
    </div>
  );
}

// ============ Home Page ============
function HomePage({ tasks, counts, input, setInput, aiActive, ask, submit, startMic, quickActions, messages, clearChat, error, search, onToggle, onStar }: {
  tasks: Task[]; counts: { open: number; todayDone: number };
  input: string; setInput: (s: string) => void; aiActive: boolean;
  ask: (m: string) => void; submit: () => void; startMic: () => void;
  quickActions: string[]; messages: ChatMsg[]; clearChat: () => void;
  error: string | null; search: string;
  onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void;
}) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length]);

  return (
    <>
      <section className="glass-panel relative overflow-hidden p-8">
        <div className="mesh-bg" />
        <div className="dot-grid" />
        <div className="relative z-10">
          <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
            <span className="text-white">Tasks </span>
            <span className="gradient-text">2.0</span>
          </h1>
          <p className="mt-2 text-white/60">
            Don't forget yours.{" "}
            <span className="text-white/80">{counts.open} open · {counts.todayDone} done today</span>
          </p>
        </div>
      </section>

      {/* AI input bar */}
      <section className="mt-6">
        <div className="glass-panel breath-glow flex items-center gap-3 p-3">
          <Sparkles className={`ml-1 size-5 shrink-0 text-[#a78bfa] ${aiActive ? "animate-spin" : ""}`} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Ask Gemini — plan my day, break down a task, or rescue my schedule..."
            className="h-10 w-full bg-transparent text-[15px] text-white placeholder:text-white/40 focus:outline-none"
          />
          <button onClick={startMic} className="grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white" aria-label="Voice"><Mic className="size-4" /></button>
          <button onClick={submit} disabled={!input.trim() || aiActive} className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-[#4f8ef7] to-[#a78bfa] text-white shadow-lg shadow-[#4f8ef7]/20 transition hover:-translate-y-px disabled:opacity-40" aria-label="Send"><ArrowUp className="size-4" /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickActions.map((q) => (
            <button key={q} onClick={() => ask(q)} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.07] hover:text-white">
              <span className="text-[#a78bfa]">/</span> {q}
            </button>
          ))}
        </div>
        {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      </section>

      {/* Inline chat area */}
      {messages.length > 0 && (
        <section className="slide-down mt-4 glass-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-[#a78bfa]" /><span className="text-sm font-semibold text-white">Gemini</span></div>
            <button onClick={clearChat} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/50 hover:bg-white/5 hover:text-white"><Trash2 className="size-3" /> Clear chat</button>
          </div>
          <div className="max-h-[480px] space-y-4 overflow-y-auto pr-2">
            {messages.map((m, i) => m.role === "user"
              ? <UserBubble key={i} text={m.text} />
              : <AiBubble key={i} msg={m} isLatest={i === messages.length - 1} onFollowUp={ask} onOption={ask} />
            )}
            <div ref={chatEndRef} />
          </div>
        </section>
      )}

      {/* Tasks board */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-semibold text-white">Today's tasks</h2>
          <div className="text-sm text-white/50">{counts.open} open · {counts.todayDone} done</div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["high", "medium", "low"] as Priority[]).map((p) => (
            <Column key={p} priority={p} title={`${p[0].toUpperCase() + p.slice(1)} priority`}
              tasks={tasks.filter((t) => t.priority === p && matchSearch(t, search))}
              onInsight={(t) => ask(`Give me insights on this task: "${t.title}"${t.due ? ` (due ${t.due})` : ""}.`)}
              onToggle={onToggle} onStar={onStar}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-[#4f8ef7]/20 border border-[#4f8ef7]/30 px-4 py-2 text-sm text-white">{withTimePills(text)}</div>
    </div>
  );
}

function AiBubble({ msg, isLatest, onFollowUp, onOption }: { msg: ChatMsg; isLatest: boolean; onFollowUp: (q: string) => void; onOption: (q: string) => void }) {
  const intro = msg.parsed?.intro || (msg.parsed ? "" : msg.text);
  const typed = useTypewriter(isLatest ? intro : "", 18);
  const display = isLatest ? typed : intro;
  const p = msg.parsed;

  return (
    <div className="flex gap-2">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#4f8ef7] to-[#a78bfa]"><Sparkles className="size-3.5 text-white" /></div>
      <div className="min-w-0 flex-1 space-y-3">
        {display && <div className="text-[15px] leading-relaxed text-white/90">{withTimePills(display)}</div>}

        {p?.now && (
          <div className="rounded-xl border border-[#4f8ef7]/30 bg-[#4f8ef7]/10 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#a78bfa]">Do this now</div>
            <div className="mt-1 text-sm font-semibold text-white">{withTimePills(p.now)}</div>
          </div>
        )}

        {p && p.blocks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Today's plan</div>
            {p.blocks.map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <span className={`size-2 rounded-full ${dotColor(b.priority)}`} />
                <span className="time-pill"><Clock className="size-3" />{b.time}</span>
                <span className="flex-1 text-sm text-white">{b.task}</span>
              </div>
            ))}
          </div>
        )}

        {p && p.subtasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Subtasks</div>
            {p.subtasks.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="text-sm text-white/90">{s}</span>
                <button onClick={() => { tasksStore.add({ title: s, priority: "medium" }); }} className="flex items-center gap-1 text-xs text-[#4f8ef7] hover:text-white"><Plus className="size-3" /> Add</button>
              </div>
            ))}
          </div>
        )}

        {p && p.insights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.insights.map((s, i) => (
              <div key={i} className="rounded-full border border-[#a78bfa]/30 bg-[#a78bfa]/10 px-3 py-1.5 text-xs text-white/90">{s}</div>
            ))}
          </div>
        )}

        {p && p.habits.length > 0 && (
          <div className="space-y-1.5">
            {p.habits.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                <span className="text-white">{h.name}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${h.status.includes("on") ? "text-emerald-300" : h.status.includes("risk") ? "text-amber-300" : "text-red-300"}`}>{h.status}</span>
                  <span className="text-xs text-white/50">{h.note}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {p && p.suggestions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80">Added to your board</div>
            {p.suggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${dotColor(s.priority)}`} />
                  <span className="text-sm text-white">{s.title}</span>
                  {s.time && <span className="time-pill"><Clock className="size-3" />{s.time}</span>}
                </div>
                <Check className="size-4 text-emerald-300" />
              </div>
            ))}
          </div>
        )}

        {p && p.quickOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {p.quickOptions.map((q, i) => (
              <button key={i} onClick={() => onOption(q)} className="rounded-lg border border-[#4f8ef7]/30 bg-[#4f8ef7]/10 px-3 py-1.5 text-xs text-white transition hover:-translate-y-px hover:bg-[#4f8ef7]/20">{q}</button>
            ))}
          </div>
        )}

        {p && p.followUps.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-white/5 pt-3">
            {p.followUps.map((q, i) => (
              <button key={i} onClick={() => onFollowUp(q)} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition hover:-translate-y-px hover:border-[#4f8ef7]/40 hover:bg-[#4f8ef7]/10 hover:text-white">{q}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function dotColor(p: Priority) {
  return p === "high" ? "bg-red-400" : p === "low" ? "bg-emerald-400" : "bg-amber-400";
}

function matchSearch(t: Task, q: string) {
  if (!q.trim()) return true;
  return t.title.toLowerCase().includes(q.toLowerCase());
}

// ============ Column ============
function Column({ priority, title, tasks, onInsight, onToggle, onStar }: {
  priority: Priority; title: string; tasks: Task[];
  onInsight: (t: Task) => void; onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");
  const colClass = priority === "high" ? "col-high" : priority === "low" ? "col-low" : "col-medium";

  return (
    <div className={`${colClass} rounded-2xl p-4 backdrop-blur-md`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${dotColor(priority)}`} /><span className="text-sm font-semibold text-white">{title}</span></div>
        <span className="text-xs text-white/40">{tasks.filter((t) => !t.done).length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => <TaskRow key={t.id} task={t} onInsight={() => onInsight(t)} onToggle={onToggle} onStar={onStar} />)}
        {tasks.length === 0 && <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/40">Nothing here.</div>}
      </div>
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); if (val.trim()) tasksStore.add({ title: val.trim(), priority }); setVal(""); setAdding(false); }} className="mt-2">
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => { if (!val.trim()) setAdding(false); }} placeholder="New task..." className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none" />
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/50 transition hover:bg-white/5 hover:text-white"><Plus className="size-4" /> Add Task</button>
      )}
    </div>
  );
}

function TaskRow({ task, onInsight, onToggle, onStar }: { task: Task; onInsight: () => void; onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void }) {
  return (
    <div className="group fade-in flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:-translate-y-px hover:border-white/15 hover:bg-white/[0.05]">
      <button onClick={(e) => onToggle(task.id, e)} className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition ${task.done ? "border-emerald-400 bg-emerald-400/20" : "border-white/30 hover:border-white"}`} aria-label="Toggle">
        {task.done && <Check className="size-3 text-emerald-300" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`size-1.5 shrink-0 rounded-full ${dotColor(task.priority)}`} />
          <span className={`truncate text-sm ${task.done ? "text-white/40 line-through" : "text-white"}`}>{task.title}</span>
        </div>
        {(task.group || task.due) && (
          <div className="mt-0.5 flex items-center gap-2 pl-3.5 text-xs text-white/40">
            {task.group && <span>{task.group}</span>}
            {task.group && task.due && <span>·</span>}
            {task.due && <span className="time-pill"><Clock className="size-3" />{task.due}</span>}
          </div>
        )}
      </div>
      <button onClick={() => onStar(task.id)} className="transition hover:scale-110" aria-label="Star">
        <Star className={`size-4 transition ${task.starred ? "fill-amber-300 text-amber-300" : "text-white/30 hover:text-white/60"}`} />
      </button>
      <button onClick={onInsight} className="opacity-0 transition group-hover:opacity-100" aria-label="Insights" title="Insights"><Lightbulb className="size-4 text-[#4f8ef7]" /></button>
    </div>
  );
}

// ============ Starred ============
function StarredPage({ tasks, onToggle, onStar }: { tasks: Task[]; onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void }) {
  const starred = tasks.filter((t) => t.starred);
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-white">Starred tasks</h2>
      <div className="glass-panel p-4">
        {starred.length === 0 ? (
          <div className="px-3 py-12 text-center text-sm text-white/50">No starred tasks yet. Tap the star on any task to pin it here.</div>
        ) : (
          <div className="space-y-2">
            {starred.map((t) => <TaskRow key={t.id} task={t} onInsight={() => {}} onToggle={onToggle} onStar={onStar} />)}
          </div>
        )}
      </div>
    </section>
  );
}

// ============ Today's Plan (timeline) ============
function PlanPage({ tasks, onToggle, ask }: { tasks: Task[]; onToggle: (id: string, e?: React.MouseEvent) => void; ask: (q: string) => void }) {
  const open = tasks.filter((t) => !t.done);
  // Naive time order: tasks with "AM/PM" or hour first, else by priority
  const sorted = [...open].sort((a, b) => {
    const pa = parseHour(a.due); const pb = parseHour(b.due);
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    const pr: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    return pr[a.priority] - pr[b.priority];
  });
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Today</div>
          <h2 className="mt-1 text-xl font-semibold text-white">Today's plan · {today}</h2>
        </div>
        <span className="rounded-md bg-gradient-to-br from-[#4f8ef7] to-[#a78bfa] px-2 py-0.5 text-[10px] font-semibold text-white">AI</span>
      </div>
      <div className="glass-panel p-5">
        <div className="space-y-3">
          {sorted.map((t) => (
            <div key={t.id} className={`flex items-center gap-3 rounded-lg border-l-2 bg-white/[0.03] p-3 transition hover:-translate-y-px hover:bg-white/[0.06] ${t.priority === "high" ? "border-red-400" : t.priority === "low" ? "border-emerald-400" : "border-amber-400"}`}>
              <span className="time-pill"><Clock className="size-3" />{t.due || "Anytime"}</span>
              <div className="flex-1">
                <div className="text-sm text-white">{t.title}</div>
                {t.group && <div className="text-xs text-white/40">{t.group}</div>}
              </div>
              <button onClick={(e) => onToggle(t.id, e)} className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70 transition hover:border-emerald-400/40 hover:text-white">Mark done</button>
              <button onClick={() => ask(`Insights on "${t.title}"${t.due ? ` (due ${t.due})` : ""}.`)} className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70 transition hover:border-[#4f8ef7]/40 hover:text-white"><Lightbulb className="mr-1 inline size-3" />Insights</button>
            </div>
          ))}
          {sorted.length === 0 && <div className="px-3 py-12 text-center text-sm text-white/50">Nothing scheduled. Take a breath.</div>}
        </div>
      </div>
      <button onClick={() => ask("Plan my day with my current tasks. Use TIME blocks.")} className="glass-panel flex w-full items-center justify-center gap-2 p-4 text-sm text-white/80 transition hover:-translate-y-px hover:bg-white/[0.06]">
        <Sparkles className="size-4 text-[#a78bfa]" /> Ask Gemini to optimize this plan
      </button>
    </section>
  );
}
function parseHour(due?: string): number | null {
  if (!due) return null;
  const m = due.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1]); const min = m[2] ? parseInt(m[2]) : 0;
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h * 60 + min;
}

// ============ Habits ============
function HabitsPage({ tasks, profile }: { tasks: Task[]; profile: Profile }) {
  const [range, setRange] = useState<"7" | "15" | "30">("7");
  const done = tasks.filter((t) => t.done);
  const onTime = done.length ? Math.round((done.length / Math.max(tasks.length, 1)) * 100) : 0;
  // synthetic chart for last 7 days
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1), v: 2 + ((i * 3 + done.length) % 6) };
  });
  const maxV = Math.max(...days.map((d) => d.v), 1);
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Pulse · Analytics</div>
          <h2 className="mt-1 text-xl font-semibold text-white">Habit tracker</h2>
          <p className="mt-1 text-sm text-white/50">Quiet telemetry on consistency, focus windows, and execution velocity.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs">
          {(["7", "15", "30"] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-md px-2.5 py-1 transition ${range === r ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>{r} DAYS</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass-panel p-5 lg:col-span-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Pulse rating</div>
          <div className="mt-3 flex items-center gap-4">
            <Ring value={profile.pulseScore} />
            <div>
              <div className="text-3xl font-bold text-white">{profile.pulseScore}</div>
              <div className="text-xs text-emerald-300">3 day streak · longest 5d</div>
            </div>
          </div>
          <p className="mt-4 text-xs text-white/60">You completed {done.length} tasks this week, holding a 3-day productivity streak. Watch financial deadlines due in 3 days.</p>
        </div>
        <div className="glass-panel p-5 lg:col-span-2">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Completed" v={done.length} />
            <Stat label="On-time %" v={`${onTime}%`} />
            <Stat label="Avg tasks/day" v={(done.length / 7).toFixed(1)} />
          </div>
          <div className="mt-6">
            <div className="mb-2 flex items-end justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Consistency · 7 days</div>
              <div className="text-xs text-white/50">Peak: 10:00</div>
            </div>
            <div className="flex h-32 items-end gap-2">
              {days.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-[#4f8ef7] to-[#a78bfa] transition-all" style={{ height: `${(d.v / maxV) * 100}%` }} />
                  <span className="text-[10px] text-white/40">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel p-5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Task density by category</div>
        <div className="mt-3 space-y-2.5">
          {[
            { l: "Work & engineering", v: 72 },
            { l: "Study & reading", v: 85 },
            { l: "Personal & health", v: 55 },
            { l: "Finance & payments", v: 92 },
          ].map((b) => (
            <div key={b.l}>
              <div className="mb-1 flex justify-between text-xs"><span className="text-white/70">{b.l}</span><span className="text-white/50">{b.v}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full bg-gradient-to-r from-[#4f8ef7] to-[#a78bfa]" style={{ width: `${b.v}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function Ring({ value }: { value: number }) {
  const c = 2 * Math.PI * 28;
  const off = c - (Math.min(value, 100) / 100) * c;
  return (
    <svg width="80" height="80" viewBox="0 0 64 64" className="-rotate-90">
      <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
      <circle cx="32" cy="32" r="28" stroke="url(#g)" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0%" stopColor="#4f8ef7" /><stop offset="100%" stopColor="#a78bfa" /></linearGradient></defs>
    </svg>
  );
}
function Stat({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{v}</div>
    </div>
  );
}

// ============ Previous ============
function PreviousPage({ tasks }: { tasks: Task[] }) {
  const [q, setQ] = useState("");
  const completed = tasks.filter((t) => t.done && t.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const groups: Record<string, Task[]> = {};
  for (const t of completed) {
    const d = new Date(t.completedAt || 0); const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const key = sameDay ? "Today" : d.toDateString() === yest.toDateString() ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    (groups[key] ||= []).push(t);
  }
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-xl font-semibold text-white">Previous tasks</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter..." className="h-9 w-64 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none" />
      </div>
      {Object.keys(groups).length === 0 && <div className="glass-panel px-3 py-12 text-center text-sm text-white/50">No completed tasks yet.</div>}
      {Object.entries(groups).map(([k, list]) => (
        <div key={k}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">{k}</div>
          <div className="glass-panel space-y-2 p-3">
            {list.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-2 py-1.5">
                <Check className="size-4 text-emerald-300" />
                <span className={`size-1.5 rounded-full ${dotColor(t.priority)}`} />
                <span className="flex-1 text-sm text-white/50 line-through">{t.title}</span>
                {t.due && <span className="time-pill"><Clock className="size-3" />{t.due}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

// ============ History Panel ============
function HistoryPanel({ sessions, onClose, onPick, onClear }: { sessions: ChatSession[]; onClose: () => void; onPick: (s: ChatSession) => void; onClear: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="slide-down fixed right-0 top-0 z-50 flex h-screen w-[340px] flex-col border-l border-white/10 bg-[#0d0f14]/95 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="text-sm font-semibold text-white">Chat history</span>
          <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {sessions.length === 0 && <div className="px-2 py-8 text-center text-sm text-white/50">No conversations yet.</div>}
          {sessions.map((s) => {
            const first = s.messages.find((m) => m.role === "user")?.text || s.messages[0]?.text || "Conversation";
            return (
              <button key={s.id} onClick={() => onPick(s)} className="w-full rounded-lg border border-white/5 bg-white/[0.02] p-3 text-left transition hover:-translate-y-px hover:border-white/15 hover:bg-white/[0.05]">
                <div className="truncate text-sm text-white">{first.slice(0, 50)}</div>
                <div className="mt-1 text-[10px] text-white/40">{new Date(s.startedAt).toLocaleString()}</div>
              </button>
            );
          })}
        </div>
        {sessions.length > 0 && (
          <button onClick={() => { if (confirm("Clear all chat history?")) onClear(); }} className="border-t border-white/5 p-3 text-xs text-red-300 hover:bg-red-500/10">Clear all history</button>
        )}
      </div>
    </>
  );
}

// ============ Profile Modal ============
function ProfileModal({ profile, onSave, onClose }: { profile: Profile; onSave: (p: Profile) => void; onClose: () => void }) {
  const [p, setP] = useState(profile);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="slide-down fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 glass-panel p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-[#a78bfa] to-[#4f8ef7] text-xl font-bold text-white">{p.initials}</div>
            <div>
              <div className="text-lg font-semibold text-white">Your profile</div>
              <div className="text-xs text-white/50">The AI uses this to personalize every reply.</div>
            </div>
          </div>
          <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white"><X className="size-4" /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Field label="Full name" v={p.name} onChange={(v) => setP({ ...p, name: v, initials: v.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase() })} />
          <Field label="Job title" v={p.title} onChange={(v) => setP({ ...p, title: v })} />
          <Field label="Email" v={p.email} onChange={(v) => setP({ ...p, email: v })} />
          <Field label="Phone" v={p.phone} onChange={(v) => setP({ ...p, phone: v })} />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-white/70"><UserIcon className="size-3.5 text-[#a78bfa]" /> The AI knows you better when you fill this in</div>
          <textarea value={p.aiContext} onChange={(e) => setP({ ...p, aiContext: e.target.value })} rows={5}
            placeholder="Tell the AI about yourself — your job, clients, family, routines, goals. The more you share, the smarter your assistant gets."
            className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/40 focus:border-[#4f8ef7]/50 focus:outline-none" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancel</button>
          <button onClick={() => onSave(p)} className="rounded-md bg-gradient-to-br from-[#4f8ef7] to-[#a78bfa] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#4f8ef7]/20 transition hover:-translate-y-px">Save changes</button>
        </div>
      </div>
    </>
  );
}
function Field({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</span>
      <input value={v} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none" />
    </label>
  );
}
