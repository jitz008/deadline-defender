import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { InteractiveDotGrid } from "@/components/InteractiveDotGrid";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <AnimatedBackground />
      <div className="absolute inset-0 z-0">
        <InteractiveDotGrid />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div
            className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-10 backdrop-blur-xl"
            style={{
              boxShadow: "0 0 80px -20px rgba(59,130,246,0.45)",
              maskImage: "radial-gradient(ellipse at center, black 65%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 65%, transparent 100%)",
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/40">
                <Check className="size-7 text-white" strokeWidth={3} />
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight">Pulse Tasks</h1>
              <p className="mt-2 text-sm text-white/55">Your AI chief of staff. Never miss what matters.</p>

              <button
                onClick={() => navigate({ to: "/" })}
                className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white transition hover:-translate-y-px hover:border-white/30 hover:bg-white/[0.1]"
              >
                <GoogleIcon />
                Sign in with Google
              </button>

              <p className="mt-6 text-[11px] text-white/35">
                By continuing you agree to our Terms & Privacy Policy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.9 6.6 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.9 6.6 29.2 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-2 13.2-5.2l-6.1-5c-2 1.4-4.5 2.2-7.1 2.2-5.2 0-9.6-3.1-11.2-7.5l-6.5 5C9.7 39.1 16.3 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.1 5c-.4.4 6.8-4.9 6.8-14.5 0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
