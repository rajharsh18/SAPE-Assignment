import { NextResponse } from "next/server";
import { getAnalytics } from "@/lib/analytics";

export async function GET() {
  try {
    const data = await getAnalytics();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[analytics] Error:", error);
    return NextResponse.json(
      { error: "Failed to compute analytics" },
      { status: 500 }
    );
  }
}
