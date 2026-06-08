import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface ImportRow {
  name: string;
  email: string;
  role: string;
  departmentCode: string;
  action: "skip" | "update" | "create";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows } = body as { rows: ImportRow[] };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (row.action === "skip") {
          skipped++;
          continue;
        }

        let departmentId: string | null = null;
        if (row.departmentCode) {
          const dept = await prisma.department.findUnique({
            where: { code: row.departmentCode },
          });
          if (dept) departmentId = dept.id;
        }

        if (row.action === "update") {
          await prisma.user.update({
            where: { email: row.email },
            data: {
              name: row.name,
              role: row.role as "ADMIN" | "COORDINATOR" | "PROFESSOR" | "HOD" | "DEAN",
              departmentId,
            },
          });
          updated++;
        } else {
          await prisma.user.create({
            data: {
              name: row.name,
              email: row.email,
              role: row.role as "ADMIN" | "COORDINATOR" | "PROFESSOR" | "HOD" | "DEAN",
              departmentId,
            },
          });
          created++;
        }
      } catch (e) {
        errors.push({ row: i + 1, reason: (e as Error).message });
      }
    }

    return NextResponse.json({ created, updated, skipped, errors });
  } catch (error) {
    console.error("[faculty/import/commit] Error:", error);
    return NextResponse.json({ error: "Failed to commit import" }, { status: 500 });
  }
}
