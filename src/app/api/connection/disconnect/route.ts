import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import path from "node:path";
import fs from "node:fs";
import { setConnectionState } from "@/lib/db";

export async function POST() {
  setConnectionState({ status: "disconnected", qr_string: null, phone: null });

  const authDir = path.resolve(process.cwd(), "auth");
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch {}

  const restartFlag = path.resolve(process.cwd(), "data", ".restart");
  fs.writeFileSync(restartFlag, "");

  return NextResponse.json({ ok: true });
}
