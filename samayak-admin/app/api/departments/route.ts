import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { code: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [departments, total] = await Promise.all([
    prisma.department.findMany({
      where,
      include: {
        _count: {
          select: { branches: true, rooms: true, courses: true, faculty: true },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.department.count({ where }),
  ]);

  return NextResponse.json({
    data: departments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, code } = body;

    if (!name || !code) {
      return NextResponse.json(
        { error: "Name and code are required" },
        { status: 400 }
      );
    }

    const department = await prisma.department.create({
      data: { name, code },
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Department code already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create department" },
      { status: 500 }
    );
  }
}
