import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listEmpleados } from "@/lib/db";
import { hoyISO } from "@/lib/date-ar";
import { zebraFill, configurarColumnas, estilarHeader, aplicarGrilla, agregarBranding, ajustarAnchoContenido } from "@/lib/excel-style";

export const dynamic = "force-dynamic";

function formatFechaISO(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function calcularEdad(fechaNacimiento: string | null, hastaISO: string): number | "" {
  if (!fechaNacimiento) return "";
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00Z`);
  const hasta = new Date(`${hastaISO}T00:00:00Z`);
  let edad = hasta.getUTCFullYear() - nacimiento.getUTCFullYear();
  const cumplioAniversario =
    hasta.getUTCMonth() > nacimiento.getUTCMonth() ||
    (hasta.getUTCMonth() === nacimiento.getUTCMonth() && hasta.getUTCDate() >= nacimiento.getUTCDate());
  if (!cumplioAniversario) edad -= 1;
  return edad;
}

// Nómina general — datos personales/legales/contacto, sin los números de
// sueldo (blanco) ni nada de la parte informal (no está registrada).
export async function GET() {
  const empleados = listEmpleados();
  const hoy = hoyISO();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Nómina");

  const columnas = [
    { header: "Apellido y Nombre", key: "nombre", width: 28 },
    { header: "CUIL", key: "cuil", width: 16 },
    { header: "Legajo", key: "legajo", width: 12 },
    { header: "DNI", key: "dni", width: 14 },
    { header: "Fecha de nacimiento", key: "fecha_nacimiento", width: 18 },
    { header: "Edad", key: "edad", width: 8 },
    { header: "Estado civil", key: "estado_civil", width: 16 },
    { header: "Nacionalidad", key: "nacionalidad", width: 16 },
    { header: "Dirección", key: "direccion", width: 26 },
    { header: "Email", key: "email", width: 24 },
    { header: "Celular", key: "celular", width: 16 },
    { header: "Contacto de emergencia (nombre)", key: "contacto_emergencia_nombre", width: 26 },
    { header: "Contacto de emergencia (teléfono)", key: "contacto_emergencia_telefono", width: 24 },
    { header: "Fecha de ingreso", key: "fecha_ingreso", width: 16 },
    { header: "Categoría laboral", key: "categoria_laboral", width: 20 },
    { header: "Banco", key: "banco", width: 20 },
    { header: "Tipo de pago", key: "tipo_pago", width: 14 },
    { header: "WhatsApp", key: "whatsapp", width: 14 },
    { header: "Estado", key: "estado", width: 12 },
  ];
  configurarColumnas(ws, columnas, 2);
  agregarBranding(wb, ws, "Nómina de empleados", columnas.length);

  empleados.forEach((e, i) => {
    const row = ws.addRow({
      nombre: e.nombre,
      cuil: e.cuil ?? "",
      legajo: e.legajo ?? "",
      dni: e.dni ?? "",
      fecha_nacimiento: formatFechaISO(e.fecha_nacimiento),
      edad: calcularEdad(e.fecha_nacimiento, hoy),
      estado_civil: e.estado_civil ?? "",
      nacionalidad: e.nacionalidad ?? "",
      direccion: e.direccion ?? "",
      email: e.email ?? "",
      celular: e.celular ?? "",
      contacto_emergencia_nombre: e.contacto_emergencia_nombre ?? "",
      contacto_emergencia_telefono: e.contacto_emergencia_telefono ?? "",
      fecha_ingreso: formatFechaISO(e.fecha_ingreso),
      categoria_laboral: e.categoria_laboral ?? "",
      banco: e.banco ?? "",
      tipo_pago:
        e.tipo_pago === "mensual" ? "Mensual" : e.tipo_pago === "hora" ? "Por hora" : e.tipo_pago === "dia" ? "Por día" : "Sin definir",
      whatsapp: e.jid ? "Vinculado" : "Sin vincular",
      estado: e.activo ? "Activo" : "Inactivo",
    });
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = zebraFill(i);
    });
  });

  ajustarAnchoContenido(ws, { desdeFila: 2, max: 45 });
  estilarHeader(ws, 2);
  aplicarGrilla(ws, 2);

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nomina-empleados.xlsx"`,
    },
  });
}
