import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home, Star, CalendarClock, Activity, History,
  Sparkles, Mic, X, Lightbulb, Plus, Check,
  LogOut, Clock, Trash2, User as UserIcon, ChevronUp, ChevronRight, Info,
  PanelLeftClose, PanelLeftOpen, Inbox, Trophy, FolderKanban, Zap,
  CalendarDays, ListTodo, MoreHorizontal,
} from "lucide-react";
import { tasksStore, useTasks, type Priority, type Task, type TaskCategory } from "@/lib/tasks";
import { listsStore, useLists, type UserList } from "@/lib/lists";
import { mockCalendarEvents, mockGoogleTasks, type IntegrationItem } from "@/lib/integrations";
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

function Greeting({ name }: { name: string }) {
  const [text, setText] = useState(`Hello, ${name}`);
  useEffect(() => { setText(timeGreeting(name)); }, [name]);
  return <span className="wave-text">{text}</span>;
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
type Page =
  | { kind: "plan" }
  | { kind: "home" }
  | { kind: "starred" }
  | { kind: "habits" }
  | { kind: "previous" }
  | { kind: "list"; listId: string };

const topNav: { key: Page["kind"]; icon: typeof Home; label: string }[] = [
  { key: "home", icon: Home, label: "Home" },
  { key: "plan", icon: CalendarClock, label: "Today's plan" },
  { key: "starred", icon: Star, label: "Starred" },
  { key: "habits", icon: Activity, label: "Habit tracker" },
  { key: "previous", icon: History, label: "Previous tasks" },
];

const integrationLinks: { to: string; icon: typeof CalendarDays; label: string; badgeClass: string }[] = [
  { to: "/calendar", icon: CalendarDays, label: "Google Calendar", badgeClass: "text-blue-300" },
  { to: "/google-tasks", icon: ListTodo, label: "Google Tasks", badgeClass: "text-sky-300" },
];

const builtInLists: { id: string; name: string; icon: typeof Inbox }[] = [
  { id: "builtin:my-tasks", name: "My Tasks", icon: Inbox },
  { id: "builtin:hackathon", name: "Hackathon Tasks", icon: Trophy },
  { id: "builtin:personal", name: "Personal Inbox", icon: FolderKanban },
];


function Sidebar({
  page, setPage, profile, onAvatar, pinned, setPinned, hovered, setHovered, lists, onCreateList, onDeleteList,
}: {
  page: Page; setPage: (p: Page) => void; profile: Profile; onAvatar: () => void;
  pinned: boolean; setPinned: (b: boolean) => void;
  hovered: boolean; setHovered: (b: boolean) => void;
  lists: UserList[]; onCreateList: (name: string) => void; onDeleteList: (id: string) => void;
}) {
  const expanded = pinned || hovered;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [listsOpen, setListsOpen] = useState(true);


  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="sidebar-glass fixed left-0 top-0 z-30 flex h-screen flex-col justify-between py-4 transition-[width] duration-200 ease-out"
      style={{ width: expanded ? 250 : 64 }}
    >
      <div className="flex flex-col gap-1 overflow-y-auto px-3">
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

        {topNav.map((it) => {
          const active = page.kind === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setPage({ kind: it.key } as Page)}
              title={it.label}
              className={`group/btn relative flex h-10 items-center gap-3 rounded-xl px-2.5 text-sm transition-all duration-150 ${active ? "bg-[#5B8DEF]/15 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
            >
              {active && <span className="absolute left-[-12px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#5B8DEF]" />}
              <it.icon className="size-5 shrink-0" strokeWidth={1.75} />
              {expanded && (
                <span className="flex-1 truncate text-left">{it.label}</span>
              )}

            </button>
          );
        })}

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
            <button
              onClick={() => setListsOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45 transition hover:text-white"
            >
              <ChevronRight className={`size-3 chev ${listsOpen ? "open" : ""}`} />
              <span>My lists</span>
            </button>
            {listsOpen && (
              <div className="flex flex-col gap-0.5">
                {builtInLists.map((l) => {
                  const active = page.kind === "list" && page.listId === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setPage({ kind: "list", listId: l.id })}
                      className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition ${active ? "bg-[#5B8DEF]/15 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
                    >
                      <l.icon className="size-4 shrink-0 text-white/40" strokeWidth={1.75} />
                      <span className="truncate">{l.name}</span>
                    </button>
                  );
                })}
                {lists.map((l) => {
                  const active = page.kind === "list" && page.listId === l.id;
                  return (
                    <div key={l.id} className={`group/li flex h-9 items-center gap-2 rounded-lg pl-2.5 pr-1 text-sm transition ${active ? "bg-[#5B8DEF]/15 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
                      <button onClick={() => setPage({ kind: "list", listId: l.id })} className="flex flex-1 items-center gap-3 truncate text-left">
                        <FolderKanban className="size-4 shrink-0 text-white/40" strokeWidth={1.75} />
                        <span className="truncate">{l.name}</span>
                      </button>
                      <button onClick={() => onDeleteList(l.id)} className="hidden size-6 place-items-center rounded text-white/40 hover:bg-white/10 hover:text-red-300 group-hover/li:grid" title="Delete list">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  );
                })}
                {creating ? (
                  <form onSubmit={(e) => { e.preventDefault(); const v = newName.trim(); if (v) { onCreateList(v); setNewName(""); } setCreating(false); }}>
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onBlur={() => { const v = newName.trim(); if (v) onCreateList(v); setNewName(""); setCreating(false); }} placeholder="List name..." className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none" />
                  </form>
                ) : (
                  <button onClick={() => setCreating(true)} className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-white/40 transition hover:bg-white/5 hover:text-white">
                    <Plus className="size-4 shrink-0" />
                    <span>Create new list</span>
                  </button>
                )}
              </div>
            )}
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
  const lists = useLists();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [page, setPage] = useState<Page>({ kind: "home" });
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

  // Per-list chat
  const [listChats, setListChats] = useState<Record<string, ChatMsg[]>>({});

  useEffect(() => {
    tasksStore.hydrate();
    listsStore.hydrate();
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

  async function ask(message: string, opts?: { listId?: string }) {
    setError(null);
    setAiActive(true);
    const userMsg: ChatMsg = { role: "user", text: message, ts: Date.now() };
    const listId = opts?.listId;
    const prev = listId ? (listChats[listId] || []) : messages;
    const next = [...prev, userMsg];
    if (listId) setListChats((m) => ({ ...m, [listId]: next }));
    else setMessages(next);

    try {
      const taskContextSource = listId ? tasks.filter((t) => t.listId === listId) : tasks;
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          profile: profile.aiContext,
          currentTime: new Date().toISOString(),
          taskContext: taskContextSource.filter((t) => !t.done).map((t) => ({
            id: t.id, title: t.title, priority: t.priority, due: t.due, group: t.group,
          })),
          history: next.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI error");
      const parsed = parseAiText(data.text);
      for (const s of parsed.suggestions) {
        tasksStore.add({ title: s.title, priority: s.priority, due: s.time, listId });
      }
      const aiMsg: ChatMsg = { role: "ai", text: data.text, parsed, ts: Date.now() };
      const finalMsgs = [...next, aiMsg];
      if (listId) setListChats((m) => ({ ...m, [listId]: finalMsgs }));
      else setMessages(finalMsgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setAiActive(false);
    }
  }

  function submit(text?: string, opts?: { listId?: string }) {
    const v = (text ?? input).trim(); if (!v) return;
    setInput(""); ask(v, opts);
  }

  // Voice with silence detection + auto-send
  const recogRef = useRef<unknown>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopListening() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    try { (recogRef.current as { stop?: () => void } | null)?.stop?.(); } catch { /* ignore */ }
    setListening(false);
  }

  function startMic() {
    const W = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) { setError("Voice input not supported in this browser"); return; }
    const r = new SR() as unknown as {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: (e: unknown) => void; onerror: () => void; onend: () => void;
      stop: () => void; start: () => void;
    };
    recogRef.current = r;
    r.lang = "en-US"; r.interimResults = true; r.continuous = true;
    let buffer = "";
    const resetSilence = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => { try { r.stop(); } catch { /* ignore */ } }, 2000);
    };
    r.onresult = (e: unknown) => {
      const ev = e as { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] };
      let finalText = "";
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const tr = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += tr; else interim += tr;
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
      if (finalText) { setInput(""); ask(finalText); }
    };
    setListening(true);
    setError(null);
    r.start();
    resetSilence();
  }

  // CLEAR CHAT → archive into history, leave active chat empty
  function clearChat() {
    if (messages.length > 0) {
      const session: ChatSession = { id: "s-" + Date.now(), messages, startedAt: messages[0]?.ts || Date.now() };
      const next = [session, ...sessions];
      setSessions(next); saveSessions(next);
    }
    setMessages([]);
  }

  const quickActions = ["Break it down", "Rescue me", "Plan my day", "Habit check"];
  const expanded = sidebarPinned || sidebarHovered;
  const activeList: UserList | null = page.kind === "list"
    ? (lists.find((l) => l.id === page.listId)
      || (builtInLists.find((b) => b.id === page.listId)
        ? { id: page.listId, name: builtInLists.find((b) => b.id === page.listId)!.name, createdAt: 0 }
        : null))
    : null;

  // Scroll-based top bar transparency
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen transition-[padding] duration-200 ease-out" style={{ paddingLeft: expanded ? 250 : 64 }}>
      <AnimatedBackground />
      <Sidebar
        page={page} setPage={setPage} profile={profile}
        onAvatar={() => setShowProfile(true)}
        pinned={sidebarPinned} setPinned={setSidebarPinned}
        hovered={sidebarHovered} setHovered={setSidebarHovered}
        lists={lists}
        onCreateList={(name) => { const l = listsStore.add(name); setPage({ kind: "list", listId: l.id }); }}
        onDeleteList={(id) => { listsStore.remove(id); if (page.kind === "list" && page.listId === id) setPage({ kind: "home" }); }}
      />

      {floats.map((f) => (
        <div key={f.id} className="pointer-events-none fixed z-50 float-up text-sm font-bold text-emerald-300" style={{ left: f.x, top: f.y }}>+2</div>
      ))}

      <header className={`sticky top-0 z-20 flex h-12 items-center justify-end gap-2 px-6 ${scrolled ? "topbar-frosted" : "topbar-transparent"}`}>
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

      <div className={`fixed bottom-4 right-4 z-30 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0d0f14]/80 px-3 py-1.5 text-xs backdrop-blur-xl ${scorePop ? "score-pop" : ""}`}>
        <Info className="size-3.5 text-white/40" />
        <span className="font-semibold text-white">{profile.pulseScore}</span>
        <ChevronUp className="size-3 text-white/40" />
      </div>

      <main className="relative z-10 mx-auto max-w-5xl px-8 py-10">
        {page.kind === "home" && (
          <HomePage
            tasks={tasks} counts={counts} profile={profile}
            input={input} setInput={setInput}
            aiActive={aiActive} ask={(m) => ask(m)} submit={(t) => submit(t)}
            startMic={startMic} stopMic={stopListening} listening={listening}
            quickActions={quickActions} messages={messages} clearChat={clearChat}
            error={error}
            onToggle={toggleTask}
            onStar={(id) => { const t = tasks.find((x) => x.id === id); tasksStore.update(id, { starred: !t?.starred }); }}
          />
        )}
        {page.kind === "starred" && <StarredPage tasks={tasks} onToggle={toggleTask} onStar={(id) => { const t = tasks.find((x) => x.id === id); tasksStore.update(id, { starred: !t?.starred }); }} />}
        {page.kind === "plan" && <PlanPage tasks={tasks} onToggle={toggleTask} ask={(m) => ask(m)} />}
        {page.kind === "habits" && <HabitsPage tasks={tasks} profile={profile} />}
        {page.kind === "previous" && <PreviousPage tasks={tasks} />}
        {page.kind === "list" && activeList && (
          <CustomListPage
            list={activeList}
            tasks={tasks.filter((t) => t.listId === activeList.id)}
            messages={listChats[activeList.id] || []}
            input={input} setInput={setInput}
            aiActive={aiActive}
            ask={(m) => ask(m, { listId: activeList.id })}
            submit={(t) => submit(t, { listId: activeList.id })}
            startMic={startMic} stopMic={stopListening} listening={listening}
            error={error}
            onToggle={toggleTask}
            onStar={(id) => { const t = tasks.find((x) => x.id === id); tasksStore.update(id, { starred: !t?.starred }); }}
          />
        )}
      </main>

      {showHistory && <HistoryPanel sessions={sessions} onClose={() => setShowHistory(false)} onPick={(s) => { setMessages(s.messages); setShowHistory(false); }} onClear={() => { setSessions([]); saveSessions([]); }} />}
      {showProfile && <ProfileModal profile={profile} onSave={(p) => { setProfile(p); saveProfile(p); setShowProfile(false); }} onClose={() => setShowProfile(false)} />}
    </div>
  );
}

