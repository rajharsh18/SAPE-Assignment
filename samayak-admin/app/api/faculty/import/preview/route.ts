import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let rows: Record<string, string>[];

    if (ext === "csv") {
      const text = buffer.toString("utf-8");
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim().toLowerCase(),
      });
      rows = result.data as Record<string, string>[];
    } else {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet) as Record<string, string>[];
      rows = rawData.map((row) => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          normalized[key.trim().toLowerCase()] = String(value).trim();
        }
        return normalized;
      });
    }

    // Check for duplicates
    const preview = await Promise.all(
      rows.map(async (row, index) => {
        const email = row.email || "";
        const existing = await prisma.user.findUnique({ where: { email } });
        return {
          row: index + 1,
          name: row.name || "",
          email,
          role: (row.role || "PROFESSOR").toUpperCase(),
          departmentCode: row.departmentcode || row.department_code || "",
          isDuplicate: !!existing,
          existingId: existing?.id || null,
          existingName: existing?.name || null,
        };
      })
    );

    return NextResponse.json({
      totalRows: preview.length,
      duplicates: preview.filter((r) => r.isDuplicate).length,
      newRecords: preview.filter((r) => !r.isDuplicate).length,
      rows: preview,
    });
  } catch (error) {
    console.error("[faculty/import/preview] Error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
