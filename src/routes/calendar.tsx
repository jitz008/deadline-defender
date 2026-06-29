import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Clock, ArrowLeft, Wifi } from "lucide-react";
import { mockCalendarEvents } from "@/lib/integrations";
import { AnimatedBackground } from "@/components/AnimatedBackground";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

function CalendarPage() {
  return (
    <div className="relative min-h-screen text-white">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Synced from Google Calendar</div>
              <h1 className="text-2xl font-semibold">Upcoming events</h1>
              <p className="text-sm text-white/50">Agenda pulled from your calendar</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">
            <Wifi className="size-3" /> Mock data
          </span>
        </div>
        <div className="space-y-2">
          {mockCalendarEvents.map((e) => (
            <div key={e.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{e.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/55">
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{e.startTime} – {e.endTime}</span>
                    {e.due && <span className="text-white/40">· {e.due}</span>}
                    {e.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{e.location}</span>}
                  </div>
                </div>
                <span className="rounded-full border border-blue-400/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-200">Calendar</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