// ============ Chat scroll container — single scrollbar, always sticks to bottom ============
function ChatScroll({ messages, ask, aiActive }: { messages: ChatMsg[]; ask: (q: string) => void; aiActive?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, aiActive]);
  return (
    <div
      ref={scrollRef}
      className="flex max-h-[55vh] min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain pr-1"
    >
      {messages.map((m, i) => m.role === "user"
        ? <UserBubble key={i} text={m.text} />
        : <AiBubble key={i} msg={m} onFollowUp={ask} onOption={ask} />
      )}
      <div ref={bottomRef} />
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
  return (
    <>
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

      <div key={profile.name} className="greet-in mt-8">
        <div className="text-3xl font-semibold tracking-tight text-white md:text-4xl"><Greeting name={profile.name} /></div>
        <div className="mt-1 text-sm text-white/45">Here's your day at a glance.</div>
      </div>

      {messages.length > 0 && (
        <section className="slide-down mt-8 rounded-2xl border border-white/8 bg-[#121725]/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-[#8B5CF6]" /><span className="text-sm font-semibold text-white">Conversation</span></div>
            <button onClick={clearChat} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/50 hover:bg-white/5 hover:text-white"><Trash2 className="size-3" /> Clear</button>
          </div>
          <ChatScroll messages={messages} ask={ask} aiActive={aiActive} />
        </section>
      )}

      <CommandBar
        input={input} setInput={setInput} aiActive={aiActive}
        submit={submit} startMic={startMic} stopMic={stopMic} listening={listening}
        quickActions={quickActions} onQuick={ask} error={error}
      />

      <section className="mt-10">
        <h2 className="mb-5 text-lg font-semibold text-white">Today's tasks</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["high", "medium", "low"] as Priority[]).map((p) => (
            <Column key={p} priority={p} title={`${p[0].toUpperCase() + p.slice(1)} priority`}
              tasks={tasks.filter((t) => t.priority === p && !t.done && !t.listId)}
              integrations={[]}
              onInsight={(t) => ask(`Give me insights on "${t.title}"${t.due ? ` (due ${t.due})` : ""}.`)}
              onToggle={onToggle} onStar={onStar}
            />
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-white/10" />
        <h2 className="mb-5 text-lg font-semibold text-white">Previous tasks</h2>
        <PreviousList tasks={tasks} />
      </section>
    </>
  );
}

