import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Search,
  Sparkles,
  Settings,
  LogOut,
  Home,
  Star,
  Folder,
  CalendarDays,
  BarChart3,
  History,
  ChevronDown,
  ChevronRight,
  Plus,
  Mic,
  User,
  Lightbulb,
  Zap,
  GripHorizontal,
} from "lucide-react";
import { tasksStore, useTasks, type Task, type Priority } from "@/lib/tasks";

export const Route = createFileRoute("/")({
  component: PulseTasksApp,
  head: () => ({
    meta: [
      { title: "Pulse Tasks 2.0 — AI Chief of Staff" },
      { name: "description", content: "AI-powered task management to keep your day on track." },
    ],
  }),
});

type PrepMap = Record<string, { steps: string[]; done: boolean[]; expanded: boolean }>;

const seedPrep: PrepMap = {
  "t-1": {
    steps: ["Refine pitch deck", "Practice opening", "Send calendar invite"],
    done: [true, true, false],
    expanded: false,
  },
  "t-2": {
    steps: ["Push final commit", "Write README", "Record demo", "Upload zip", "Submit form"],
    done: [false, false, false, false, false],
    expanded: false,
  },
};

function PulseTasksApp() {
  const tasks = useTasks();
  const [aiInput, setAiInput] = useState("");
  const [prep, setPrep] = useState<PrepMap>(seedPrep);
  const [activeNav, setActiveNav] = useState("home");
  const [activeList, setActiveList] = useState("my");
  const [listsOpen, setListsOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tasksStore.hydrate();
  }, []);

  const byPriority = (p: Priority) => tasks.filter((t) => t.priority === p && !t.done);

  const togglePrep = (id: string) =>
    setPrep((p) => ({
      ...p,
      [id]: p[id]
        ? { ...p[id], expanded: !p[id].expanded }
        : { steps: [], done: [], expanded: true },
    }));

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0E17] text-[#E8EAF0] font-sans relative">
      <TopBar />
      <GuestBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          active={activeNav}
          setActive={setActiveNav}
          activeList={activeList}
          setActiveList={setActiveList}
          listsOpen={listsOpen}
          setListsOpen={setListsOpen}
        />
        <main className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <Hero />
          <AiCommandBar value={aiInput} onChange={setAiInput} inputRef={inputRef} />
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Today's tasks</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <PriorityColumn
                title="High priority"
                dotColor="bg-red-500"
                tint="from-red-500/[0.06] to-transparent border-red-500/20"
                tasks={byPriority("high")}
                prep={prep}
                togglePrep={togglePrep}
              />
              <PriorityColumn
                title="Medium priority"
                dotColor="bg-amber-400"
                tint="from-amber-400/[0.06] to-transparent border-amber-400/20"
                tasks={byPriority("medium")}
                prep={prep}
                togglePrep={togglePrep}
              />
              <PriorityColumn
                title="Low priority"
                dotColor="bg-emerald-400"
                tint="from-emerald-400/[0.06] to-transparent border-emerald-400/20"
                tasks={byPriority("low")}
                prep={prep}
                togglePrep={togglePrep}
              />
            </div>
          </section>
          <section className="pt-4">
            <div className="flex justify-center mb-3">
              <GripHorizontal className="w-8 h-3 text-[#2A3142]" />
            </div>
            <h2 className="text-xl font-semibold text-white">Previous tasks</h2>
            <PreviousTasks tasks={tasks.filter((t) => t.done)} />
          </section>
        </main>
      </div>
    </div>
  );
}

/* ---------- TOP BAR ---------- */
function TopBar() {
  return (
    <header className="sticky top-0 z-30 h-14 px-5 flex items-center gap-4 bg-[#0B0F1A]/95 backdrop-blur border-b border-[#1E2433]">
      <div className="flex items-center gap-2 min-w-[230px]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#5B8DEF] to-[#22D3A5] grid place-items-center shadow-[0_0_18px_-4px_rgba(91,141,239,0.6)]">
          <Check className="w-4 h-4 text-white" strokeWidth={3} />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-semibold text-white tracking-tight">Pulse Tasks</span>
          <span className="text-[10px] text-[#8A90A2] font-medium">2.0</span>
        </div>
      </div>
      <div className="flex-1 max-w-2xl mx-auto relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#8A90A2]" />
        <input
          placeholder="Search tasks..."
          className="w-full h-10 pl-11 pr-4 rounded-full bg-[#121725] border border-[#1E2433] text-sm placeholder:text-[#8A90A2] focus:outline-none focus:border-[#5B8DEF]/50"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 h-9 px-3 rounded-full bg-[#121725] border border-[#1E2433]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="text-xs text-[#E8EAF0]">Gemini standby</span>
        </div>
        <IconBtn>
          <Sparkles className="w-4 h-4 text-[#A78BFA]" />
        </IconBtn>
        <IconBtn>
          <Settings className="w-4 h-4 text-[#8A90A2]" />
        </IconBtn>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] grid place-items-center text-xs font-semibold text-white">
          JI
        </div>
        <IconBtn>
          <LogOut className="w-4 h-4 text-[#8A90A2]" />
        </IconBtn>
      </div>
    </header>
  );
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="w-9 h-9 grid place-items-center rounded-full hover:bg-[#1A2030] transition-colors">
      {children}
    </button>
  );
}

