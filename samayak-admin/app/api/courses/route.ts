import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function formatBranchLabel(branch: {
  code: string;
  semester: number;
  section: string | null;
}) {
  return `${branch.code} Sem ${branch.semester}${branch.section ? ` ${branch.section}` : ""}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId") || "";
  const semester = searchParams.get("semester") || "";
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (branchId) where.branchId = branchId;
  if (semester) {
    where.branch = { semester: parseInt(semester) };
  }
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  const include = {
    department: { select: { name: true, code: true } },
    branch: { select: { name: true, code: true, semester: true, section: true } },
    _count: { select: { slots: true, faculty: true } },
  };

  if (branchId) {
    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include,
        orderBy: { code: "asc" },
        skip,
        take: limit,
      }),
      prisma.course.count({ where }),
    ]);

    return NextResponse.json({
      data: courses,
      grouped: false,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }

  const allCourses = await prisma.course.findMany({
    where,
    include,
    orderBy: [{ code: "asc" }, { branch: { semester: "asc" } }],
  });

  const groupMap = new Map<
    string,
    {
      code: string;
      name: string;
      credits: number;
      type: string;
      department: { name: string; code: string };
      branches: Array<{
        id: string;
        code: string;
        semester: number;
        section: string | null;
      }>;
      ids: string[];
      totalSlots: number;
    }
  >();

  for (const course of allCourses) {
    const key = `${course.code}::${course.departmentId}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        code: course.code,
        name: course.name,
        credits: course.credits,
        type: course.type,
        department: course.department,
        branches: [],
        ids: [],
        totalSlots: 0,
      });
    }
    const group = groupMap.get(key)!;
    group.branches.push({
      id: course.id,
      code: course.branch.code,
      semester: course.branch.semester,
      section: course.branch.section,
    });
    group.ids.push(course.id);
    group.totalSlots += course._count.slots;
  }

  const grouped = Array.from(groupMap.values())
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((g) => ({
      ...g,
      branchLabel: g.branches.map((b) => formatBranchLabel(b)).join(", "),
      grouped: true as const,
    }));

  const total = grouped.length;
  const data = grouped.slice(skip, skip + limit);

  return NextResponse.json({
    data,
    grouped: true,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name, credits, type, departmentId, branchId } = body;

    if (!code || !name || credits === undefined || !departmentId || !branchId) {
      return NextResponse.json(
        { error: "code, name, credits, departmentId, and branchId are required" },
        { status: 400 }
      );
    }

    const course = await prisma.course.create({
      data: {
        code,
        name,
        credits: parseInt(credits),
        type: type || "LECTURE",
        departmentId,
        branchId,
      },
    });

    return NextResponse.json(course, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Course code already exists in this branch" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
