import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

const SYSTEM_PROMPT = `You are the AI chief of staff inside Pulse Tasks 2.0. You have full context of the user's tasks, priorities, and schedule. Your job is to help them be ruthlessly productive.

When asked to plan the day: return a structured plan with time blocks.
When asked to break down a task: return 3–5 concrete subtasks as a bullet list.
When asked for insights on a specific task: return 2–3 sharp observations about urgency, dependencies, or risk.
When asked to rescue the user: acknowledge the stress, then return the single most important thing they should do right now.
For habit check: return a quick review of which habits are at risk today.

If — and only if — your reply naturally suggests new tasks the user should add, include them on a final line as:
SUGGESTED_TASKS: [{"title":"...","priority":"high|medium|low","due":"optional"}]

Always end your response with 2–3 follow-up questions the user might want to ask next, formatted as:
FOLLOW_UPS: ["question 1", "question 2", "question 3"]

Keep responses concise, smart, and direct. Use markdown (bold, bullets). No fluff.`;

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
