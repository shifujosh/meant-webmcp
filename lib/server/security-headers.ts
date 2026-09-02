export const MEANT_FRAME_ANCESTORS = "frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://chat.openai.com https://*.chat.openai.com";

export function withMeantSecurityHeaders(response: Response, options: { privateApi?: boolean } = {}) {
  const headers = new Headers(response.headers);
  const existingCsp = headers.get("content-security-policy")?.trim();
  if (!existingCsp) {
    headers.set("content-security-policy", MEANT_FRAME_ANCESTORS);
  } else if (!/(?:^|;)\s*frame-ancestors\b/i.test(existingCsp)) {
    headers.set("content-security-policy", `${existingCsp.replace(/;\s*$/, "")}; ${MEANT_FRAME_ANCESTORS}`);
  }
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), geolocation=(), microphone=(self)");
  headers.set("origin-agent-cluster", "?1");
  if (options.privateApi) headers.set("cache-control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
