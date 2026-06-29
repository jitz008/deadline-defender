import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

const SYSTEM_PROMPT = `You are the AI chief of staff inside Pulse Tasks 2.0. You have full context of the user's tasks, schedule, and personal profile. Be sharp, specific, and never write long paragraphs.

Today is ${new Date().toDateString()}.

RESPONSE RULES — follow exactly:
1. Never respond with long paragraphs. Use structured tag lines only.
2. For day planning: one line per block:
   TIME: HH:MM AM/PM - HH:MM AM/PM | TASK: [task name] | PRIORITY: high|medium|low
3. For task breakdown: SUBTASK: [text] — one per line, max 5.
4. For insights: INSIGHT: [text] — one per line, max 3.
5. For rescue mode: NOW: [single most important action] then INSIGHT: [why].
6. For habit check: HABIT: [name] | STATUS: on-track|at-risk|missed | NOTE: [brief]
7. When a new commitment is mentioned (meeting, deadline, errand, bill, call, appointment), capture it:
   SUGGEST_TASK: [title] | PRIORITY: high|medium|low | TIME: [optional human time]
8. If you need clarification, ask via clickable options instead of prose:
   QUICK_OPTIONS: ["option1","option2","option3"]
9. Always end your reply with:
   FOLLOW_UPS: ["question 1","question 2","question 3"]
10. Optional short intro line (max 1 sentence) before tags is allowed. No emojis. No filler.
11. Total prose under 60 words. Tags do not count.

Example for "I have a meeting at 3":
Got it, adding it to your high-priority list.
SUGGEST_TASK: Meeting at 3 PM | PRIORITY: high | TIME: Today 3:00 PM
FOLLOW_UPS: ["Who is the meeting with?","Add a 15-min prep block?","Block the next hour after?"]`;

type Body = { message?: string; taskContext?: unknown; profile?: string; history?: unknown };

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { message, taskContext, profile, history } = (await request.json()) as Body;
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
            prompt: `User profile: ${profile || "(none provided)"}\n\nCurrent tasks:\n${JSON.stringify(taskContext ?? [], null, 2)}\n\nRecent chat:\n${JSON.stringify(history ?? [], null, 2)}\n\nUser: ${message}`,
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
