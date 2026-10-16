export const SESSION_COOKIE = "sanca_session";
// Copia del rol legible desde el navegador, solo para decidir qué mostrar
// (menú, etc.). Lo que vale para los permisos es el rol firmado de SESSION_COOKIE.
export const ROL_COOKIE = "sanca_rol";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

// admin: todo el panel. produccion: solo el Recetario (usuario de la cuadra).
export type Rol = "admin" | "produccion";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Falta SESSION_SECRET en .env.local");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toHex(sig);
}

function mismoValor(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(rol: Rol = "admin"): Promise<string> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const sig = await hmac(`${rol}.${expires}`);
  return `${rol}.${expires}.${sig}`;
}

// Devuelve el rol de la sesión, o null si el token no es válido o venció.
// Los tokens viejos ("expires.sig", sin rol) siguen valiendo como admin.
export async function verifySessionToken(token: string | undefined | null): Promise<Rol | null> {
  if (!token) return null;
  const partes = token.split(".");
  let rol: Rol;
  let expiresStr: string;
  let firmado: string;
  let sig: string;
  if (partes.length === 2) {
    [expiresStr, sig] = partes;
    rol = "admin";
    firmado = expiresStr;
  } else if (partes.length === 3 && (partes[0] === "admin" || partes[0] === "produccion")) {
    rol = partes[0];
    [, expiresStr, sig] = partes;
    firmado = `${rol}.${expiresStr}`;
  } else {
    return null;
  }
  if (!expiresStr || !sig) return null;
  if (!mismoValor(sig, await hmac(firmado))) return null;
  return Number(expiresStr) > Date.now() ? rol : null;
}

export const SESSION_MAX_AGE_SECONDS = MAX_AGE_SECONDS;
