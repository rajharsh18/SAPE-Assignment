import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const role = searchParams.get("role") || "";
  const departmentId = searchParams.get("departmentId") || "";
  const showDeleted = searchParams.get("showDeleted") === "true";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (!showDeleted) {
    where.deletedAt = null;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;
  if (departmentId) where.departmentId = departmentId;

  const [faculty, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        department: { select: { name: true, code: true } },
        _count: { select: { courses: true } },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    data: faculty,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, role, departmentId } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: role || "PROFESSOR",
        departmentId: departmentId || null,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create faculty" }, { status: 500 });
  }
}
