import { put } from "@vercel/blob";

import { parsePlaytestLog } from "../lib/playtest-log.mjs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return Response.json({ error: "Log storage is not configured." }, { status: 503, headers: NO_STORE });
  }

  let log;
  try {
    log = parsePlaytestLog(await request.text());
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers: NO_STORE });
  }

  try {
    await put(log.pathname, log.body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
  } catch {
    return Response.json({ error: "The log could not be stored." }, { status: 502, headers: NO_STORE });
  }

  return new Response(null, { status: 204, headers: NO_STORE });
}
