import {
  authenticateModelRequest,
  readBoundedBody,
  reserveModelRequestBudget,
} from "@/lib/server/request-security";

const TRANSCRIPTION_CONTEXT =
  "A person is directing creative work inside Meant, an adaptive design workspace. " +
  "Preserve concise design language, layer names, colors, measurements, and commands. " +
  "The person may switch naturally between English and Spanish.";

const KEYWORDS = [
  "GHOSA",
  "WebMCP",
  "Expression Packet",
  "Voice Envelope",
  "Authority Envelope",
  "intent contract",
  "Homecoming Protocol",
  "Protoperfect",
  "Bobalicious",
  "Aglet",
  "Squawk",
  "Figma",
  "Canva",
];

const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function transcriptionText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const text = (payload as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}

export async function POST(request: Request) {
  const identity = await authenticateModelRequest(request);
  if (!identity.ok) return identity.response;
  if (process.env.NODE_ENV === "production" && process.env.MEANT_ENABLE_RECORDED_TRANSCRIPTION !== "true") {
    return jsonError("Recorded voice capture is not enabled. Use live voice or type your direction.", 503);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError("A recorded voice turn is required.", 415);
  }

  let body: FormData;
  try {
    const bounded = await readBoundedBody(request, 9_000_000, "Voice direction");
    if (!bounded.ok) return bounded.response;
    body = await new Response(bounded.value, { headers: { "content-type": contentType } }).formData();
  } catch {
    return jsonError("That voice turn could not be read.", 400);
  }

  const audio = body.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return jsonError("No speech was recorded.", 400);
  }
  if (audio.size > 8_000_000) {
    return jsonError("That voice recording exceeds Meant's upload limit.", 413);
  }
  const baseType = audio.type.split(";")[0]?.toLowerCase();
  if (baseType && !SUPPORTED_AUDIO_TYPES.has(baseType)) {
    return jsonError("That audio format is not supported.", 415);
  }

  const apiKey = (process.env.OPENAI_API_KEY ?? process.env.demo_open_api_key)?.trim();
  if (!apiKey) return jsonError("Voice capture is not configured for this deployment.", 503);

  const upstreamBody = new FormData();
  upstreamBody.set("file", audio, audio.name || "ghosa-direction.webm");
  upstreamBody.set("model", "gpt-transcribe");
  upstreamBody.set("response_format", "json");
  upstreamBody.set("prompt", TRANSCRIPTION_CONTEXT);
  for (const keyword of KEYWORDS) upstreamBody.append("keywords[]", keyword);
  upstreamBody.append("languages[]", "en");
  upstreamBody.append("languages[]", "es");

  try {
    const budget = await reserveModelRequestBudget(identity.principal.id, "transcribe");
    if (budget) return budget;
    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": identity.safetyIdentifier,
      },
      body: upstreamBody,
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (!upstream.ok) {
      const apiError = payload.error as { message?: string } | undefined;
      return jsonError(apiError?.message ?? "Meant could not hear that direction.", upstream.status);
    }
    const text = transcriptionText(payload);
    if (!text) return jsonError("No speech was detected.", 422);

    return Response.json({
      text,
      model: "gpt-transcribe",
      languages: payload.languages ?? [],
      audioRetained: false,
    }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return jsonError("Voice capture could not reach the transcription service.", 502);
  }
}
