import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home, Star, ListChecks, CalendarClock, Activity, History,
  Sparkles, Mic, X, Lightbulb, Plus, Check,
  LogOut, Clock, Trash2, User as UserIcon, ChevronUp, Info,
  PanelLeftClose, PanelLeftOpen, Inbox, Trophy, FolderKanban, Zap,
  CalendarDays, ListTodo,
} from "lucide-react";
import { tasksStore, useTasks, type Priority, type Task } from "@/lib/tasks";
import { allIntegrationItems, type IntegrationItem } from "@/lib/integrations";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { InteractiveDotGrid } from "@/components/InteractiveDotGrid";
import { Calendar } from "@/components/ui/calendar";

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
      try { out.quickOptions = JSON.parse(line.replace(/^QUICK_OPTIONS:\s*/i, "")); } catch { /* ignore */ }
    } else if (line.startsWith("FOLLOW_UPS:")) {
      try { out.followUps = JSON.parse(line.replace(/^FOLLOW_UPS:\s*/i, "")); } catch { /* ignore */ }
    } else {
      introLines.push(line);
    }
  }
  out.intro = introLines.join("\n").trim();
  return out;
}

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
  try { const raw = localStorage.getItem(PROFILE_KEY); if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return DEFAULT_PROFILE;
}
function saveProfile(p: Profile) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

