import { NextRequest, NextResponse } from "next/server";
import { updateConvenio, type Convenio } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as Partial<Omit<Convenio, "id" | "codigo">>;
  updateConvenio(Number(id), body);
  return NextResponse.json({ ok: true });
}
