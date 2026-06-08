import type { NextRequest } from "next/server";

/**
 * Resolve the public app URL from the incoming request so auth and redirects
 * work when the app is opened via a LAN IP or hostname (not only localhost).
 */
export function resolveAppUrl(req: NextRequest | Request): string {
  const headers = req.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${proto}://${host}`;
  }

  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function applyDynamicAuthUrl(req: NextRequest | Request): void {
  process.env.NEXTAUTH_URL = resolveAppUrl(req);
}
