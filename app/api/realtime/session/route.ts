import { realtimeCompositionToolDefinitions } from "@/lib/meant/composition-webmcp";
import {
  authenticateModelRequest,
  readBoundedBody,
  reserveModelRequestBudget,
} from "@/lib/server/request-security";

const instructions = `You are Meant, a concise voice-native design partner. Help the person shape the visible composition through conversation.
Speak in short, natural sentences. Never narrate property names or internal schemas. Let the person interrupt you.
Use get_composition_context before changing the work. When the person wants to start a deck, poster, or infographic, use create_composition_draft with their brief. Use preview_composition_turn for normal spoken directions and preview_composition_change only when you already have exact canonical operations.
When the person explicitly asks to Keep, Discard, or Undo, call the matching tool to request confirmation, then direct them to the visible Meant control. Tool calls never make those consequential decisions by themselves.
For Undo, use the exact latest eligible committed change from context. Ask one focused question only when ambiguity would materially change structure or meaning.
Do not invent external facts or publish, share, or export anything.`;

export async function POST(request: Request) {
  const identity = await authenticateModelRequest(request);
  if (!identity.ok) return identity.response;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/sdp")) {
    return Response.json({ error: "A WebRTC session description is required." }, { status: 415 });
  }
  const bounded = await readBoundedBody(request, 100_000, "WebRTC offer");
  if (!bounded.ok) return bounded.response;
  let sdp: string;
  try {
    sdp = new TextDecoder("utf-8", { fatal: true }).decode(bounded.value);
  } catch {
    return Response.json({ error: "The WebRTC offer is invalid." }, { status: 400 });
  }
  if (!sdp.trim()) return Response.json({ error: "The WebRTC offer is empty." }, { status: 400 });

  if (process.env.NODE_ENV === "production" && process.env.MEANT_ENABLE_REALTIME_VOICE !== "true") {
    return Response.json({ error: "Realtime voice is not enabled for this deployment." }, { status: 503 });
  }

  const apiKey = (process.env.OPENAI_API_KEY ?? process.env.demo_open_api_key)?.trim();
  if (!apiKey) return Response.json({ error: "Realtime voice is not configured for this deployment." }, { status: 503 });
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify({
    type: "realtime",
    model: "gpt-realtime-2.1",
    instructions,
    max_output_tokens: 768,
    truncation: {
      type: "retention_ratio",
      retention_ratio: 0.8,
      token_limits: { post_instructions: 8_000 },
    },
    output_modalities: ["audio"],
    audio: {
      input: {
        transcription: { model: "gpt-realtime-whisper", language: "en" },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "low",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: "marin", speed: 1.05 },
    },
    tools: realtimeCompositionToolDefinitions(),
    tool_choice: "auto",
  }));
  try {
    const budget = await reserveModelRequestBudget(identity.principal.id, "realtime");
    if (budget) return budget;
    const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": identity.safetyIdentifier,
      },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    const answer = await upstream.text();
    if (!upstream.ok) {
      let message = "Meant could not start the live voice session.";
      try { message = (JSON.parse(answer) as { error?: { message?: string } }).error?.message ?? message; } catch { /* plain upstream error */ }
      return Response.json({ error: message }, { status: upstream.status });
    }
    return new Response(answer, { status: 200, headers: { "content-type": "application/sdp", "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Realtime voice could not reach the conversation service." }, { status: 502 });
  }
}
