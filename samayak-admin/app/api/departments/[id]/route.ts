import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      branches: true,
      _count: { select: { rooms: true, courses: true, faculty: true } },
    },
  });

  if (!department) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(department);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  try {
    const department = await prisma.department.update({
      where: { id },
      data: { name: body.name, code: body.code },
    });
    return NextResponse.json(department);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Department code already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update department" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check for dependent records
  const counts = await prisma.department.findUnique({
    where: { id },
    include: {
      _count: {
        select: { rooms: true, courses: true, faculty: true, branches: true },
      },
    },
  });

  if (!counts) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deps = counts._count;
  if (deps.rooms > 0 || deps.courses > 0 || deps.faculty > 0 || deps.branches > 0) {
    return NextResponse.json(
      {
        error: "Cannot delete department with dependent records",
        dependencies: {
          rooms: deps.rooms,
          courses: deps.courses,
          faculty: deps.faculty,
          branches: deps.branches,
        },
      },
      { status: 409 }
    );
  }

  await prisma.department.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
