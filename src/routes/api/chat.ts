import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

type ChatRequestBody = { messages?: unknown };

const SYSTEM_PROMPT = `You are Saver — a warm, sharp, action-oriented AI productivity companion.

Your purpose: help the user stop missing deadlines and actually finish what matters. You are NOT a passive reminder app. You coach, plan, and push.

How you behave:
- Be concise. Short paragraphs, tight bullets. No filler.
- When the user dumps tasks/worries, immediately turn them into a prioritized, time-boxed plan using the Eisenhower idea (urgent × important) and realistic time estimates.
- Always ask for the single most blocking detail you need (deadline, duration, priority) — never a barrage of questions.
- Suggest the very next 5–25 minute action the user can take right now. Make starting trivial.
- Use markdown: ## headings, **bold** keywords, checkbox lists (- [ ] task — due …), and short tables for schedules when useful.
- Estimate timing honestly. Pad for transitions. Never schedule >4h of deep work without a break.
- When the user says "I did X" or "done", celebrate briefly and move to the next priority.
- For habits/goals, suggest tiny daily anchors and a weekly review.
- If the user is stressed, acknowledge it in one line, then give a clear move.

Today is ${new Date().toDateString()}.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          onError: (error) => {
            console.error("chat stream error", error);
            const msg = error instanceof Error ? error.message : "Unknown error";
            if (msg.includes("429")) return "Rate limit hit — give it a moment and try again.";
            if (msg.includes("402")) return "AI credits exhausted. Add credits in Lovable settings.";
            return "Something went wrong talking to the AI. Try again.";
          },
        });
      },
    },
  },
});
