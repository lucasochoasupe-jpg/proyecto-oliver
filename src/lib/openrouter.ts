import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./system-prompt";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function generateReply(history: ChatMessage[]): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
    max_tokens: 600,
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

// ── Resumen de texto libre para avisos de RRHH (uso híbrido) ──────────────────
// Toma lo que escribió el empleado (duración, fechas, motivo) y lo resume en una
// sola línea para el bloque de Administración. Si el LLM falla (429/402/timeout),
// devuelve el texto crudo normalizado: el aviso NUNCA se pierde por esto.
const PARSE_DETALLE_SYSTEM = `Sos un asistente que resume, para un aviso interno de RRHH, el texto libre que un empleado escribió sobre su ausencia, licencia o urgencia.
Generá UNA sola línea en español que incluya, solo si están presentes: duración en días, fecha de inicio, fecha de fin y motivo/descripción.
No inventes datos que el empleado no dio. No agregues saludos, comillas ni explicaciones. Respondé únicamente el resumen en una línea.`;

export async function parseDetalle(rawText: string): Promise<string> {
  const fallback = rawText.replace(/\s+/g, " ").trim();
  try {
    const response = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: PARSE_DETALLE_SYSTEM },
          { role: "user", content: rawText },
        ],
        max_tokens: 200,
      },
      { timeout: 12000, maxRetries: 1 }
    );
    const out = response.choices[0]?.message?.content?.trim();
    return out && out.length > 0 ? out.replace(/\s+/g, " ") : fallback;
  } catch (err) {
    console.error("[rrhh] parseDetalle falló, uso el texto crudo:", err);
    return fallback;
  }
}
