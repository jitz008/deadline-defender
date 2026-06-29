import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkle, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/saver-logo.png";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Saver — your AI productivity companion" },
      {
        name: "description",
        content:
          "An AI companion that turns your overwhelm into a clear, prioritized plan — and pushes you to start the next 25 minutes.",
      },
      { property: "og:title", content: "Saver — your AI productivity companion" },
      {
        property: "og:description",
        content:
          "Last-minute life saver. Plan, prioritize, and finish what matters before deadlines slip.",
      },
    ],
  }),
  component: Index,
});

const STORAGE_KEY = "saver:messages:v1";

const QUICK_PROMPTS = [
  { label: "Plan my day", text: "Here's what's on my plate today — help me plan it." },
  { label: "Untangle a deadline", text: "I have a deadline I'm scared of. Help me break it down." },
  { label: "Beat procrastination", text: "I'm procrastinating. Give me a tiny next step I can start in 5 minutes." },
  { label: "Weekly review", text: "Walk me through a quick weekly review for what I got done and what's next." },
];

function loadMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UIMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function Index() {
  const [initialMessages] = useState<UIMessage[]>(() => loadMessages());
  const [input, setInput] = useState("");
  const transportRef = useRef(new DefaultChatTransport({ api: "/api/chat" }));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: "saver-main",
    messages: initialMessages,
    transport: transportRef.current,
    onError: (err) => {
      console.error(err);
      toast.error(err.message || "Something went wrong.");
    },
  });

  // Persist to localStorage whenever messages change and we're idle/done.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status === "submitted" || status === "streaming") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore quota */
    }
  }, [messages, status]);

  // Keep textarea focused.
  useEffect(() => {
    textareaRef.current?.focus();
  }, [status]);

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = (message: PromptInputMessage) => {
    const text = (message.text ?? "").trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
  };

  const handleQuick = (text: string) => {
    if (isBusy) return;
    sendMessage({ text });
  };

  const handleClear = () => {
    setMessages([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    toast("Cleared. Fresh start.");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Toaster richColors theme="dark" position="top-center" />

      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img
              src={logo}
              alt="Saver"
              width={32}
              height={32}
              className="h-8 w-8 drop-shadow-[0_0_18px_rgba(124,92,255,0.55)]"
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Saver</div>
              <div className="text-[11px] text-muted-foreground">
                The last-minute life saver
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
              <span
                className="h-1.5 w-1.5 rounded-full bg-accent"
                style={{ animation: "pulse-dot 2.2s ease-in-out infinite" }}
              />
              AI online
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
        {messages.length === 0 ? (
          <EmptyState onPick={handleQuick} />
        ) : (
          <Conversation className="flex-1">
            <ConversationContent className="space-y-4 py-6">
              {messages.map((m) => (
                <Message key={m.id} from={m.role}>
                  <MessageContent
                    className={
                      m.role === "assistant"
                        ? "bg-transparent p-0 text-foreground"
                        : "bg-primary text-primary-foreground"
                    }
                  >
                    {m.parts.map((part, i) => {
                      if (part.type === "text") {
                        return m.role === "assistant" ? (
                          <MessageResponse key={i}>{part.text}</MessageResponse>
                        ) : (
                          <span key={i} className="whitespace-pre-wrap">
                            {part.text}
                          </span>
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
              ))}
              {status === "submitted" && (
                <Message from="assistant">
                  <MessageContent className="bg-transparent p-0">
                    <Shimmer>Thinking through your plan…</Shimmer>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border/60 bg-background/80 px-4 pb-5 pt-3 backdrop-blur-md">
          <div className="mx-auto w-full max-w-3xl">
            <PromptInput onSubmit={handleSubmit}>
              <PromptInputTextarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tell me what's on your plate…"
                className="min-h-[56px]"
              />
              <PromptInputFooter className="justify-between">
                <div className="text-[11px] text-muted-foreground">
                  <kbd className="rounded border border-border bg-card/80 px-1.5 py-0.5 font-mono text-[10px]">
                    Enter
                  </kbd>{" "}
                  to send · <kbd className="rounded border border-border bg-card/80 px-1.5 py-0.5 font-mono text-[10px]">Shift</kbd>+<kbd className="rounded border border-border bg-card/80 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> for new line
                </div>
                {isBusy ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    onClick={() => stop()}
                    aria-label="Stop"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <PromptInputSubmit
                    status={status}
                    disabled={!input.trim()}
                    aria-label="Send"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </PromptInputSubmit>
                )}
              </PromptInputFooter>
            </PromptInput>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Conversations stay in your browser.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 -z-10 rounded-full bg-primary/30 blur-2xl" />
        <img
          src={logo}
          alt=""
          width={88}
          height={88}
          className="h-22 w-22"
        />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Stop missing what <span className="gradient-text">matters</span>.
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
        Dump your tasks, deadlines, and worries. I'll turn them into a prioritized
        plan and push you to start the next 25 minutes.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            onClick={() => onPick(q.text)}
            className="group glass-panel flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all hover:border-primary/60 hover:bg-card"
          >
            <Sparkle className="mt-0.5 h-4 w-4 shrink-0 text-accent transition-transform group-hover:scale-110" />
            <div>
              <div className="text-sm font-medium text-foreground">{q.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{q.text}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
