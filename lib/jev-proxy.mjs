import { buildJevRequest } from "../js/providers/jev.js";

// Shared by the local Node server and the Vercel functions, so both hosts
// validate, forward and report TypeSafe failures the same way. The API key
// stays on the server; the browser only ever sees the proxied answer.

export const MAX_REQUEST_BYTES = 64 * 1024;
export const JEV_MODEL = "jev-latest";
const TYPE_SAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const UPSTREAM_TIMEOUT_MS = 7500;

export function jevStatus(apiKey) {
  return { configured: Boolean(apiKey), model: JEV_MODEL };
}

export function parseJevBody(text) {
  if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) {
    throw new Error("Request body is too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

/** Returns `{ status, body }` for the caller to send as JSON. */
export async function proxyJevDecision(body, apiKey) {
  if (!apiKey) {
    return { status: 503, body: { error: "Jev is not configured on this server." } };
  }

  let upstreamRequest;
  try {
    upstreamRequest = buildJevRequest(body?.context, body?.availableActions);
  } catch (error) {
    return { status: 400, body: { error: error.message } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(TYPE_SAFE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(upstreamRequest),
      signal: controller.signal
    });

    if (!upstreamResponse.ok) {
      return {
        status: 502,
        body: { error: `TypeSafe rejected the request with HTTP ${upstreamResponse.status}.` }
      };
    }

    try {
      return { status: 200, body: await upstreamResponse.json() };
    } catch {
      return { status: 502, body: { error: "TypeSafe returned unreadable JSON." } };
    }
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? "TypeSafe did not respond before the server timeout."
        : "The server could not reach TypeSafe.";
    return { status: 502, body: { error: message } };
  } finally {
    clearTimeout(timeout);
  }
}
