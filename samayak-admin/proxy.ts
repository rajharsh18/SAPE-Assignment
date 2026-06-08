import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { v4 as uuidv4 } from "uuid";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ["*"],
  HOD: ["/api/courses", "/api/faculty", "/api/departments"],
  DEAN: ["/api/analytics", "/api/departments"],
  COORDINATOR: ["/api/rooms", "/api/courses"],
  PROFESSOR: [],
};

export async function proxy(req: NextRequest) {
  const correlationId = uuidv4();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-correlation-id", correlationId);

  const { pathname } = req.nextUrl;

  if (
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/favicon")
  ) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (
    pathname.startsWith("/api") &&
    !pathname.startsWith("/api/health") &&
    !pathname.startsWith("/api/auth")
  ) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized", correlationId },
        { status: 401 }
      );
    }

    const role = token.role as string;
    const allowed = ROLE_PERMISSIONS[role];
    if (
      allowed &&
      !allowed.includes("*") &&
      !allowed.some((p) => pathname.startsWith(p))
    ) {
      return NextResponse.json(
        { error: "Forbidden", correlationId },
        { status: 403 }
      );
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
