import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

const SYSTEM = `You are a productivity coach analyzing a user's habit & task stats inside Pulse Tasks 2.0.
Given the user's current stats and the current local time, output 3-5 PERSONALIZED, ACTIONABLE insights
to help them improve efficiency and productivity. Each insight is ONE short sentence (<= 20 words),
specific to their numbers (cite the percentages or counts), and warm but direct.
Format strictly as a JSON array of strings. No markdown, no preamble. Example:
["You complete 80% of morning tasks but only 40% after 6pm — schedule deep work before noon.","..."]`;

export const Route = createFileRoute("/api/gemini-insights")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { stats, currentTime } = (await request.json()) as { stats: unknown; currentTime?: string };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500 });
        const nowStr = currentTime ? new Date(currentTime).toString() : new Date().toString();
        const gateway = createLovableAiGatewayProvider(key);
        try {
          const { text } = await generateText({
            model: gateway("google/gemini-3-flash-preview"),
            system: SYSTEM,
            prompt: `CURRENT LOCAL TIME: ${nowStr}\n\nUser stats:\n${JSON.stringify(stats, null, 2)}\n\nReturn the JSON array of insights.`,
          });
          // Try to parse a JSON array from the text
          let insights: string[] = [];
          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            try { insights = JSON.parse(match[0]); } catch { /* ignore */ }
          }
          if (insights.length === 0) {
            insights = text.split("\n").map((l) => l.replace(/^[-*\d.\s"]+/, "").replace(/"$/, "").trim()).filter(Boolean).slice(0, 5);
          }
          return new Response(JSON.stringify({ insights }), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "AI error";
          return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