function timeGreeting(name: string) {
  const h = new Date().getHours();
  const period = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${period}, ${name}`;
}

// ============ Chat history ============
type ChatMsg = { role: "user" | "ai"; text: string; parsed?: Parsed; ts: number };
type ChatSession = { id: string; messages: ChatMsg[]; startedAt: number };
const CHAT_KEY = "pulse:chat-sessions:v1";
function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"); } catch { return []; }
}
function saveSessions(s: ChatSession[]) { try { localStorage.setItem(CHAT_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

// ============ Sidebar ============
type Page = "home" | "starred" | "lists" | "plan" | "habits" | "previous";
const navItems: { key: Page; icon: typeof Home; label: string; badge?: string }[] = [
  { key: "home", icon: Home, label: "Home" },
  { key: "starred", icon: Star, label: "Starred" },
  { key: "lists", icon: ListChecks, label: "All lists" },
  { key: "plan", icon: CalendarClock, label: "Today's plan", badge: "AI" },
  { key: "habits", icon: Activity, label: "Habit tracker" },
];

const integrationLinks: { to: string; icon: typeof CalendarDays; label: string; badgeClass: string }[] = [
  { to: "/calendar", icon: CalendarDays, label: "Google Calendar", badgeClass: "text-blue-300" },
  { to: "/google-tasks", icon: ListTodo, label: "Google Tasks", badgeClass: "text-sky-300" },
];


const myLists = [
  { name: "My Tasks", icon: Inbox },
  { name: "Hackathon Tasks", icon: Trophy },
  { name: "Personal Inbox", icon: FolderKanban },
];

function Sidebar({
  page, setPage, profile, onAvatar, pinned, setPinned, hovered, setHovered,
}: {
  page: Page; setPage: (p: Page) => void; profile: Profile; onAvatar: () => void;
  pinned: boolean; setPinned: (b: boolean) => void;
  hovered: boolean; setHovered: (b: boolean) => void;
}) {
  const expanded = pinned || hovered;
  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed left-0 top-0 z-30 flex h-screen flex-col justify-between border-r border-white/5 bg-[#0d1119]/95 py-4 backdrop-blur-xl transition-[width] duration-200 ease-out"
      style={{ width: expanded ? 250 : 64 }}
    >
      <div className="flex flex-col gap-1 px-3">
        {/* Brand row + pin */}
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6]">
              <Check className="size-4 text-white" strokeWidth={3} />
            </div>
            {expanded && <span className="whitespace-nowrap text-sm font-semibold text-white">Pulse Tasks</span>}
          </div>
          {expanded && (
            <button onClick={() => setPinned(!pinned)} title={pinned ? "Unpin" : "Pin open"} className="grid size-7 shrink-0 place-items-center rounded-md text-white/40 hover:bg-white/5 hover:text-white">
              {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </button>
          )}
        </div>

        {navItems.map((it) => {
          const active = page === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setPage(it.key)}
              title={it.label}
              className={`group/btn relative flex h-10 items-center gap-3 rounded-xl px-2.5 text-sm transition-all duration-150 ${active ? "bg-[#5B8DEF]/15 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
            >
              {active && <span className="absolute left-[-12px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#5B8DEF]" />}
              <it.icon className="size-5 shrink-0" strokeWidth={1.75} />
              {expanded && (
                <>
                  <span className="flex-1 truncate text-left">{it.label}</span>
                  {it.badge && <span className="rounded bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">{it.badge}</span>}
                </>
              )}
            </button>
          );
        })}

        <div className="my-2 h-px bg-white/5" />

        <button
          onClick={() => setPage("previous")}
          title="Previous tasks"
          className={`flex h-10 items-center gap-3 rounded-xl px-2.5 text-sm transition ${page === "previous" ? "bg-[#5B8DEF]/15 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
        >
          <History className="size-5 shrink-0" strokeWidth={1.75} />
          {expanded && <span className="truncate">Previous tasks</span>}
        </button>

        <div className="my-2 h-px bg-white/5" />
        {expanded && <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">Integrations</div>}
        {integrationLinks.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            title={it.label}
            className="group/btn flex h-10 items-center gap-3 rounded-xl px-2.5 text-sm text-white/55 transition hover:bg-white/5 hover:text-white"
          >
            <it.icon className={`size-5 shrink-0 ${it.badgeClass}`} strokeWidth={1.75} />
            {expanded && <span className="flex-1 truncate text-left">{it.label}</span>}
          </Link>
        ))}


        {expanded && (
          <div className="mt-4">
            <div className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">My lists</div>
            <div className="flex flex-col gap-0.5">
              {myLists.map((l) => (
                <button key={l.name} className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-white/65 transition hover:bg-white/5 hover:text-white">
                  <l.icon className="size-4 shrink-0 text-white/40" strokeWidth={1.75} />
                  <span className="truncate">{l.name}</span>
                </button>
              ))}
              <button className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-white/40 transition hover:bg-white/5 hover:text-white">
                <Plus className="size-4 shrink-0" />
                <span>Create new list</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom user card */}
      <div className="px-3">
        <button
          onClick={onAvatar}
          className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-left transition hover:border-white/15 hover:bg-white/[0.06]"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] text-xs font-bold text-white">{profile.initials}</div>
          {expanded && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{profile.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300/90">Chief of Staff</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/55">
                <Zap className="size-3 text-amber-300" /> Pulse: <span className="font-semibold text-white">{profile.pulseScore}</span>
              </div>
            </div>
          )}
        </button>
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
  const [scorePop, setScorePop] = useState(false);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number }[]>([]);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    tasksStore.hydrate();
    setProfile(loadProfile());
    setSessions(loadSessions());
  }, []);

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
          currentTime: new Date().toISOString(),
          taskContext: tasks.filter((t) => !t.done).map((t) => ({
            id: t.id, title: t.title, priority: t.priority, due: t.due, group: t.group,
          })),
          history: next.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),

      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI error");
      const parsed = parseAiText(data.text);
      for (const s of parsed.suggestions) {
        tasksStore.add({ title: s.title, priority: s.priority, due: s.time });
      }
      const aiMsg: ChatMsg = { role: "ai", text: data.text, parsed, ts: Date.now() };
      const finalMsgs = [...next, aiMsg];
      setMessages(finalMsgs);
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

  function submit(text?: string) {
    const v = (text ?? input).trim(); if (!v) return;
    setInput(""); ask(v);
  }

  // Voice with silence detection + auto-send
  const recogRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopListening() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    try { recogRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }

  function startMic() {
    const W = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) { setError("Voice input not supported in this browser"); return; }
    const r = new SR();
    recogRef.current = r;
    r.lang = "en-US"; r.interimResults = true; r.continuous = true;
    let buffer = "";
    const resetSilence = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        try { r.stop(); } catch { /* ignore */ }
      }, 2000);
    };
    r.onresult = (e: any) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += tr; else interim += tr;
      }
      if (finalText) buffer += finalText;
      setInput((buffer + interim).trim());
      resetSilence();
    };
    r.onerror = () => { setError("Mic error"); stopListening(); };
    r.onend = () => {
      setListening(false);
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      const finalText = buffer.trim();
      if (finalText) {
        setInput("");
        ask(finalText);
      }
    };
    setListening(true);
    setError(null);
    r.start();
    resetSilence();
  }

  function clearChat() { setMessages([]); }

  const quickActions = ["Break it down", "Rescue me", "Plan my day", "Habit check"];
  const expanded = sidebarPinned || sidebarHovered;

  return (
    <div className="min-h-screen transition-[padding] duration-200 ease-out" style={{ paddingLeft: expanded ? 250 : 64 }}>
      <AnimatedBackground />
      <Sidebar
        page={page} setPage={setPage} profile={profile}
        onAvatar={() => setShowProfile(true)}
        pinned={sidebarPinned} setPinned={setSidebarPinned}
        hovered={sidebarHovered} setHovered={setSidebarHovered}
      />

      {/* Floating +2 */}
      {floats.map((f) => (
        <div key={f.id} className="pointer-events-none fixed z-50 float-up text-sm font-bold text-emerald-300" style={{ left: f.x, top: f.y }}>+2</div>
      ))}

      {/* Top mini bar */}
      <header className="sticky top-0 z-20 flex h-12 items-center justify-end gap-2 border-b border-white/5 bg-black/40 px-6 backdrop-blur-xl">
        <LiveClock />
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] transition ${aiActive ? "border-emerald-400/40 bg-emerald-400/5 text-emerald-200" : "border-white/10 bg-white/[0.03] text-white/60"}`}>
          <span className={`block size-1.5 rounded-full ${aiActive ? "bg-emerald-400 pulse-dot" : "bg-emerald-400/70"}`} />
          {aiActive ? "Gemini thinking" : "Gemini standby"}
        </div>
        <button onClick={() => setShowHistory(true)} className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/5 hover:text-white" aria-label="History">
          <History className="size-4" />
        </button>
        <Link to="/login" className="grid size-8 place-items-center rounded-lg text-white/40 hover:text-white" aria-label="Sign out"><LogOut className="size-4" /></Link>
      </header>


      {/* Pulse score chip */}
      <div className={`fixed bottom-4 right-4 z-30 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0d0f14]/80 px-3 py-1.5 text-xs backdrop-blur-xl ${scorePop ? "score-pop" : ""}`}>
        <Info className="size-3.5 text-white/40" />
        <span className="font-semibold text-white">{profile.pulseScore}</span>
        <ChevronUp className="size-3 text-white/40" />
      </div>

      <main className="relative z-10 mx-auto max-w-5xl px-8 py-10">
        {page === "home" && (
          <HomePage
            tasks={tasks} counts={counts} profile={profile}
            input={input} setInput={setInput}
            aiActive={aiActive} ask={ask} submit={submit}
            startMic={startMic} stopMic={stopListening} listening={listening}
            quickActions={quickActions} messages={messages} clearChat={clearChat}
            error={error}
            onToggle={toggleTask}
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
function HomePage({
  tasks, profile, input, setInput, aiActive, ask, submit, startMic, stopMic, listening,
  quickActions, messages, clearChat, error, onToggle, onStar,
}: {
  tasks: Task[]; counts: { open: number; todayDone: number }; profile: Profile;
  input: string; setInput: (s: string) => void; aiActive: boolean;
  ask: (m: string) => void; submit: (text?: string) => void;
  startMic: () => void; stopMic: () => void; listening: boolean;
  quickActions: string[]; messages: ChatMsg[]; clearChat: () => void;
  error: string | null;
  onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void;
}) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length]);

  return (
    <>
      {/* Hero: Tasks 2.0 — feathered edges */}
      <section className="feather-mask relative overflow-hidden rounded-3xl p-10 text-center">
        <div className="mesh-bg" />
        <InteractiveDotGrid baseOpacity={0.18} influence={160} />
        <div className="relative z-10">
          <h1 className="text-5xl font-semibold tracking-tight md:text-6xl">
            <span className="text-white">Tasks </span>
            <span className="gradient-text">2.0</span>
          </h1>
          <p className="mt-2 text-sm text-white/40">Don't forget yours.</p>
        </div>
      </section>

      {/* Greeting — below hero */}
      <div key={profile.name} className="greet-in mt-8">
        <div className="text-3xl font-semibold tracking-tight text-white md:text-4xl"><span className="wave-text">{timeGreeting(profile.name)}</span></div>
        <div className="mt-1 text-sm text-white/45">Here's your day at a glance.</div>
      </div>

      {/* Inline conversation — scrollable container so input bar stays sticky */}
      {messages.length > 0 && (
        <section className="slide-down mt-8 rounded-2xl border border-white/8 bg-[#121725]/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-[#8B5CF6]" /><span className="text-sm font-semibold text-white">Conversation</span></div>
            <button onClick={clearChat} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/50 hover:bg-white/5 hover:text-white"><Trash2 className="size-3" /> Clear</button>
          </div>
          <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
            {messages.map((m, i) => m.role === "user"
              ? <UserBubble key={i} text={m.text} />
              : <AiBubble key={i} msg={m} onFollowUp={ask} onOption={ask} />
            )}
            <div ref={chatEndRef} />
          </div>
        </section>
      )}

      {/* AI command bar — sticky so it stays pinned while content scrolls */}
      <section className="sticky bottom-4 z-20 mt-6">
        <div className="rounded-2xl border border-white/15 bg-[#121725]/90 p-3 shadow-2xl shadow-blue-900/40 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className={`grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] shadow-md shadow-[#5B8DEF]/30 ${aiActive ? "animate-pulse" : ""}`}>
              <Sparkles className="size-4 text-white" />
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="Ask anything or add a task..."
              className="h-9 w-full bg-transparent text-[15px] text-white placeholder:text-white/40 focus:outline-none"
            />
            <button
              onClick={listening ? stopMic : startMic}
              className={`relative grid size-9 shrink-0 place-items-center rounded-full transition ${listening ? "mic-ring bg-[#5B8DEF] text-white" : "border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"}`}
              aria-label="Voice"
            >
              <Mic className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 px-1">
            {quickActions.map((q) => (
              <button key={q} onClick={() => ask(q)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65 transition hover:-translate-y-px hover:border-white/25 hover:bg-white/[0.08] hover:text-white">
                <span className="text-white/35">/</span> {q}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      </section>

      {/* Today's tasks — includes Google Calendar + Google Tasks items */}
      <section className="mt-10">
        <h2 className="mb-5 text-lg font-semibold text-white">Today's tasks</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["high", "medium", "low"] as Priority[]).map((p) => (
            <Column key={p} priority={p} title={`${p[0].toUpperCase() + p.slice(1)} priority`}
              tasks={tasks.filter((t) => t.priority === p && !t.done)}
              integrations={allIntegrationItems().filter((i) => i.priority === p)}
              onInsight={(t) => ask(`Give me insights on "${t.title}"${t.due ? ` (due ${t.due})` : ""}.`)}
              onToggle={onToggle} onStar={onStar}
            />
          ))}
        </div>
      </section>


      {/* Drag handle + Previous tasks */}
      <section className="mt-12">
        <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-white/10" />
        <h2 className="mb-5 text-lg font-semibold text-white">Previous tasks</h2>
        <PreviousList tasks={tasks} />
      </section>
    </>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] px-4 py-2 text-sm font-medium text-white shadow-md shadow-[#5B8DEF]/20">{withTimePills(text)}</div>
    </div>
  );
}

