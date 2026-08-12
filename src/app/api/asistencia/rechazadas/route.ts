import { NextResponse } from "next/server";
import { listAsistenciaRechazada } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const records = listAsistenciaRechazada(true);
  return NextResponse.json({ records });
}
