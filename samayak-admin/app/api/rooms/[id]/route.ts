import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { invalidateAnalyticsCache } from "@/lib/analytics";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      department: true,
      slots: { include: { course: true } },
    },
  });

  if (!room) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(room);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  try {
    const room = await prisma.room.update({
      where: { id },
      data: {
        roomNumber: body.roomNumber,
        capacity: body.capacity ? parseInt(body.capacity) : undefined,
        type: body.type,
        departmentId: body.departmentId,
      },
    });
    await invalidateAnalyticsCache();
    return NextResponse.json(room);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Room already exists in this department" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Delete associated time slots first
  await prisma.timeSlot.deleteMany({ where: { roomId: id } });
  await prisma.room.delete({ where: { id } });
  await invalidateAnalyticsCache();

  return NextResponse.json({ success: true });
}