function AiBubble({ msg, onFollowUp, onOption }: { msg: ChatMsg; onFollowUp: (q: string) => void; onOption: (q: string) => void }) {
  const p = msg.parsed;
  const intro = p?.intro || (p ? "" : msg.text);
  const introLines = intro.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6]"><Sparkles className="size-3.5 text-white" /></div>
      <div className="min-w-0 flex-1 space-y-3">
        {introLines.length > 0 && (
          <div className="space-y-1.5">
            {introLines.map((line, i) => (
              <div key={i} className="text-[15px] leading-relaxed text-white/90">{withTimePills(line)}</div>
            ))}
          </div>
        )}

        {p?.now && (
          <div className="rounded-xl border border-[#5B8DEF]/30 bg-[#5B8DEF]/10 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8B5CF6]">Do this now</div>
            <div className="mt-1 text-sm font-semibold text-white">{withTimePills(p.now)}</div>
          </div>
        )}

        {p && p.blocks.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Today's plan</div>
            {p.blocks.map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <span className={`size-2 rounded-full dot-${b.priority}`} />
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
                <button onClick={() => { tasksStore.add({ title: s, priority: "medium" }); }} className="flex items-center gap-1 text-xs text-[#5B8DEF] hover:text-white"><Plus className="size-3" /> Add</button>
              </div>
            ))}
          </div>
        )}

        {p && p.insights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.insights.map((s, i) => (
              <div key={i} className="rounded-full border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-3 py-1.5 text-xs text-white/90">{s}</div>
            ))}
          </div>
        )}

        {p && p.suggestions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80">Added to your board</div>
            {p.suggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full dot-${s.priority}`} />
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
              <button key={i} onClick={() => onOption(q)} className="rounded-lg border border-[#5B8DEF]/30 bg-[#5B8DEF]/10 px-3 py-1.5 text-xs text-white transition hover:-translate-y-px hover:bg-[#5B8DEF]/20">{q}</button>
            ))}
          </div>
        )}

        {p && p.followUps.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {p.followUps.map((q, i) => (
              <button key={i} onClick={() => onFollowUp(q)} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition hover:-translate-y-px hover:border-[#5B8DEF]/40 hover:bg-[#5B8DEF]/10 hover:text-white">{q}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Column ============
function Column({ priority, title, tasks, integrations = [], onInsight, onToggle, onStar }: {
  priority: Priority; title: string; tasks: Task[]; integrations?: IntegrationItem[];
  onInsight: (t: Task) => void; onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");
  const colClass = priority === "high" ? "col-high" : priority === "low" ? "col-low" : "col-medium";

  return (
    <div className={`${colClass} rounded-2xl p-4`}>
      <div className="mb-4 flex items-center gap-2 px-1">
        <span className={`size-2 rounded-full dot-${priority}`} />
        <span className="text-[13px] font-medium text-white/85">{title}</span>
        <span className="ml-auto text-[11px] text-white/35">{tasks.length + integrations.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => <TaskRow key={t.id} task={t} onInsight={() => onInsight(t)} onToggle={onToggle} onStar={onStar} />)}
        {integrations.map((i) => <IntegrationRow key={i.id} item={i} />)}
      </div>
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); if (val.trim()) tasksStore.add({ title: val.trim(), priority }); setVal(""); setAdding(false); }} className="mt-2">
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => { if (!val.trim()) setAdding(false); }} placeholder="New task..." className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none" />
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/40 transition hover:bg-white/5 hover:text-white"><Plus className="size-4" /> Add Task</button>
      )}
    </div>
  );

}

function TaskRow({ task, onInsight, onToggle, onStar }: { task: Task; onInsight: () => void; onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void }) {
  const timeMatch = task.due?.match(/\d{1,2}(:\d{2})?\s*(am|pm)/i);
  const shortTime = timeMatch ? timeMatch[0] : task.due;
  return (
    <div className="fade-in group flex items-center gap-3 rounded-xl border border-white/5 bg-[#121725]/70 px-3 py-2.5 transition hover:border-white/15 hover:bg-[#161c2d]/80">
      <button onClick={(e) => onToggle(task.id, e)} className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition ${task.done ? "border-emerald-400 bg-emerald-400/20" : "border-white/25 hover:border-white"}`} aria-label="Toggle">
        {task.done && <Check className="size-3 text-emerald-300" />}
      </button>
      <span className={`min-w-0 flex-1 line-clamp-2 text-[13.5px] leading-snug ${task.done ? "text-white/40 line-through" : "text-white/95"}`}>{task.title}</span>
      {shortTime && <span className="shrink-0 text-[11px] text-white/45">{shortTime}</span>}
      <button onClick={() => onStar(task.id)} className="shrink-0 transition hover:scale-110" aria-label="Star">
        <Star className={`size-3.5 transition ${task.starred ? "fill-amber-300 text-amber-300" : "text-white/20 hover:text-white/60"}`} />
      </button>
      <button onClick={onInsight} className="shrink-0 text-amber-300/80 transition hover:text-amber-300" aria-label="Insights" title="Insights">
        <Lightbulb className="size-3.5" />
      </button>
    </div>
  );
}

