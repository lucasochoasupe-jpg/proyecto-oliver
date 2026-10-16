import { NextRequest, NextResponse } from "next/server";
import { calcularReceta } from "@/lib/recetario";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const producto = p.get("producto") ?? "";
  const cantidad = Number(String(p.get("cantidad") ?? "").replace(",", "."));
  const unidad = p.get("unidad") === "unidad" ? "unidad" : "kg";
  try {
    return NextResponse.json(calcularReceta(producto, cantidad, unidad));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo calcular" }, { status: 400 });
  }
}
