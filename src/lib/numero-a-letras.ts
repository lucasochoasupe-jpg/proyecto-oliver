// Convierte un monto en pesos a texto, como en un recibo de sueldo real
// ("UN MILLÓN DOSCIENTOS DIECIOCHO MIL QUINIENTOS CINCUENTA Y SIETE CON 00/100").
// Soporta hasta miles de millones — de sobra para un sueldo.

const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DIEZ_A_DIECINUEVE = [
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE",
  "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
];
const VEINTES = [
  "VEINTE", "VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO",
  "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS",
  "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

function convertirDecenas(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DIEZ_A_DIECINUEVE[n - 10];
  if (n < 30) return VEINTES[n - 20];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

function convertirGrupo(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) partes.push(convertirDecenas(resto));
  return partes.join(" ");
}

function convertirEntero(n: number): string {
  if (n === 0) return "CERO";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLON" : `${convertirEntero(millones)} MILLONES`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${convertirGrupo(miles)} MIL`);
  }
  if (resto > 0) {
    partes.push(convertirGrupo(resto));
  }
  return partes.join(" ");
}

export function montoALetras(monto: number): string {
  const entero = Math.floor(Math.abs(monto));
  const centavos = Math.round((Math.abs(monto) - entero) * 100);
  const texto = convertirEntero(entero);
  return `${monto < 0 ? "MENOS " : ""}${texto} PESOS CON ${String(centavos).padStart(2, "0")}/100`;
}