// Previous list (home page slice)
function PreviousList({ tasks }: { tasks: Task[] }) {
  const completed = tasks.filter((t) => t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 8);
  if (completed.length === 0) return <div className="rounded-2xl border border-white/5 bg-[#121725]/60 px-3 py-10 text-center text-sm text-white/40">Nothing completed yet. Knock out a task to see it here.</div>;
  return (
    <div className="rounded-2xl border border-white/5 bg-[#121725]/60 p-2">
      {completed.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03]">
          <Check className="size-4 shrink-0 text-emerald-300" />
          <span className={`size-1.5 shrink-0 rounded-full dot-${t.priority}`} />
          <span className="flex-1 truncate text-sm text-white/50 line-through">{t.title}</span>
          {t.due && <span className="text-[11px] text-white/35">{t.due}</span>}
        </div>
      ))}
    </div>
  );
}

// ============ Starred ============
function StarredPage({ tasks, onToggle, onStar }: { tasks: Task[]; onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void }) {
  const starred = tasks.filter((t) => t.starred);
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-white">Starred tasks</h2>
      <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-3">
        {starred.length === 0 ? (
          <div className="px-3 py-12 text-center text-sm text-white/50">No starred tasks yet. Tap the star on any task to pin it here.</div>
        ) : (
          <div className="space-y-2">
            {starred.map((t) => <TaskRow key={t.id} task={t} onInsight={() => { /* noop */ }} onToggle={onToggle} onStar={onStar} />)}
          </div>
        )}
      </div>
    </section>
  );
}

