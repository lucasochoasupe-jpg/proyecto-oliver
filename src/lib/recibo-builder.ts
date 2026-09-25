import type { AguinaldoEmpleado, ConfiguracionLiquidacion, Empleado, LiquidacionEmpleado, Semestre } from "./db";
import type {
  ComprobanteAguinaldoInformalData,
  ComprobanteInformalData,
  ReciboAguinaldoData,
  ReciboData,
} from "./recibo-pdf";

export function formatFechaISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Antigüedad en "X años y Y meses" al final del período, como en el recibo real.
export function antiguedadTexto(fechaIngreso: string | null, hastaISO: string): string {
  if (!fechaIngreso) return "—";
  const ingreso = new Date(`${fechaIngreso}T00:00:00Z`);
  const hasta = new Date(`${hastaISO}T00:00:00Z`);
  let meses = (hasta.getUTCFullYear() - ingreso.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - ingreso.getUTCMonth());
  if (hasta.getUTCDate() < ingreso.getUTCDate()) meses -= 1;
  if (meses < 0) meses = 0;
  const anios = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  return `${anios} año${anios === 1 ? "" : "s"} y ${mesesRestantes} mes${mesesRestantes === 1 ? "" : "es"}`;
}

// Arma los datos del recibo (parte blanca) a partir de una fila de
// calcularLiquidacion — null si el empleado no tiene tipo de pago/aportes
// configurados (no hay recibo posible para esa parte).
export function construirReciboBlanco(
  fila: LiquidacionEmpleado,
  empleado: Empleado,
  config: ConfiguracionLiquidacion,
  desdeISO: string,
  hastaISO: string
): ReciboData | null {
  if (fila.tipo_pago === null || !fila.legal) return null;

  const sueldoONormal =
    fila.tipo_pago === "mensual" ? fila.sueldo_mensual ?? 0 : fila.tipo_pago === "hora" ? fila.valor_hora ?? 0 : fila.valor_dia ?? 0;

  return {
    empresa: {
      razon_social: config.empresa_razon_social,
      domicilio: config.empresa_domicilio,
      cuit: config.empresa_cuit,
      obra_social_codigo: config.obra_social_codigo,
      obra_social_nombre: config.obra_social_nombre,
    },
    empleado: {
      nombre: empleado.nombre,
      legajo: empleado.legajo,
      cuil: empleado.cuil,
      categoria_laboral: empleado.categoria_laboral,
      banco: empleado.banco ?? config.banco_default,
      fecha_ingreso: empleado.fecha_ingreso,
      antiguedad: antiguedadTexto(empleado.fecha_ingreso, hastaISO),
    },
    desde: formatFechaISO(desdeISO),
    hasta: formatFechaISO(hastaISO),
    tipo_pago: fila.tipo_pago,
    sueldo_o_jornal: sueldoONormal,
    legal: fila.legal,
    adelantos: fila.adelantos_blanco,
    total_a_depositar: fila.total_blanco,
  };
}

// Arma los datos del comprobante interno de la parte informal — null si el
// empleado no tiene parte informal configurada.
export function construirComprobanteInformal(
  fila: LiquidacionEmpleado,
  empleado: Empleado,
  config: ConfiguracionLiquidacion,
  desdeISO: string,
  hastaISO: string
): ComprobanteInformalData | null {
  if (!fila.informal) return null;
  const p = fila.informal;

  const sueldoONormal = p.tipo_pago === "mensual" ? p.sueldo_mensual ?? 0 : p.tipo_pago === "hora" ? p.valor_hora ?? 0 : p.valor_dia ?? 0;
  const horasExtraMonto = p.horas_extra && p.valor_hora ? p.horas_extra * p.valor_hora : 0;

  return {
    empresa: { razon_social: config.empresa_razon_social },
    empleado: { nombre: empleado.nombre },
    desde: formatFechaISO(desdeISO),
    hasta: formatFechaISO(hastaISO),
    tipo_pago: p.tipo_pago!,
    sueldo_o_jornal: sueldoONormal,
    descuento_tardanza: p.descuento_tardanza,
    descuento_ausencia: p.descuento_ausencia,
    descuento_sin_goce: p.descuento_sin_goce,
    monto_ausencia_justificada: p.monto_ausencia_justificada,
    horas_extra_monto: horasExtraMonto,
    adelantos: fila.adelantos_informal,
    total: p.total,
  };
}

export function semestreLabel(semestre: Semestre, rangoISO: { desde: string; hasta: string }): string {
  return `${semestre.numero}° Semestre ${semestre.anio} (${formatFechaISO(rangoISO.desde)} al ${formatFechaISO(rangoISO.hasta)})`;
}

function mesAnioLabel(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  return `${m}/${y}`;
}

// Arma los datos del recibo de aguinaldo (parte blanca) — null si el
// empleado no tuvo sueldo bruto (blanco) ningún mes del semestre.
export function construirReciboAguinaldo(
  fila: AguinaldoEmpleado,
  empleado: Empleado,
  config: ConfiguracionLiquidacion,
  semestre: Semestre,
  rangoISO: { desde: string; hasta: string }
): ReciboAguinaldoData | null {
  if (!fila.blanco || !fila.legal) return null;

  return {
    empresa: {
      razon_social: config.empresa_razon_social,
      domicilio: config.empresa_domicilio,
      cuit: config.empresa_cuit,
      obra_social_codigo: config.obra_social_codigo,
      obra_social_nombre: config.obra_social_nombre,
    },
    empleado: {
      nombre: empleado.nombre,
      legajo: empleado.legajo,
      cuil: empleado.cuil,
      categoria_laboral: empleado.categoria_laboral,
      banco: empleado.banco ?? config.banco_default,
      fecha_ingreso: empleado.fecha_ingreso,
      antiguedad: antiguedadTexto(empleado.fecha_ingreso, rangoISO.hasta),
    },
    semestre_label: semestreLabel(semestre, rangoISO),
    mejor_remuneracion: fila.blanco.mejor_remuneracion,
    mes_mejor_remuneracion: mesAnioLabel(fila.blanco.mes_mejor_remuneracion),
    meses_computados: fila.blanco.meses_computados,
    aguinaldo_bruto: fila.aguinaldo_blanco,
    legal: fila.legal,
    neto: fila.neto_blanco,
  };
}

// Arma los datos del comprobante interno del aguinaldo informal — null si el
// empleado no tiene parte informal configurada.
export function construirComprobanteAguinaldoInformal(
  fila: AguinaldoEmpleado,
  empleado: Empleado,
  config: ConfiguracionLiquidacion,
  semestre: Semestre,
  rangoISO: { desde: string; hasta: string }
): ComprobanteAguinaldoInformalData | null {
  if (!fila.informal) return null;

  return {
    empresa: { razon_social: config.empresa_razon_social },
    empleado: { nombre: empleado.nombre },
    semestre_label: semestreLabel(semestre, rangoISO),
    mejor_remuneracion: fila.informal.mejor_remuneracion,
    meses_computados: fila.informal.meses_computados,
    aguinaldo: fila.aguinaldo_informal,
  };
}
