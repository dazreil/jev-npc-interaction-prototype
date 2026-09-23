// Shared by the local Node server and the Vercel function, so both hosts accept
// exactly the same playtest logs. Each session overwrites one file per turn, so
// the stored copy is always the whole conversation so far.

export const MAX_LOG_BYTES = 512 * 1024;
const SESSION_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-[0-9a-f]{8}$/;

export function isPlaytestSessionId(value) {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

/** Returns `{ sessionId, pathname, body }` or throws a message safe to show. */
export function parsePlaytestLog(text) {
  if (Buffer.byteLength(text, "utf8") > MAX_LOG_BYTES) {
    throw new Error("Log is too large.");
  }

  let log;
  try {
    log = JSON.parse(text);
  } catch {
    throw new Error("Log must be valid JSON.");
  }

  if (!log || typeof log !== "object" || Array.isArray(log)) throw new Error("Log must be an object.");
  if (!isPlaytestSessionId(log.sessionId)) throw new Error("Log has an invalid session id.");
  if (!Array.isArray(log.entries)) throw new Error("Log is missing its entries.");

  const sessionId = log.sessionId;
  return {
    sessionId,
    pathname: `logs/${sessionId.slice(0, 10)}/${sessionId}.json`,
    body: `${JSON.stringify({ ...log, savedAt: new Date().toISOString() }, null, 2)}\n`
  };
}
