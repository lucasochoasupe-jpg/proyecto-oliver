import { NextRequest, NextResponse } from "next/server";
import { getCajaSheetUrl, setCajaSheetUrl } from "@/lib/db";
import { sheetUrlToCsvUrl } from "@/lib/caja-import";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sheetUrl: getCajaSheetUrl() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url = typeof body?.sheetUrl === "string" ? body.sheetUrl.trim() : "";
  if (!url) {
    setCajaSheetUrl(null);
    return NextResponse.json({ sheetUrl: null });
  }
  if (!sheetUrlToCsvUrl(url)) {
    return NextResponse.json({ error: "No pude reconocer el link de Google Sheets" }, { status: 400 });
  }
  setCajaSheetUrl(url);
  return NextResponse.json({ sheetUrl: url });
}
