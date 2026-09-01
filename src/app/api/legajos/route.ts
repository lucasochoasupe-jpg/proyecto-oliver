import { NextResponse } from "next/server";
import { listLegajosResumen } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listLegajosResumen());
}
