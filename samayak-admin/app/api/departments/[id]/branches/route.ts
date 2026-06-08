import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const department = await prisma.department.findUnique({ where: { id } });
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  try {
    const branch = await prisma.branch.create({
      data: {
        name: body.name,
        code: body.code,
        departmentId: id,
        semester: Number(body.semester),
        section: body.section || null,
      },
    });
    return NextResponse.json(branch, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Branch with this code, semester, and section already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create branch" }, { status: 500 });
  }
}
