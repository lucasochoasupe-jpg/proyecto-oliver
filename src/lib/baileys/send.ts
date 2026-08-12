import type makeWASocket from "@whiskeysockets/baileys";

type Sock = ReturnType<typeof makeWASocket>;

// Envuelve sock.sendMessage con logging explícito de éxito/error del lado del
// cliente. sendMessage puede resolver "bien" (Baileys aceptó y mandó el paquete)
// aunque WhatsApp después nunca confirme la entrega — esto solo nos dice si la
// llamada en sí falló localmente, no si el mensaje llegó (para eso están los
// logs [entrega] de messages.update).
export async function sendSafe(
  sock: Sock,
  jid: string,
  content: Parameters<Sock["sendMessage"]>[1]
): Promise<void> {
  try {
    const result = await sock.sendMessage(jid, content);
    console.log(`[bot] [envio] OK jid=${jid} id=${result?.key?.id ?? "(sin id)"}`);
  } catch (err) {
    console.error(`[bot] [envio] ERROR jid=${jid}:`, err);
  }
}
