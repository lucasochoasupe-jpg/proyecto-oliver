export const AR_TZ = "America/Argentina/Buenos_Aires";

export function hoyISO(): string {
  return new Date().toLocaleDateString("sv", { timeZone: AR_TZ });
}

export function inicioDeMesISO(): string {
  const hoy = hoyISO();
  return `${hoy.slice(0, 7)}-01`;
}
