import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      department: true,
      branch: true,
      faculty: true,
      slots: { include: { room: true } },
    },
  });

  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(course);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  try {
    const course = await prisma.course.update({
      where: { id },
      data: {
        code: body.code,
        name: body.name,
        credits: body.credits !== undefined ? parseInt(body.credits) : undefined,
        type: body.type,
        departmentId: body.departmentId,
        branchId: body.branchId,
      },
    });
    return NextResponse.json(course);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Course code already exists in this branch" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to update course" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.timeSlot.deleteMany({ where: { courseId: id } });
  await prisma.course.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
