import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { listSucursales, updateSucursal, getConnectionState } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sucursales = listSucursales();
  const state = getConnectionState();
  const botPhone = state.phone ?? "";

  const result = await Promise.all(
    sucursales.map(async (s) => {
      const texto = `MARCAR ${s.nombre}`;
      const url = botPhone
        ? `https://wa.me/${botPhone}?text=${encodeURIComponent(texto)}`
        : texto;
      const qrPng = await QRCode.toDataURL(url, { width: 200, margin: 2 });
      return { ...s, qrPng, waUrl: url };
    })
  );

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id: number;
    lat?: number | null;
    lon?: number | null;
    radio_metros?: number;
  };
  if (!body.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  updateSucursal(body.id, {
    lat: body.lat,
    lon: body.lon,
    radio_metros: body.radio_metros,
  });
  return NextResponse.json({ ok: true });
}
