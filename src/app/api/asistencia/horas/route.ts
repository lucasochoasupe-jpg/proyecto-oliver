import { NextRequest, NextResponse } from "next/server";
import { calcularHorasTrabajadas } from "@/lib/db";
import { hoyISO, inicioDeMesISO } from "@/lib/date-ar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? inicioDeMesISO();
  const hasta = searchParams.get("hasta") ?? hoyISO();
  const sucursal = searchParams.get("sucursal") ?? undefined;
  const nombres = searchParams.get("nombres")?.split(",").filter(Boolean) ?? undefined;
  const estado = searchParams.get("estado") ?? "todos"; // todos | terminados | encurso

  const todosLosTurnos = calcularHorasTrabajadas({ desde, hasta, sucursal, nombres });
  const turnos =
    estado === "terminados" ? todosLosTurnos.filter((t) => t.horas !== null)
    : estado === "encurso" ? todosLosTurnos.filter((t) => t.horas === null)
    : todosLosTurnos;

  interface ResumenEmpleado {
    nombre: string;
    totalHoras: number;
    enCurso: boolean;
  }

  const porEmpleado = new Map<string, ResumenEmpleado>();
  for (const t of turnos) {
    let e = porEmpleado.get(t.nombre);
    if (!e) {
      e = { nombre: t.nombre, totalHoras: 0, enCurso: false };
      porEmpleado.set(t.nombre, e);
    }
    if (t.horas !== null) {
      e.totalHoras += t.horas;
    } else {
      e.enCurso = true;
    }
  }

  const resumen = Array.from(porEmpleado.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre)
  );

  return NextResponse.json({ desde, hasta, turnos, resumen });
}
