import { NextRequest, NextResponse } from "next/server";
import { calcularAguinaldo, rangoSemestre, semestreActual, type Semestre } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseSemestre(req: NextRequest): Semestre {
  const { searchParams } = new URL(req.url);
  const anio = Number(searchParams.get("anio"));
  const numero = Number(searchParams.get("numero"));
  if (Number.isInteger(anio) && (numero === 1 || numero === 2)) return { anio, numero };
  return semestreActual();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;
  const semestre = parseSemestre(req);
  const rango = rangoSemestre(semestre);

  const filas = calcularAguinaldo(semestre, nombres);

  return NextResponse.json({ anio: semestre.anio, numero: semestre.numero, desde: rango.desde, hasta: rango.hasta, filas });
}
