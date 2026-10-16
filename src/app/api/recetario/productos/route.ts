import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { DESCARGA_CSV_URL, listarProductos, PLANILLA_URL, ultimaSincronizacion } from "@/lib/recetario";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const esAdmin = (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) === "admin";
  const todos = esAdmin && req.nextUrl.searchParams.get("todos") === "1";
  return NextResponse.json({
    productos: listarProductos(todos),
    sincronizado_at: ultimaSincronizacion(),
    ...(esAdmin && { planilla_url: PLANILLA_URL, descarga_url: DESCARGA_CSV_URL }),
  });
}