function GuestBanner() {
  return (
    <div className="h-9 px-4 flex items-center justify-center text-xs text-[#B8C0D0] bg-[#0F1B33] border-b border-[#1E2433]">
      <span>
        👋 You are in guest mode — this is a live demo of Pulse Tasks 2.0. Sign in with Google to
        save your real tasks.
      </span>
    </div>
  );
}

/* ---------- SIDEBAR ---------- */
function Sidebar({
  active,
  setActive,
  activeList,
  setActiveList,
  listsOpen,
  setListsOpen,
}: {
  active: string;
  setActive: (s: string) => void;
  activeList: string;
  setActiveList: (s: string) => void;
  listsOpen: boolean;
  setListsOpen: (v: boolean) => void;
}) {
  const nav = [
    { id: "home", label: "Home", icon: Home },
    { id: "starred", label: "Starred", icon: Star },
    { id: "lists", label: "All lists", icon: Folder },
    { id: "plan", label: "Today's plan", icon: CalendarDays, badge: "AI" },
    { id: "habits", label: "Habit tracker", icon: BarChart3 },
  ];
  const lists = [
    { id: "my", label: "My Tasks" },
    { id: "hack", label: "Hackathon Tasks" },
    { id: "inbox", label: "Personal Inbox" },
  ];
  return (
    <aside className="w-[250px] shrink-0 bg-[#0B0F1A] border-r border-[#1E2433] flex flex-col p-3 gap-1">
      {nav.map((n) => {
        const Icon = n.icon;
        const isActive = active === n.id;
        return (
          <button
            key={n.id}
            onClick={() => setActive(n.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-[#5B8DEF]/15 text-[#5B8DEF]"
                : "text-[#B8C0D0] hover:bg-[#121725]"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="flex-1 text-left">{n.label}</span>
            {n.badge && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#5B8DEF]/20 text-[#5B8DEF]">
                {n.badge}
              </span>
            )}
          </button>
        );
      })}
      <div className="my-2 border-t border-[#1E2433]" />
      <button
        onClick={() => setActive("previous")}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
          active === "previous"
            ? "bg-[#5B8DEF]/15 text-[#5B8DEF]"
            : "text-[#B8C0D0] hover:bg-[#121725]"
        }`}
      >
        <History className="w-4 h-4" />
        Previous tasks
      </button>
      <div className="mt-4">
        <button
          onClick={() => setListsOpen(!listsOpen)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#8A90A2] hover:text-[#B8C0D0]"
        >
          My Lists
          <ChevronDown
            className={`w-3 h-3 transition-transform ${listsOpen ? "" : "-rotate-90"}`}
          />
        </button>
        {listsOpen && (
          <div className="mt-1 flex flex-col gap-1">
            {lists.map((l) => {
              const isActive = activeList === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setActiveList(l.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                    isActive
                      ? "bg-[#5B8DEF]/15 text-[#5B8DEF]"
                      : "text-[#B8C0D0] hover:bg-[#121725]"
                  }`}
                >
                  <Folder className="w-4 h-4" />
                  {l.label}
                </button>
              );
            })}
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#5B8DEF] hover:bg-[#121725]">
              <Plus className="w-4 h-4" />
              Create new list
            </button>
          </div>
        )}
      </div>
      <div className="flex-1" />
      <div className="rounded-xl bg-[#121725] border border-[#1E2433] p-3 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] grid place-items-center text-xs font-semibold text-white">
            JI
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-white">Jitesh</span>
            <span className="text-[10px] font-semibold text-amber-400 tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3" /> CHIEF OF STAFF
            </span>
          </div>
        </div>
        <div className="self-start px-2 py-1 rounded-full bg-[#5B8DEF]/15 text-[#5B8DEF] text-[10px] font-semibold flex items-center gap-1">
          <Zap className="w-3 h-3" /> Pulse: 78
        </div>
      </div>
    </aside>
  );
}

