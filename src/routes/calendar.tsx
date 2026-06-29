import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ArrowLeft } from "lucide-react";
import { mockCalendarEvents } from "@/lib/integrations";
import { AnimatedBackground } from "@/components/AnimatedBackground";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

function CalendarPage() {
  const events = mockCalendarEvents;
  return (
    <div className="relative min-h-screen text-white">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
            <CalendarDays className="size-5" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Google Calendar</div>
            <h1 className="text-2xl font-semibold">Upcoming events</h1>
            <p className="text-sm text-white/50">Connect your calendar to sync events here.</p>
          </div>
        </div>
        {events.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-16 text-center text-sm text-white/50 backdrop-blur-sm">
            No events synced yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
