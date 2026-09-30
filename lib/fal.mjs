// Minimal fal.ai queue client: submit, wait, fetch the result.
// https://fal.ai/docs/model-apis/model-endpoints/queue
import { writeFile } from "node:fs/promises";

const QUEUE = "https://queue.fal.run";

export class FalError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "FalError";
    this.details = details;
  }
}

async function readJson(response, what) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!response.ok) {
    const detail = body.detail ?? body.error ?? body.raw ?? response.statusText;
    throw new FalError(`${what} failed (${response.status}): ${typeof detail === "string" ? detail : JSON.stringify(detail)}`, body);
  }
  return body;
}

/**
 * Fetch that retries dropped connections. Only for reads (status, result,
 * download): repeating those costs nothing. Submitting is never retried,
 * because a repeated submit could be charged twice.
 */
async function fetchWithRetry(fetch, url, init, { tries = 4, wait }) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt >= tries) throw error;
      await wait(500 * 2 ** attempt);
    }
  }
}

/**
 * Runs one fal request through the queue and returns its output JSON.
 * @param endpoint e.g. "fal-ai/flux-lora" or "minimax/h3/image-to-video"
 * @param options.onStatus called with each status while waiting
 */
export async function runFal(endpoint, input, { key, fetch = globalThis.fetch, pollMs = 2000, timeoutMs = 15 * 60_000, onStatus = () => {}, sleep } = {}) {
  if (!key) throw new FalError("FAL_KEY is not set. Add FAL_KEY=... to .env.");
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };

  const submitted = await readJson(
    await fetch(`${QUEUE}/${endpoint}`, { method: "POST", headers, body: JSON.stringify(input) }),
    `Submit to ${endpoint}`
  );
  // Use the URLs fal returns; they are right even for endpoints with subpaths.
  const statusUrl = submitted.status_url ?? `${QUEUE}/${endpoint}/requests/${submitted.request_id}/status`;
  const responseUrl = submitted.response_url ?? `${QUEUE}/${endpoint}/requests/${submitted.request_id}`;

  const started = Date.now();
  for (;;) {
    const status = await readJson(await fetchWithRetry(fetch, statusUrl, { headers }, { wait }), "Status check");
    onStatus(status.status, status);
    if (status.status === "COMPLETED") break;
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(status.status)) {
      throw new FalError(`Request ended with status ${status.status}`, status);
    }
    if (Date.now() - started > timeoutMs) throw new FalError(`Timed out after ${Math.round(timeoutMs / 1000)} s`, status);
    await wait(pollMs);
  }
  return readJson(await fetchWithRetry(fetch, responseUrl, { headers }, { wait }), "Result");
}

/** Downloads a result file (fal CDN URL or data: URI) to disk. */
export async function download(url, path, { fetch = globalThis.fetch, sleep } = {}) {
  if (url.startsWith("data:")) {
    await writeFile(path, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    return path;
  }
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const response = await fetchWithRetry(fetch, url, undefined, { wait });
  if (!response.ok) throw new FalError(`Download failed (${response.status}): ${url}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return path;
}
