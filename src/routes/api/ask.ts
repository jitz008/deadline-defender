import { getGeminiModel } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

const SYSTEM_PROMPT = `You are the AI chief of staff inside Pulse Tasks 2.0.
Be sharp, specific, and warm. Always tailor your reply to exactly what the user said — never give a generic answer.

You will be told the user's CURRENT LOCAL TIME on each request. Use it to reason about "today", "tonight", "tomorrow", deadlines, and scheduling. Never invent a different time.

STYLE:
- Short, conversational, helpful. ONE fact per line. Each line under 14 words. Use line breaks between facts.
- No long paragraphs. No emojis. No filler like "I'd be happy to".
- Reference the user's actual tasks/profile when relevant.

STRUCTURED TAGS — use ONLY when the user's intent matches. Otherwise just reply in plain lines.
- Day planning (only if user asks to plan, schedule, or organize the day): TIME: HH:MM AM/PM - HH:MM AM/PM | TASK: [task name] | PRIORITY: high|medium|low
- Task breakdown (only if user asks to break down / split a task): SUBTASK: [text] (max 5)
- Insights (only if user asks for advice/insights/why): INSIGHT: [text] (max 3)
- Rescue mode (only if user is overwhelmed or asks what to do now): NOW: [single most important action]
- Habit check (only if user asks about habits/consistency): HABIT: [name] | STATUS: on-track|at-risk|missed | NOTE: [brief]
- New commitment captured (only when user mentions a NEW meeting/deadline/errand/bill/appointment): SUGGEST_TASK: [title] | PRIORITY: high|medium|low | TIME: [human time]
- Clarification needed: QUICK_OPTIONS: ["opt1","opt2","opt3"]

ALWAYS end with 2-4 relevant follow-up chips:
FOLLOW_UPS: ["question 1","question 2"]`;

type Body = { message?: string; taskContext?: unknown; profile?: string; history?: unknown; currentTime?: string };

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { message, taskContext, profile, history, currentTime } = (await request.json()) as Body;
        if (!message || typeof message !== "string") {
          return new Response("message required", { status: 400 });
        }
        const nowStr = currentTime ? new Date(currentTime).toString() : new Date().toString();
        const model = getGeminiModel();
        try {
          const { text } = await generateText({
            model,
            system: SYSTEM_PROMPT,
            prompt: `CURRENT LOCAL TIME: ${nowStr}\n\nUser profile: ${profile || "(none provided)"}\n\nCurrent tasks:\n${JSON.stringify(taskContext ?? [], null, 2)}\n\nRecent chat:\n${JSON.stringify(history ?? [], null, 2)}\n\nUser: ${message}`,
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
