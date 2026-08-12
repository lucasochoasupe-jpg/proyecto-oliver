import { NextRequest, NextResponse } from "next/server";
import {
  getConversationById,
  getMessages,
  insertMessage,
  enqueueOutbox,
} from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const messages = getMessages(id, 50);
  return NextResponse.json({ conversation: conv, messages });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = (await req.json()) as { content?: string };
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });
  }

  insertMessage(id, "human", content);
  enqueueOutbox(id, conv.phone, content);

  return NextResponse.json({ ok: true });
}