/* ---------- HERO ---------- */
function Hero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#1E2433] bg-[#0E1320] py-16 px-8">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(91,141,239,0.18), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.15))",
        }}
      />
      <div className="relative text-center">
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight">
          <span className="text-white">Tasks </span>
          <span className="bg-gradient-to-r from-[#5B8DEF] to-[#8B5CF6] bg-clip-text text-transparent">
            2.0
          </span>
        </h1>
        <p className="mt-3 text-[#8A90A2] text-sm">Don't forget yours!</p>
      </div>
    </div>
  );
}

/* ---------- AI COMMAND BAR ---------- */
function AiCommandBar({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const chips = ["/ Break it down", "/ Rescue me", "/ Plan my day", "/ Habit check"];
  return (
    <div className="rounded-2xl border border-[#1E2433] bg-[#121725] p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#5B8DEF] to-[#8B5CF6] grid place-items-center shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask your AI chief of staff anything..."
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#8A90A2]"
        />
        <button className="w-9 h-9 rounded-full bg-[#1A2030] hover:bg-[#222B3D] grid place-items-center transition-colors">
          <Mic className="w-4 h-4 text-[#B8C0D0]" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c.replace("/ ", "") + " ")}
            className="px-3 py-1.5 rounded-full text-xs text-[#B8C0D0] bg-[#1A2030] hover:bg-[#222B3D] border border-[#1E2433] transition-colors"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- PRIORITY COLUMN ---------- */
function PriorityColumn({
  title,
  dotColor,
  tint,
  tasks,
  prep,
  togglePrep,
}: {
  title: string;
  dotColor: string;
  tint: string;
  tasks: Task[];
  prep: PrepMap;
  togglePrep: (id: string) => void;
}) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-b ${tint} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">{title}</h3>
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shadow-[0_0_8px_currentColor]`} />
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            dotColor={dotColor}
            prep={prep[t.id]}
            onToggleExpand={() => togglePrep(t.id)}
          />
        ))}
        <button className="flex items-center gap-2 text-xs text-[#8A90A2] hover:text-[#B8C0D0] px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Task
        </button>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  dotColor,
  prep,
  onToggleExpand,
}: {
  task: Task;
  dotColor: string;
  prep?: { steps: string[]; done: boolean[]; expanded: boolean };
  onToggleExpand: () => void;
}) {
  const completed = prep ? prep.done.filter(Boolean).length : 0;
  const total = prep ? prep.steps.length : 0;
  return (
    <div className="rounded-xl bg-[#121725] border border-[#1E2433] p-3 hover:border-[#2A3142] transition-colors">
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => tasksStore.toggle(task.id)}
          className="w-4 h-4 mt-0.5 rounded border border-[#3A4255] hover:border-[#5B8DEF] shrink-0 grid place-items-center"
        >
          {task.done && <Check className="w-3 h-3 text-[#5B8DEF]" />}
        </button>
        <span className={`w-2 h-2 mt-1.5 rounded-full ${dotColor} shrink-0`} />
        <span className="text-sm text-white leading-snug flex-1">{task.title}</span>
      </div>
      {task.group && (
        <div className="flex items-center gap-1.5 text-xs text-[#8A90A2] mt-2 ml-8">
          <User className="w-3 h-3" />
          {task.group}
        </div>
      )}
      {prep && prep.steps.length > 0 && (
        <div className="mt-2 ml-8">
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1 text-[#5B8DEF] hover:text-[#7BA6FF]"
            >
              {prep.expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              Prep steps ({completed}/{total})
            </button>
            <button className="flex items-center gap-1 text-amber-400 hover:text-amber-300">
              <Lightbulb className="w-3.5 h-3.5" />
              Insights
            </button>
          </div>
          {prep.expanded && (
            <ul className="mt-2 space-y-1.5">
              {prep.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-[#B8C0D0]">
                  <span
                    className={`w-3 h-3 rounded border ${
                      prep.done[i] ? "bg-[#5B8DEF] border-[#5B8DEF]" : "border-[#3A4255]"
                    }`}
                  />
                  <span className={prep.done[i] ? "line-through text-[#6A7180]" : ""}>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PreviousTasks({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-[#8A90A2] mt-3">No completed tasks yet — finish one to see it here.</p>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      {tasks.map((t) => (
        <div
          key={t.id}
          className="rounded-xl bg-[#121725] border border-[#1E2433] p-3 flex items-center gap-3"
        >
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-[#8A90A2] line-through">{t.title}</span>
        </div>
      ))}
    </div>
  );
}