// ============ Custom List Page ============
function CustomListPage({
  list, tasks, messages, input, setInput, aiActive, ask, submit, startMic, stopMic, listening,
  error, onToggle, onStar,
}: {
  list: UserList; tasks: Task[]; messages: ChatMsg[];
  input: string; setInput: (s: string) => void; aiActive: boolean;
  ask: (m: string) => void; submit: (t?: string) => void;
  startMic: () => void; stopMic: () => void; listening: boolean;
  error: string | null;
  onToggle: (id: string, e?: React.MouseEvent) => void; onStar: (id: string) => void;
}) {
  const open = tasks.filter((t) => !t.done);
  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...open].sort((a, b) => order[a.priority] - order[b.priority]);

  return (
    <>
      <h1 className="text-5xl font-bold tracking-tight text-white md:text-6xl">{list.name}</h1>

      <div className="mt-6">
        <CommandBar
          input={input} setInput={setInput} aiActive={aiActive}
          submit={submit} startMic={startMic} stopMic={stopMic} listening={listening}
          quickActions={["Break it down", "Plan this list", "What's urgent here?"]} onQuick={ask} error={error}
        />
      </div>

      {messages.length > 0 && (
        <section className="slide-down mt-6 rounded-2xl border border-white/8 bg-[#121725]/60 p-5">
          <div className="mb-3 flex items-center gap-2"><Sparkles className="size-4 text-[#8B5CF6]" /><span className="text-sm font-semibold text-white">Conversation</span></div>
          <ChatScroll messages={messages} ask={ask} aiActive={aiActive} />
        </section>
      )}

      {sorted.length > 0 && (
        <section className="mt-8 space-y-2">
          {sorted.map((t) => (
            <div key={t.id} className={`fade-in flex items-center gap-3 rounded-xl border bg-[#121725]/70 px-3 py-2.5 ${t.priority === "high" ? "border-red-400/30" : t.priority === "low" ? "border-emerald-400/30" : "border-amber-400/30"}`}>
              <span className={`size-2 rounded-full dot-${t.priority}`} />
              <button onClick={(e) => onToggle(t.id, e)} className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition ${t.done ? "border-emerald-400 bg-emerald-400/20" : "border-white/25 hover:border-white"}`} aria-label="Toggle">
                {t.done && <Check className="size-3 text-emerald-300" />}
              </button>
              <span className="flex-1 text-[14px] text-white/95">{t.title}</span>
              {t.due && <span className="time-pill"><Clock className="size-3" />{t.due}</span>}
              <button onClick={() => onStar(t.id)} aria-label="Star"><Star className={`size-3.5 ${t.starred ? "fill-amber-300 text-amber-300" : "text-white/20 hover:text-white/60"}`} /></button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

// ============ Command bar (sticky AI input) ============
function CommandBar({
  input, setInput, aiActive, submit, startMic, stopMic, listening, quickActions, onQuick, error,
}: {
  input: string; setInput: (s: string) => void; aiActive: boolean;
  submit: (t?: string) => void;
  startMic: () => void; stopMic: () => void; listening: boolean;
  quickActions: string[]; onQuick: (q: string) => void; error: string | null;
}) {
  return (
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
            <button key={q} onClick={() => onQuick(q)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65 transition hover:-translate-y-px hover:border-white/25 hover:bg-white/[0.08] hover:text-white">
              <span className="text-white/35">/</span> {q}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
    </section>
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

// ============ HABITS ============
function classifyCategory(t: Task): TaskCategory {
  if (t.category) return t.category;
  const blob = `${t.title} ${t.group || ""} ${t.due || ""}`.toLowerCase();
  const personal = /(dinner|pick(?:up| up)?|errand|gym|laundry|family|grocer|clean|wife|husband|kid|home|doctor|appoint|date|movie|friend)/;
  const professional = /(meeting|standup|pitch|deadline|review|sprint|client|investor|launch|spec|design|code|deploy|report|email|hire|interview|okr)/;
  if (personal.test(blob)) return "personal";
  if (professional.test(blob)) return "professional";
  return "professional";
}

function computeStats(tasks: Task[]) {
  // Pulse rating: lifetime completed / lifetime assigned
  const assigned = tasks.length;
  const completed = tasks.filter((t) => t.done).length;
  const pulse = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

  // Streak: consecutive days where ALL tasks created that day were completed.
  const byDay = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    const day = new Date(t.createdAt).toDateString();
    const row = byDay.get(day) || { total: 0, done: 0 };
    row.total += 1;
    if (t.done) row.done += 1;
    byDay.set(day, row);
  }
  let currentStreak = 0;
  let bestStreak = 0;
  let cur = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // walk back 90 days
  for (let i = 0; i < 90; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const row = byDay.get(d.toDateString());
    if (row && row.total > 0 && row.done === row.total) {
      cur += 1;
      if (i === 0 || currentStreak > 0) currentStreak = cur;
      bestStreak = Math.max(bestStreak, cur);
    } else {
      if (i === 0) currentStreak = 0;
      cur = 0;
    }
  }

  // Daily/weekly average
  const days = byDay.size || 1;
  const dailyAvg = completed / days;
  const weeklyAvg = dailyAvg * 7;

  // Categories
  const cats = { personal: { total: 0, done: 0 }, professional: { total: 0, done: 0 } };
  for (const t of tasks) {
    const c = classifyCategory(t);
    cats[c].total += 1;
    if (t.done) cats[c].done += 1;
  }

  // Priority completion rate
  const byPriority = (p: Priority) => {
    const all = tasks.filter((t) => t.priority === p);
    const dn = all.filter((t) => t.done).length;
    return { total: all.length, done: dn, rate: all.length ? Math.round((dn / all.length) * 100) : 0 };
  };
  const priorityRates = { high: byPriority("high"), medium: byPriority("medium"), low: byPriority("low") };

  // Most productive day and hour
  const dowCount: Record<number, number> = {};
  const hourCount: Record<number, number> = {};
  for (const t of tasks) {
    if (!t.done || !t.completedAt) continue;
    const d = new Date(t.completedAt);
    dowCount[d.getDay()] = (dowCount[d.getDay()] || 0) + 1;
    hourCount[d.getHours()] = (hourCount[d.getHours()] || 0) + 1;
  }
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let bestDay = "—"; let bestDayN = 0;
  for (const [k, v] of Object.entries(dowCount)) { if (v > bestDayN) { bestDayN = v; bestDay = DOW[Number(k)]; } }
  let bestHour = -1; let bestHourN = 0;
  for (const [k, v] of Object.entries(hourCount)) { if (v > bestHourN) { bestHourN = v; bestHour = Number(k); } }
  const bestHourLabel = bestHour < 0 ? "—" : `${bestHour % 12 || 12}${bestHour < 12 ? "am" : "pm"}`;

  // On-time vs overdue (heuristic: completed within 24h of due hint, else overdue)
  let onTime = 0, overdue = 0;
  for (const t of tasks) {
    if (!t.done || !t.completedAt) continue;
    const dueHour = parseHour(t.due);
    if (dueHour === null) { onTime += 1; continue; }
    const c = new Date(t.completedAt);
    const cMin = c.getHours() * 60 + c.getMinutes();
    if (cMin <= dueHour + 30) onTime += 1; else overdue += 1;
  }
  const ontimeRate = (onTime + overdue) > 0 ? Math.round((onTime / (onTime + overdue)) * 100) : 100;

  // 7-week heatmap (49 cells)
  const heat: { date: Date; v: number }[] = [];
  for (let i = 48; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const row = byDay.get(d.toDateString());
    heat.push({ date: d, v: row?.done || 0 });
  }
  const heatMax = Math.max(1, ...heat.map((h) => h.v));

  // Last 14d line chart
  const line: { date: Date; v: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const row = byDay.get(d.toDateString());
    line.push({ date: d, v: row?.done || 0 });
  }

  return {
    pulse, assigned, completed, currentStreak, bestStreak,
    dailyAvg, weeklyAvg, cats, priorityRates,
    bestDay, bestHourLabel, ontimeRate, onTime, overdue,
    heat, heatMax, line,
  };
}

function HabitsPage({ tasks, profile }: { tasks: Task[]; profile: Profile }) {
  const stats = useMemo(() => computeStats(tasks), [tasks]);
  const hasData = stats.assigned > 0;
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Habit tracker</h2>
        <p className="mt-1 text-sm text-white/50">Lifetime telemetry on consistency, focus, and velocity.</p>
      </div>

      {!hasData && (
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 px-6 py-16 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-gradient-to-br from-[#5B8DEF]/30 to-[#8B5CF6]/30">
            <Activity className="size-5 text-white/70" />
          </div>
          <div className="text-base font-semibold text-white">Complete some tasks to unlock insights</div>
          <p className="mt-1 text-sm text-white/50">Your pulse rating, streaks, and Gemini coaching appear once you have data.</p>
        </div>
      )}

      {hasData && <>


      {/* Top row: Pulse ring + streak + totals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Pulse rating</div>
          <div className="mt-4 flex items-center gap-5">
            <BigRing value={stats.pulse} />
            <div>
              <div className="text-4xl font-bold text-white">{stats.pulse}</div>
              <div className="mt-1 text-xs text-white/55">{stats.completed} of {stats.assigned} lifetime</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Streak</div>
          <div className="mt-4 flex items-end gap-6">
            <div>
              <div className="text-4xl font-bold text-emerald-300">{stats.currentStreak}</div>
              <div className="text-xs text-white/55">day streak</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white">{stats.bestStreak}</div>
              <div className="text-xs text-white/55">best</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Totals</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Assigned" v={stats.assigned} />
            <Stat label="Completed" v={stats.completed} />
            <Stat label="Avg / day" v={stats.dailyAvg.toFixed(1)} />
            <Stat label="Avg / week" v={stats.weeklyAvg.toFixed(1)} />
          </div>
        </div>
      </div>

      {/* Trend line */}
      <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">14-day completion trend</div>
        </div>
        <LineChart points={stats.line} />
      </div>

      {/* Donut + priority bars */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Professional vs Personal</div>
          <div className="mt-4 flex items-center gap-6">
            <Donut personal={stats.cats.personal.total} professional={stats.cats.professional.total} />
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><span className="size-3 rounded-sm bg-[#5B8DEF]" /> Professional · <span className="font-semibold text-white">{stats.cats.professional.total}</span></div>
              <div className="text-xs text-white/45">{stats.cats.professional.done} completed</div>
              <div className="mt-2 flex items-center gap-2"><span className="size-3 rounded-sm bg-[#8B5CF6]" /> Personal · <span className="font-semibold text-white">{stats.cats.personal.total}</span></div>
              <div className="text-xs text-white/45">{stats.cats.personal.done} completed</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Completion rate by priority</div>
          <div className="mt-4 flex h-40 items-end gap-6 px-4">
            {(["high", "medium", "low"] as Priority[]).map((p, idx) => {
              const r = stats.priorityRates[p];
              return (
                <div key={p} className="flex flex-1 flex-col items-center gap-2">
                  <div className="text-xs font-semibold text-white">{r.rate}%</div>
                  <div className="relative h-32 w-12 overflow-hidden rounded-md bg-white/5">
                    <div
                      className={`bar-anim absolute bottom-0 left-0 w-full rounded-md ${p === "high" ? "bg-red-400/80" : p === "low" ? "bg-emerald-400/80" : "bg-amber-400/80"}`}
                      style={{ ["--h" as string]: `${r.rate}%`, animationDelay: `${idx * 0.15}s` } as React.CSSProperties}
                    />
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-white/55">{p}</div>
                  <div className="text-[10px] text-white/40">{r.done}/{r.total}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* On-time + most productive */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">On-time rate</div>
          <div className="mt-3 text-4xl font-bold text-white">{stats.ontimeRate}%</div>
          <div className="mt-1 text-xs text-white/55">{stats.onTime} on-time · {stats.overdue} overdue</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Most productive day</div>
          <div className="mt-3 text-4xl font-bold text-white">{stats.bestDay}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Most productive hour</div>
          <div className="mt-3 text-4xl font-bold text-white">{stats.bestHourLabel}</div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-2xl border border-white/8 bg-[#121725]/60 p-6">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">7-week heatmap</div>
        <Heatmap data={stats.heat} max={stats.heatMax} />
      </div>

      {/* Gemini insights */}
      <GeminiInsights stats={stats} profile={profile} />
      </>}
    </section>

  );
}

function BigRing({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(value, 100) / 100) * c;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" className="-rotate-90">
      <circle cx="65" cy="65" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
      <circle
        cx="65" cy="65" r={r} stroke="url(#g)" strokeWidth="10" fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c}
        className="ring-anim"
        style={{ ["--c" as string]: c, ["--off" as string]: off } as React.CSSProperties}
      />
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0%" stopColor="#5B8DEF" /><stop offset="100%" stopColor="#8B5CF6" /></linearGradient></defs>
    </svg>
  );
}

function Donut({ personal, professional }: { personal: number; professional: number }) {
  const total = personal + professional || 1;
  const r = 48; const c = 2 * Math.PI * r;
  const proLen = (professional / total) * c;
  const persLen = (personal / total) * c;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
      <circle cx="60" cy="60" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="14" fill="none" />
      <circle
        cx="60" cy="60" r={r} stroke="#5B8DEF" strokeWidth="14" fill="none"
        strokeDasharray={`${proLen} ${c}`} strokeDashoffset={c}
        className="donut-anim"
        style={{ ["--c" as string]: c, ["--off" as string]: c - proLen } as React.CSSProperties}
      />
      <circle
        cx="60" cy="60" r={r} stroke="#8B5CF6" strokeWidth="14" fill="none"
        strokeDasharray={`${persLen} ${c}`} strokeDashoffset={c + proLen}
        className="donut-anim"
        style={{ ["--c" as string]: c + proLen, ["--off" as string]: c - persLen } as React.CSSProperties}
      />
    </svg>
  );
}

function LineChart({ points }: { points: { date: Date; v: number }[] }) {
  const W = 600, H = 140, P = 20;
  const max = Math.max(1, ...points.map((p) => p.v));
  const step = (W - P * 2) / Math.max(1, points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${P + i * step} ${H - P - (p.v / max) * (H - P * 2)}`).join(" ");
  const area = `${path} L ${P + (points.length - 1) * step} ${H - P} L ${P} ${H - P} Z`;
  const len = 1200; // overshoot fine
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full">
      <defs>
        <linearGradient id="lg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#5B8DEF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#5B8DEF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lg)" />
      <path
        d={path} fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={len} strokeDashoffset={len}
        className="line-anim"
        style={{ ["--len" as string]: len } as React.CSSProperties}
      />
      {points.map((p, i) => (
        <circle key={i} cx={P + i * step} cy={H - P - (p.v / max) * (H - P * 2)} r="2.5" fill="#fff" opacity="0.7" />
      ))}
    </svg>
  );
}

function Heatmap({ data, max }: { data: { date: Date; v: number }[]; max: number }) {
  // 7 rows (days of week) × 7 cols (weeks)
  const cols = 7;
  const grid: ({ date: Date; v: number } | null)[][] = Array.from({ length: 7 }, () => Array(cols).fill(null));
  data.forEach((d, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;
    if (col < cols) grid[row][col] = d;
  });
  return (
    <div className="flex flex-col gap-1.5">
      {grid.map((row, ri) => (
        <div key={ri} className="flex gap-1.5">
          {row.map((cell, ci) => {
            const intensity = cell ? cell.v / max : 0;
            const bg = cell ? `rgba(91,141,239,${0.12 + intensity * 0.85})` : "rgba(255,255,255,0.03)";
            return (
              <div
                key={ci}
                className="cell-in size-6 rounded-sm"
                style={{ background: bg, animationDelay: `${(ri + ci) * 0.02}s` }}
                title={cell ? `${cell.date.toDateString()} · ${cell.v} done` : ""}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function GeminiInsights({ stats, profile }: { stats: ReturnType<typeof computeStats>; profile: Profile }) {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (stats.assigned === 0) { setLoading(false); setInsights([]); return; }
    let cancelled = false;
    async function run() {
      setLoading(true); setErr(null);
      try {

        const res = await fetch("/api/gemini-insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stats: {
              pulse: stats.pulse, assigned: stats.assigned, completed: stats.completed,
              currentStreak: stats.currentStreak, bestStreak: stats.bestStreak,
              dailyAvg: stats.dailyAvg, weeklyAvg: stats.weeklyAvg,
              priorityRates: stats.priorityRates,
              categories: stats.cats,
              ontimeRate: stats.ontimeRate, bestDay: stats.bestDay, bestHour: stats.bestHourLabel,
              profile: profile.aiContext,
            },
            currentTime: new Date().toISOString(),
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error || "AI error");
        setInsights(data.insights || []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load insights");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [stats.pulse, stats.assigned, stats.completed, stats.currentStreak, profile.aiContext]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl border border-[#8B5CF6]/30 bg-gradient-to-br from-[#5B8DEF]/10 to-[#8B5CF6]/10 p-6">
      <div className="flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6]"><Sparkles className="size-3.5 text-white" /></div>
        <span className="text-sm font-semibold text-white">Gemini insights</span>
        <span className="ml-2 text-[10px] uppercase tracking-wider text-white/40">Personalized to your stats</span>
      </div>
      <div className="mt-4 space-y-2.5">
        {loading && <div className="text-sm text-white/50">Analyzing your habits…</div>}
        {err && <div className="text-sm text-red-300">{err}</div>}
        {!loading && !err && insights.length === 0 && <div className="text-sm text-white/50">No insights available yet.</div>}
        {!loading && insights.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-[14px] leading-relaxed text-white/90">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <span>{s}</span>
          </div>
        ))}
      </div>
    </div>
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
  // SSR-safe: render empty placeholder until mounted, then tick every 30s with real device time.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) {
    return (
      <div className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/40 sm:flex">
        <Clock className="size-3 text-white/40" />
        <span>—</span>
      </div>
    );
  }
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  const date = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/60 sm:flex">
      <Clock className="size-3 text-white/40" />
      <span>{time}</span>
      <span className="text-white/30">·</span>
      <span>{date}</span>
    </div>
  );
}


// ============ History Panel (complete archive view) ============
function HistoryPanel({ sessions, onClose, onPick, onClear }: { sessions: ChatSession[]; onClose: () => void; onPick: (s: ChatSession) => void; onClear: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="slide-down fixed right-0 top-0 z-50 flex h-screen w-[420px] flex-col border-l border-white/10 bg-[#0d0f14]/95 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Conversation history</div>
            <div className="text-[11px] text-white/45">{sessions.length} archived</div>
          </div>
          <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {sessions.length === 0 && <div className="px-2 py-8 text-center text-sm text-white/50">No archived conversations yet. Clear an active chat to archive it here.</div>}
          {sessions.map((s) => {
            const first = s.messages.find((m) => m.role === "user")?.text || s.messages[0]?.text || "Conversation";
            const isOpen = expanded === s.id;
            return (
              <div key={s.id} className="rounded-lg border border-white/5 bg-white/[0.02]">
                <button onClick={() => setExpanded(isOpen ? null : s.id)} className="flex w-full items-start gap-2 p-3 text-left transition hover:bg-white/[0.04]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{first.slice(0, 80)}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-white/45">
                      <span>{new Date(s.startedAt).toLocaleString()}</span>
                      <span>·</span>
                      <span>{s.messages.length} messages</span>
                    </div>
                  </div>
                  <MoreHorizontal className="size-4 text-white/30" />
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-white/5 p-3">
                    {s.messages.map((m, i) => (
                      <div key={i} className={`text-xs ${m.role === "user" ? "text-blue-200" : "text-white/80"}`}>
                        <span className="font-semibold uppercase tracking-wider opacity-60">{m.role}:</span> {m.text.slice(0, 200)}{m.text.length > 200 ? "…" : ""}
                      </div>
                    ))}
                    <button onClick={() => onPick(s)} className="mt-2 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5 hover:text-white">Open in main view</button>
                  </div>
                )}
              </div>
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
          <button onClick={onClose} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white">Cancel</button>
          <button onClick={() => onSave(p)} className="rounded-lg bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[#5B8DEF]/30">Save</button>
        </div>
      </div>
    </>
  );
}

function Field({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-white/55">{label}</div>
      <input value={v} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-[#5B8DEF]/50 focus:outline-none" />
    </label>
  );
}

// silence unused-import warnings for backward-compat exports
void mockCalendarEvents; void mockGoogleTasks;
