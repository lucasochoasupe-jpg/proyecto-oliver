// Números de Administración que reciben los avisos del bot. ADMIN_PHONE puede
// tener uno o varios, separados por coma (ej. "5493416869217,5493415725884").
import { enqueueOutbox, getOrCreateConversation, insertMessageReturningId } from "./db";

export function getAdminPhones(): string[] {
  return (process.env.ADMIN_PHONE ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

// Los números que reciben copia (todos menos el primero). El panel de RRHH
// arma sus registros leyendo los avisos guardados en los chats, así que ignora
// los de estos chats para no mostrar cada aviso repetido.
export function getAdminPhonesCopia(): string[] {
  return getAdminPhones().slice(1);
}

// Guarda el aviso en el chat de cada número y lo encola para mandarlo.
// Devuelve el id del mensaje en el chat del primer número (null si no hay
// ninguno configurado), que es el que queda vinculado a certificados/ausencias.
export function avisarAdmins(texto: string): number | null {
  let primerId: number | null = null;
  for (const phone of getAdminPhones()) {
    const convo = getOrCreateConversation(phone);
    const id = insertMessageReturningId(convo.id, "assistant", texto);
    enqueueOutbox(convo.id, phone, texto);
    if (primerId === null) primerId = id;
  }
  return primerId;
}