// ============ Today's Plan (timeline) ============
function PlanPage({ tasks, onToggle, ask }: { tasks: Task[]; onToggle: (id: string, e?: React.MouseEvent) => void; ask: (q: string) => void }) {
  const open = tasks.filter((t) => !t.done);
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
        <span className="rounded-md bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] px-2 py-0.5 text-[10px] font-semibold text-white">AI</span>
      </div>
      <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-5">
        <div className="space-y-3">
          {sorted.map((t) => (
            <div key={t.id} className={`flex items-center gap-3 rounded-lg border-l-2 bg-white/[0.03] p-3 transition hover:-translate-y-px hover:bg-white/[0.06] ${t.priority === "high" ? "border-red-400/60" : t.priority === "low" ? "border-emerald-400/60" : "border-amber-400/60"}`}>
              <span className="time-pill"><Clock className="size-3" />{t.due || "Anytime"}</span>
              <div className="flex-1">
                <div className="text-sm text-white">{t.title}</div>
                {t.group && <div className="text-xs text-white/40">{t.group}</div>}
              </div>
              <button onClick={(e) => onToggle(t.id, e)} className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70 transition hover:border-emerald-400/40 hover:text-white">Mark done</button>
              <button onClick={() => ask(`Insights on "${t.title}"${t.due ? ` (due ${t.due})` : ""}.`)} className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70 transition hover:border-[#5B8DEF]/40 hover:text-white"><Lightbulb className="mr-1 inline size-3" />Insights</button>
            </div>
          ))}
          {sorted.length === 0 && <div className="px-3 py-12 text-center text-sm text-white/50">Nothing scheduled. Take a breath.</div>}
        </div>
      </div>
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
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1), v: 2 + ((i * 3 + done.length) % 6) };
  });
  const maxV = Math.max(...days.map((d) => d.v), 1);
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Habit tracker</h2>
          <p className="mt-1 text-sm text-white/50">Quiet telemetry on consistency, focus, and velocity.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs">
          {(["7", "15", "30"] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-md px-2.5 py-1 transition ${range === r ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>{r} DAYS</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Pulse rating</div>
          <div className="mt-3 flex items-center gap-4">
            <Ring value={profile.pulseScore} />
            <div>
              <div className="text-3xl font-bold text-white">{profile.pulseScore}</div>
              <div className="text-xs text-emerald-300">3 day streak</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-5 lg:col-span-2">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Completed" v={done.length} />
            <Stat label="On-time %" v={`${onTime}%`} />
            <Stat label="Avg/day" v={(done.length / 7).toFixed(1)} />
          </div>
          <div className="mt-6 flex h-32 items-end gap-2">
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-md bg-gradient-to-t from-[#5B8DEF] to-[#8B5CF6]" style={{ height: `${(d.v / maxV) * 100}%` }} />
                <span className="text-[10px] text-white/40">{d.label}</span>
              </div>
            ))}
          </div>
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
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0%" stopColor="#5B8DEF" /><stop offset="100%" stopColor="#8B5CF6" /></linearGradient></defs>
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const completed = tasks.filter((t) => {
    if (!t.done) return false;
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (selectedDate) {
      const d = new Date(t.completedAt || 0);
      if (d.toDateString() !== selectedDate.toDateString()) return false;
    }
    return true;
  }).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-xl font-semibold text-white">Previous tasks</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter..." className="h-9 w-64 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none" />
      </div>
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-3">
          <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} className="pointer-events-auto" />
          {selectedDate && (
            <button onClick={() => setSelectedDate(undefined)} className="mt-2 w-full rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/5 hover:text-white">Clear date</button>
          )}
        </div>
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            {selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "All completed"}
          </div>
          {completed.length === 0 && <div className="rounded-2xl border border-white/8 bg-[#121725]/60 px-3 py-12 text-center text-sm text-white/50">No completed tasks for this date.</div>}
          {completed.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-white/8 bg-[#121725]/60 p-3">
              {completed.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-2 py-1.5">
                  <Check className="size-4 text-emerald-300" />
                  <span className={`size-1.5 rounded-full dot-${t.priority}`} />
                  <span className="flex-1 text-sm text-white/50 line-through">{t.title}</span>
                  {t.due && <span className="text-[11px] text-white/35">{t.due}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============ Integration row + Live clock + Source badge ============
function SourceBadge({ source }: { source: IntegrationItem["source"] }) {
  const cls = source === "calendar" ? "badge-calendar" : "badge-gtasks";
  const label = source === "calendar" ? "Calendar" : "Tasks";
  const Icon = source === "calendar" ? CalendarDays : ListTodo;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>
      <Icon className="size-2.5" />{label}
    </span>
  );
}

function IntegrationRow({ item }: { item: IntegrationItem }) {
  return (
    <div className="fade-in flex items-center gap-3 rounded-xl border border-white/5 bg-[#0d1422]/70 px-3 py-2.5 transition hover:border-white/15">
      <div className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] border ${item.source === "calendar" ? "border-blue-400/50 bg-blue-500/15" : "border-sky-400/50 bg-sky-500/15"}`}>
        {item.source === "calendar" ? <CalendarDays className="size-3 text-blue-200" /> : <ListTodo className="size-3 text-sky-200" />}
      </div>
      <span className="min-w-0 flex-1 line-clamp-2 text-[13.5px] leading-snug text-white/95">{item.title}</span>
      {item.due && <span className="shrink-0 text-[11px] text-white/45">{item.due}</span>}
      <SourceBadge source={item.source} />
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/60 sm:flex">
      <Clock className="size-3 text-white/40" />
      <span suppressHydrationWarning>{now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
      <span className="text-white/30">·</span>
      <span suppressHydrationWarning>{now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
    </div>
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
      <div className="slide-down fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/8 bg-[#121725] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] text-xl font-bold text-white">{p.initials}</div>
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
          <div className="mb-1 flex items-center gap-2 text-xs text-white/70"><UserIcon className="size-3.5 text-[#8B5CF6]" /> AI context</div>
          <textarea value={p.aiContext} onChange={(e) => setP({ ...p, aiContext: e.target.value })} rows={5}
            placeholder="Tell the AI about yourself — job, routines, goals."
            className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/40 focus:border-[#5B8DEF]/50 focus:outline-none" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancel</button>
          <button onClick={() => onSave(p)} className="rounded-md bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#5B8DEF]/20 transition hover:-translate-y-px">Save</button>
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
