import { jevStatus } from "../../lib/jev-proxy.mjs";

export function GET() {
  return Response.json(jevStatus(process.env.TYPESAFE_API_KEY), {
    headers: { "Cache-Control": "no-store" }
  });
}
