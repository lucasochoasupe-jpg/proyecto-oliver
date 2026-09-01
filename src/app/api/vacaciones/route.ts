import { NextResponse } from "next/server";
import { calcularSaldoVacaciones } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(calcularSaldoVacaciones());
}
