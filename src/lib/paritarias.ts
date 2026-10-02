// Aviso de paritarias: revisa las páginas de escalas de AIPAR (Asociación
// Industriales Panaderos de Rosario), que publica ahí los PDF de cada acuerdo
// salarial del CCT 615/10 (panaderos) y del CCT 145/90 (confiteros). Un PDF que
// no se conocía queda 'pendiente' y se le avisa a Administración (ADMIN_PHONE)
// por WhatsApp; mientras siga pendiente se le recuerda cada pocos días, hasta
// que alguien carga la escala nueva en el panel (Finanzas → Escalas) o la
// descarta. Lo corre el proceso del bot (scripts/start-bot.ts).
import {
  contarParitariasConocidas,
  enqueueOutbox,
  getOrCreateConversation,
  insertMessage,
  listConvenios,
  listParitariasPendientes,
  marcarParitariaAvisada,
  registrarParitaria,
} from "./db";

const PAGINAS: { codigo: string; url: string }[] = [
  { codigo: "615/10", url: "https://www.panaderosderosario.org.ar/sitio/escala-panaderos/" },
  { codigo: "145/90", url: "https://www.panaderosderosario.org.ar/sitio/escala-confiteros/" },
];

const RECORDAR_CADA_SEG = 3 * 24 * 3600;

function avisarAdministracion(texto: string): void {
  const adminPhone = process.env.ADMIN_PHONE;
  if (!adminPhone) {
    console.warn("[paritarias] ADMIN_PHONE no configurado — no se puede avisar:", texto);
    return;
  }
  const convo = getOrCreateConversation(adminPhone);
  insertMessage(convo.id, "assistant", texto);
  enqueueOutbox(convo.id, adminPhone, texto);
}

async function pdfsPublicados(url: string): Promise<string[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  const html = await res.text();
  const links = [...html.matchAll(/href="(https?:\/\/[^"]+\.pdf)"/gi)].map((m) => m[1]);
  return [...new Set(links)];
}

export async function revisarParitarias(): Promise<void> {
  const convenios = new Map(listConvenios().map((c) => [c.codigo, c]));
  for (const pagina of PAGINAS) {
    const convenio = convenios.get(pagina.codigo);
    if (!convenio) continue;
    let links: string[];
    try {
      links = await pdfsPublicados(pagina.url);
    } catch (err) {
      console.error(`[paritarias] No se pudo revisar ${pagina.url}:`, err);
      continue;
    }
    // Primera pasada: todo lo que ya estaba publicado se toma como conocido
    // (las escalas vigentes ya están cargadas), sin avisar.
    const primeraVez = contarParitariasConocidas(convenio.id) === 0;
    for (const link of links) {
      const nueva = registrarParitaria(link, convenio.id, primeraVez ? "cargada" : "pendiente");
      if (nueva && !primeraVez) {
        console.log(`[paritarias] Nueva paritaria ${convenio.codigo}: ${link}`);
        avisarAdministracion(
          `📢 *Paritaria nueva publicada* — ${convenio.nombre}\n${link}\n\n` +
            "Hay que cargar la escala nueva en el panel: Finanzas → Escalas salariales → «Cargar escala nueva». " +
            "Hasta que se cargue, los sueldos se siguen calculando con la escala anterior."
        );
        marcarParitariaAvisada(link);
      }
    }
  }

  // Recordatorio de las que siguen pendientes.
  const ahora = Math.floor(Date.now() / 1000);
  for (const p of listParitariasPendientes()) {
    if (p.ultimo_aviso_at !== null && ahora - p.ultimo_aviso_at < RECORDAR_CADA_SEG) continue;
    const dias = Math.floor((ahora - p.detectada_at) / 86400);
    avisarAdministracion(
      `⏰ *Recordatorio:* falta cargar la paritaria de ${p.convenio_nombre} publicada hace ${dias} día${dias === 1 ? "" : "s"}:\n${p.url}\n\n` +
        "Panel: Finanzas → Escalas salariales → «Cargar escala nueva»."
    );
    marcarParitariaAvisada(p.url);
  }
}
