export const SESSION_COOKIE = "sanca_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

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

export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const sig = await hmac(String(expires));
  return `${expires}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expiresStr, sig] = token.split(".");
  if (!expiresStr || !sig) return false;

  const expected = await hmac(expiresStr);
  if (sig.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return false;

  return Number(expiresStr) > Date.now();
}

export const SESSION_MAX_AGE_SECONDS = MAX_AGE_SECONDS;
