# Agente WhatsApp

Dashboard local para gestionar conversaciones de WhatsApp con IA, usando Baileys + Next.js + SQLite.

## Requisitos

- Node.js >= 20.9.0 (recomendado: 22)
- Una cuenta de [OpenRouter](https://openrouter.ai/) con API key

## Setup rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo de variables de entorno
cp .env.example .env.local
# Editá .env.local con tu API key de OpenRouter

# 3. Levantar bot + dashboard en dos terminales separadas:
npm run start:bot   # Terminal 1
npm run dev         # Terminal 2

# O ambos juntos (solo para producción):
npm run start:all
```

Luego abrí http://localhost:3000 y escaneá el QR desde ahí.

## Variables de entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `OPENROUTER_API_KEY` | API key de OpenRouter | `sk-or-...` |
| `OPENROUTER_MODEL` | Modelo a usar | `openai/gpt-4o-mini` |

### Sobre el modelo

**Recomendamos `openai/gpt-4o-mini`** ($0.15 por millón de tokens de entrada).
Los modelos `:free` de OpenRouter tienen un límite de 50 requests/día sin créditos cargados
y van a fallar con error 429 en uso real. Para un bot de WhatsApp de uso normal,
`gpt-4o-mini` cuesta centavos por mes.

## Personalizar el system prompt

Editá `src/lib/system-prompt.ts` y cambiá el texto por el prompt de tu negocio:

```typescript
export const SYSTEM_PROMPT = `
Sos el asistente virtual de Ferretería López.
Respondé en español rioplatense, en mensajes cortos.
Si el cliente pide un presupuesto, pedile el producto y la cantidad.
Si no podés resolver algo, decí: "Te paso con un asesor ahora."
`.trim();
```

Reiniciá el bot (`Ctrl+C` y `npm run start:bot`) para que tome el cambio.

## Flujo de funcionamiento

```
Cliente escribe → Baileys recibe → SQLite guarda → LLM responde (modo AI)
                                                 → Solo guarda (modo HUMAN)

Dashboard → POST /api/messages → SQLite (role=human) + outbox
Bot (cada 2s) → lee outbox → Baileys envía → marca sent=1
```

## Estructura de datos

- `./data/messages.db` — SQLite con conversaciones, mensajes, estado de conexión y outbox
- `./auth/` — sesión de Baileys (credenciales WhatsApp Web)

Ambas carpetas están en `.gitignore`. **No las commitees.**

## Seguridad — IMPORTANTE

El dashboard no tiene autenticación. Cualquiera con acceso a la URL puede:
- Leer todas las conversaciones de WhatsApp
- Enviar mensajes haciéndose pasar por vos

**Antes de exponer el dashboard a internet**, protegelo con:
- Basic auth a nivel proxy (Nginx, Caddy, EasyPanel)
- [Cloudflare Access](https://www.cloudflare.com/products/zero-trust/access/)
- VPN

Esto es **bloqueante para producción**.

## Deploy en EasyPanel / Railway

1. El `Procfile` y `nixpacks.toml` ya están configurados.
2. Configurá las variables de entorno en el panel de la plataforma.
3. **Volúmenes persistentes obligatorios:**
   - `/app/data` — base de datos SQLite
   - `/app/auth` — sesión de Baileys

   Sin volúmenes persistentes, cada redespliegue pierde todas las conversaciones
   y obliga a re-escanear el QR.

## Troubleshooting

### El bot se cae con código 440 en loop
WhatsApp está rechazando el browser fingerprint. Soluciones:
1. En tu teléfono: Configuración → Dispositivos vinculados → eliminá todos los dispositivos de pruebas anteriores.
2. Verificá que `Browsers.macOS('Desktop')` esté en `src/lib/baileys/client.ts`.
3. Si persiste: cambiá de IP o esperá 24h.

### El LLM devuelve error 429
Llegaste al límite del modelo `:free`. Cambiá `OPENROUTER_MODEL=openai/gpt-4o-mini` en `.env.local`.

### El QR no aparece en el dashboard
Verificá que el proceso bot esté corriendo (`npm run start:bot`). El QR se genera en el bot y se guarda en SQLite para que el dashboard lo lea.

### Procesos zombie en Windows
Si Ctrl+C no mata todos los procesos:
```powershell
# Buscar procesos node
tasklist | findstr node
# Matar por PID
taskkill /PID <numero> /F
```

## Mejoras pendientes (v2)

- Soporte de imágenes salientes (enviar PNG de productos)
- Function calling con `tools` de OpenRouter
- Auto-toggle a modo HUMAN cuando el bot dice una frase específica
- WebSocket en lugar de polling para actualizaciones en tiempo real
- Autenticación básica integrada en Next.js (middleware)
- Soporte de grupos de WhatsApp
