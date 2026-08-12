import { NextRequest, NextResponse } from "next/server";
import { listAttendancePendientes, deleteFlowState } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const records = listAttendancePendientes();
  return NextResponse.json({ records });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { phone?: string } | null;
  if (!body?.phone) {
    return NextResponse.json({ error: "phone es requerido" }, { status: 400 });
  }
  deleteFlowState(body.phone, "attendance");
  return NextResponse.json({ ok: true });
}
