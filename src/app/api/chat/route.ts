import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/session";
import { runAgent, type AgentEvent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

type ChatRequest = {
  messages: Anthropic.MessageParam[];
};

function encodeEvent(event: AgentEvent): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "messages must be a non-empty array" },
      { status: 400 }
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runAgent({
          messages: body.messages,
          trigger: "chat",
          onEvent: (event) => {
            controller.enqueue(encodeEvent(event));
          },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        controller.enqueue(encodeEvent({ type: "error", message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
