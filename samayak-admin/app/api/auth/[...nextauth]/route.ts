import { authOptions } from "@/lib/auth";
import { applyDynamicAuthUrl } from "@/lib/app-url";
import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

const handler = NextAuth(authOptions);

type RouteContext = { params: Promise<{ nextauth: string[] }> };

async function authHandler(req: NextRequest, context: RouteContext) {
  applyDynamicAuthUrl(req);
  return handler(req, context);
}

export { authHandler as GET, authHandler as POST };
