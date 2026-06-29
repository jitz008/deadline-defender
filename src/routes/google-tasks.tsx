import { createFileRoute, Link } from "@tanstack/react-router";
import { ListTodo, ArrowLeft, Check } from "lucide-react";
import { mockGoogleTasks } from "@/lib/integrations";

export const Route = createFileRoute("/google-tasks")({ component: GoogleTasksPage });

function GoogleTasksPage() {
  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
            <ListTodo className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Google Tasks</h1>
            <p className="text-sm text-white/50">Items from your Google Tasks lists (mock data)</p>
          </div>
        </div>
        <div className="space-y-2">
          {mockGoogleTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="grid size-5 place-items-center rounded border border-white/20">
                {t.done && <Check className="size-3 text-emerald-300" />}
              </div>
              <div className="flex-1">
                <div className="font-medium">{t.title}</div>
                <div className="mt-0.5 text-xs text-white/50">{t.list}{t.due ? ` · ${t.due}` : ""}</div>
              </div>
              <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-200">Tasks</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
