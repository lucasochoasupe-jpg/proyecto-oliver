// Mapa de LID → número de teléfono real.
// Se aprende de `contacts.upsert` o de `senderPn` en un mensaje entrante.
// Cache en memoria para no pegarle a SQLite en cada mensaje, respaldado por la
// tabla `lid_phone` para que sobreviva a un reinicio del bot (ver db.ts).
import { getLidPhone, upsertLidPhone } from "../db";

const lidToPhone = new Map<string, string>();

export function setLidPhone(lid: string, phone: string): void {
  const key = lid.replace("@lid", "");
  lidToPhone.set(key, phone);
  upsertLidPhone(key, phone);
}

export function resolvePhone(jid: string): string {
  if (jid.endsWith("@s.whatsapp.net")) {
    return jid.replace("@s.whatsapp.net", "");
  }
  if (jid.endsWith("@lid")) {
    const lid = jid.replace("@lid", "");
    const cached = lidToPhone.get(lid);
    if (cached) return cached;
    const persisted = getLidPhone(lid);
    if (persisted) {
      lidToPhone.set(lid, persisted);
      return persisted;
    }
    return lid;
  }
  return jid;
}
