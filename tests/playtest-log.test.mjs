import assert from "node:assert/strict";
import test from "node:test";

import { MAX_LOG_BYTES, parsePlaytestLog } from "../lib/playtest-log.mjs";

const SESSION_ID = "2026-09-23T10-15-00Z-0a1b2c3d";

test("a valid log is stored under its date and session id", () => {
  const log = parsePlaytestLog(JSON.stringify({ sessionId: SESSION_ID, entries: [{ turn: 1 }] }));

  assert.equal(log.pathname, `logs/2026-09-23/${SESSION_ID}.json`);
  const stored = JSON.parse(log.body);
  assert.deepEqual(stored.entries, [{ turn: 1 }]);
  assert.match(stored.savedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("a session id cannot steer the storage path", () => {
  for (const sessionId of ["../../secrets", "2026-09-23T10-15-00Z-../x", "", 42]) {
    assert.throws(() => parsePlaytestLog(JSON.stringify({ sessionId, entries: [] })), /session id/);
  }
});

test("malformed, entry-less and oversized logs are refused", () => {
  assert.throws(() => parsePlaytestLog("{not json"), /valid JSON/);
  assert.throws(() => parsePlaytestLog(JSON.stringify({ sessionId: SESSION_ID })), /entries/);
  const padding = "x".repeat(MAX_LOG_BYTES);
  assert.throws(
    () => parsePlaytestLog(JSON.stringify({ sessionId: SESSION_ID, entries: [], padding })),
    /too large/
  );
});
