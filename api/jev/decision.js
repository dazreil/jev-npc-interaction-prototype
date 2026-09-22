import { parseJevBody, proxyJevDecision } from "../../lib/jev-proxy.mjs";

export async function POST(request) {
  let body;
  try {
    body = parseJevBody(await request.text());
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const result = await proxyJevDecision(body, process.env.TYPESAFE_API_KEY);
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
