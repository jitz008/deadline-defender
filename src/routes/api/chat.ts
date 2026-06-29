import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

type ChatRequestBody = {
  messages?: unknown;
  taskSnapshot?: string;
};

const SYSTEM_PROMPT = (snapshot: string) => `You are Saver — a warm, decisive AI productivity companion that helps the user manage tasks, plan their day, and stop missing deadlines.

Today is ${new Date().toDateString()}.

You can directly read and modify the user's task list using these tools:
- add_task: create a new task with a title, priority (high|medium|low), optional due (human-readable), optional group, optional notes.
- complete_task: mark a task done by id.
- delete_task: remove a task by id.
- update_task: change a task's title, priority, due, or group.

Rules:
- When the user mentions a thing they need to do, ALWAYS add it via add_task. Don't just acknowledge it.
- Infer priority from urgency, deadlines, and stakes. Be opinionated.
- When the user says "done", "finished", or "did X", call complete_task with the matching id.
- After tool actions, give a SHORT confirmation (1-2 lines) plus the next best move. No long explanations.
- When the user asks to plan their day, propose a time-boxed schedule referencing existing tasks by title. Use markdown bullets.
- Be concise. Energetic. No filler.

${snapshot}`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, taskSnapshot } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);

        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM_PROMPT(taskSnapshot ?? "The user has no open tasks yet."),
          messages: await convertToModelMessages(messages as UIMessage[]),
          stopWhen: ({ steps }) => steps.length >= 6,
          tools: {
            add_task: tool({
              description: "Add a new task to the user's list.",
              inputSchema: z.object({
                title: z.string().describe("Short imperative title"),
                priority: z.enum(["high", "medium", "low"]).default("medium"),
                due: z.string().optional().describe("Human-friendly deadline, e.g. 'Today 5pm'"),
                group: z.string().optional().describe("Project or team name"),
                notes: z.string().optional(),
              }),
              execute: async (input) => ({ ok: true, action: "add_task", ...input }),
            }),
            complete_task: tool({
              description: "Mark a task as done. Use the task id from the snapshot.",
              inputSchema: z.object({ id: z.string() }),
              execute: async (input) => ({ ok: true, action: "complete_task", ...input }),
            }),
            delete_task: tool({
              description: "Delete a task by id.",
              inputSchema: z.object({ id: z.string() }),
              execute: async (input) => ({ ok: true, action: "delete_task", ...input }),
            }),
            update_task: tool({
              description: "Update a task's fields.",
              inputSchema: z.object({
                id: z.string(),
                title: z.string().optional(),
                priority: z.enum(["high", "medium", "low"]).optional(),
                due: z.string().optional(),
                group: z.string().optional(),
              }),
              execute: async (input) => ({ ok: true, action: "update_task", ...input }),
            }),
          },
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
