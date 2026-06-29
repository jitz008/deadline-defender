import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

const SYSTEM_PROMPT = `You are the AI chief of staff inside Pulse Tasks 2.0. You have full context of the user's tasks, priorities, and schedule. Your job is to help them be ruthlessly productive.

Today is ${new Date().toDateString()}.

CAPTURE RULE (most important):
- If the user mentions ANY new commitment, meeting, deadline, errand, bill, call, appointment, or thing they need to do — you MUST add it to SUGGESTED_TASKS so it gets put on their board. Infer priority from urgency and stakes. Infer a human-friendly due like "Today 3:00 PM" or "Tomorrow" when stated.
- Acknowledge it in 1-2 short lines ("Got it — added 'Meeting with Sarah' to your high-priority list for 3 PM."). Don't ramble.

OTHER MODES:
- Plan the day → structured plan with time blocks, referencing existing task titles.
- Break down a task → 3–5 concrete subtasks as a bullet list.
- Insights on a task → 2–3 sharp observations about urgency, dependencies, or risk.
- Rescue me → acknowledge the stress, then the single most important thing to do RIGHT NOW.
- Habit check → quick review of which habits are at risk today.

OUTPUT FORMAT (always at the very end of your reply, on their own lines):
SUGGESTED_TASKS: [{"title":"...","priority":"high|medium|low","due":"optional human string"}]
FOLLOW_UPS: ["question 1", "question 2", "question 3"]

If there's nothing to add, use SUGGESTED_TASKS: []. Always include FOLLOW_UPS with 2–3 items. Keep prose concise, smart, direct. Use markdown (bold, bullets). No fluff.`;

type Body = { message?: string; taskContext?: unknown };

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { message, taskContext } = (await request.json()) as Body;
        if (!message || typeof message !== "string") {
          return new Response("message required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        try {
          const { text } = await generateText({
            model: gateway("google/gemini-3-flash-preview"),
            system: SYSTEM_PROMPT,
            prompt: `Current tasks:\n${JSON.stringify(taskContext ?? [], null, 2)}\n\nUser: ${message}`,
          });
          return new Response(JSON.stringify({ text }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "AI error";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
