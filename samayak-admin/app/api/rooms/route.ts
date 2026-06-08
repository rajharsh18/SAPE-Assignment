import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { invalidateAnalyticsCache } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const departmentId = searchParams.get("departmentId") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (search) {
    where.roomNumber = { contains: search, mode: "insensitive" };
  }
  if (departmentId) {
    where.departmentId = departmentId;
  }

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where,
      include: {
        department: { select: { name: true, code: true } },
        _count: { select: { slots: true } },
      },
      orderBy: { roomNumber: "asc" },
      skip,
      take: limit,
    }),
    prisma.room.count({ where }),
  ]);

  return NextResponse.json({
    data: rooms,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomNumber, departmentId, capacity, type } = body;

    if (!roomNumber || !departmentId || capacity === undefined) {
      return NextResponse.json(
        { error: "roomNumber, departmentId, and capacity are required" },
        { status: 400 }
      );
    }

    const room = await prisma.room.create({
      data: { roomNumber, departmentId, capacity: parseInt(capacity), type: type || "CLASSROOM" },
    });

    await invalidateAnalyticsCache();
    return NextResponse.json(room, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Room already exists in this department" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
