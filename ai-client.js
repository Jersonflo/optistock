/**
 * ai-client.js (Anteriormente groq-client.js)
 * Cliente para la API de OpenRouter con Function Calling.
 */

require('dotenv').config();
const tools = require('./agent-tools');

const PROVIDERS = [
  {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: process.env.GROQ_API_KEY,
    // Debe ser un id válido en console.groq.com (ej. llama-3.3-70b-versatile). No uses ids de OpenRouter aquí.
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  },
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it'
  }
];

// ─── System Prompt del Agente ────────────────────────────────────
const SYSTEM_PROMPT = `Eres OptiBot, el asistente de inventario inteligente de OptiStock. Tu trabajo es ayudar a los usuarios a consultar el estado del inventario, préstamos y mantenimiento de un laboratorio.

## Enrutamiento de intenciones (OBLIGATORIO — elige la tool correcta antes de responder):
- **Ubicación / "¿Dónde está…?" / "¿En qué gabinete…?" / "¿Dónde guardan…?"** → \`query_estado\`. La respuesta incluye el campo **ubicacion_resumen** por cada artículo: cítalo tal cual. Si hay varias filas (ej. dos modelos de gafas), lista **cada una** con su **nombre** y su **ubicacion_resumen**; no agrupes en un solo gabinete inventado.
- **Categorías en gabinetes** ("¿qué categorías hay en los gabinetes?", "categorías por armario", "tipos de cosas en cada gabinete") → \`query_categorias_gabinetes\` (opcional **filtro_gabinete** si nombran un gabinete). Usa **categorias_distintas_en_gabinetes** y **resumen_por_gabinete**.
- **Cantidad / "¿Cuántos hay?"** → \`query_stock\`.
- **Última persona / último movimiento en general** ("¿quién retiró algo último?", "último préstamo sin decir el artículo", actividad reciente global) → \`query_actividad_reciente\`. Usa **mas_reciente** y la lista **eventos**; accion \`withdrawn\` = retiro, \`returned\` = devolución.
- **Qué sigue retirado / pendiente de devolución / "no han devuelto" / préstamos activos sin nombrar un artículo** → \`get_estadisticas\` **sin keyword** (objeto vacío \`{}\`). Lee **pendientes_devolucion** y/o **currentlyWithdrawn**: lista de [artículo, cantidad neta aún retirada]. Si está vacía, di que no hay saldo pendiente según el historial. **Prohibido** preguntar al usuario si quiere filtrar por retiro o devolución: llama la tool y responde con datos.
- **Préstamos de un artículo concreto** ("¿quién tiene el Arduino?", historial del cautín) → \`query_prestamo\` con **keyword** obligatorio (nombre del artículo). Si el usuario no nombra ningún artículo, NO uses esta tool para "último en general".
- **Mantenimiento: planes, periodicidad, "¿cuándo fue el último mantenimiento…?"** → \`query_mantenimiento\`. Usa los campos **ultimo_mantenimiento_fecha** y **mantenimientos_registrados**. Si **ultimo_mantenimiento_fecha** es null pero hay plan, di que no hay fechas registradas en el historial (no inventes fechas). Si NO_MAINTENANCE_PLAN, dilo claro.
- **Estadísticas globales, rankings, "más usados", "nunca usados", préstamos en curso agregados** → \`get_estadisticas\` (sin keyword o con keyword según la pregunta).
- **Solo si el equipo no está en inventario y hace falta documentación externa** → \`search_web\`.
- **Evita \`query_database_all\`** salvo que ninguna herramienta anterior baste; es último recurso.

## Reglas ESTRICTAS de Comportamiento:
- **Sin meta-comentarios**: está PROHIBIDO escribir entre paréntesis (o aparte) cosas como "Puedo usar la herramienta X", "te sugiero consultar…", mencionar APIs, JSON o nombres internos de funciones. Habla solo con el usuario de forma natural.
- Tienes acceso a herramientas (Function Calling). **NUNCA escribas etiquetas como <function> en texto plano**. Usa el protocolo JSON nativo de la API.
- **USO RESPONSABLE DE HERRAMIENTAS**: Llama SOLO a la herramienta estrictamente necesaria para lo que pregunta el usuario. NO ejecutes múltiples herramientas en paralelo ni repitas llamadas en bucle.
- **No pidas aclaraciones innecesarias**: si una tool puede responder con \`{}\` o valores por defecto, úsala ya. No ofrezcas menús del tipo "¿quieres ver todo o solo retiros?".
- **ALUCINACIONES PROHIBIDAS**: Si una herramienta te devuelve NOT_FOUND o no trae resultados, DÍSELO DIRECTAMENTE AL USUARIO. Está ESTRICTAMENTE PROHIBIDO inventar gabinetes, cantidades o fechas. **Nunca** cites "Gabinete X-XX" si no viene en el JSON de la tool. NUNCA menciones identificadores UUID o IDs de base de datos en tus respuestas.
- **LÍMITE DE SALIDA Y LISTAS**: Debes ser BREVE (2-4 líneas en respuestas generales), PERO si una herramienta te devuelve una lista de varios elementos (ej. varios tipos de "Gafas" o "Cables"), **DEBES mencionar TODOS los elementos encontrados** (puedes usar viñetas cortas). NUNCA recortes ni omitas ítems devueltos por la base de datos.
- **LA EXCEPCIÓN AL LÍMITE (MANTENIMIENTO)**: Cuando el usuario pida "planes de mantenimiento" o pregunten por mantenimiento de una máquina, ERES LIBRE DE GENERAR UNA RESPUESTA LARGA Y EXHAUSTIVA. Detalla todo paso a paso.
- **Solo si un equipo especial requiere consultar documentación manuales externos no relacionados a nuestro inventario** → \`search_web\`. NO uses search_web para inventar planes de mantenimiento de cosas que el usuario busca en nuestro inventario.
- Responde de forma profesional pero amigable, usando emojis.
- **Zona horaria**: cuando existan campos **fecha_*_colombia** o similares, son la hora local de **Colombia (Bogotá)**. Úsalos para responder al usuario; las cadenas ISO en UTC son solo referencia técnica.`;

// ─── Definición de Tools para Function Calling ───────────────────
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'query_stock',
      description: 'Busca artículos en el inventario por nombre y devuelve su cantidad disponible.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Nombre o parte del nombre del artículo a buscar (ej: "cautin", "arduino", "cable HDMI")'
          }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_estado',
      description: 'Ubicación y ficha del artículo. OBLIGATORIA para "¿dónde está?", "¿en qué gabinete?", "¿dónde guardan…?". Devuelve por cada fila: name, quantity, cabinets y **ubicacion_resumen** (texto ya listo: gabinete o sin gabinete + detalle). Si hay varios resultados, son varios artículos distintos; no fusiones ubicaciones.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Nombre o parte del nombre del artículo'
          }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_categorias_gabinetes',
      description:
        'Lista categorías de artículos que están asignados a gabinetes: lista global única y desglose por gabinete (nombre, ubicación, categorías con cantidad de ítems). Para preguntas sobre tipos/categorías en armarios.',
      parameters: {
        type: 'object',
        properties: {
          filtro_gabinete: {
            type: 'string',
            description:
              'Opcional. Texto para filtrar por nombre o ubicación del gabinete (ej. "A-02", "B-01"). Si el usuario pregunta en general, omitir o enviar vacío.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_prestamo',
      description: 'Solo cuando el usuario indica un artículo o equipo concreto. Historial reciente de retiros/devoluciones de ese ítem. NO usar si la pregunta es global ("última persona que retiró cualquier cosa"): en ese caso usar query_actividad_reciente.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Nombre del artículo (obligatorio para esta tool)'
          }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_actividad_reciente',
      description: 'Actividad global reciente en gabinetes: últimos retiros y devoluciones con usuario, nombre del artículo, fecha_sesion (ISO UTC) y **fecha_sesion_colombia** (hora Colombia). Usar cuando NO se menciona un artículo específico. Parámetros opcionales; puedes llamar con {}.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            description:
              'Opcional. Número entre 1 y 50 como TEXTO (ej. "20" o "1"). Groq exige string aquí; no envíes número JSON sin comillas.'
          },
          action_filter: {
            type: 'string',
            description:
              'Opcional. Escribe exactamente: all (retiros y devoluciones), withdrawn (solo retiros), o returned (solo devoluciones). Si no aplica, omite el campo.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_mantenimiento',
      description: 'Planes e historial de mantenimiento. Usar para "plan de mantenimiento", periodicidad, y preguntas de fecha ("¿cuándo fue el último mantenimiento a…?"). El JSON incluye **ultimo_mantenimiento_fecha** y **mantenimientos_registrados** por plan/equipo. Pasar el nombre del equipo aunque la pregunta sea larga en español.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Nombre del equipo. Opcional. Si se omite, devuelve todos los planes.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_estadisticas',
      description:
        'Estadísticas globales: más usados, nunca usados, timeline reciente, y **pendientes_devolucion** (artículos con cantidad neta retirada y no devuelta). Usar para "qué está retirado", "qué falta por devolver", "préstamos activos" sin nombre de artículo → llamar con {}.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Opcional. Solo si filtran estadísticas a un artículo concreto. Para pendientes globales, omitir.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Busca en internet información (p.ej. planes de mantenimiento de fabricantes, guías, manuales de equipos).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'La consulta directa de búsqueda web.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_database_all',
      description:
        'Consultas avanzadas a la BD. Tablas: inventory_items, cabinets, categories, profiles, cabinet_sessions, session_items, items_maintenance.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Nombre de la tabla principal.' },
          select: { type: 'string', description: 'Columnas a seleccionar. Soporta foreign joins: ej. "id, name, cabinets_rows(location, description)"' },
          eq_column: { type: 'string', description: 'Columna para filtrar búsqueda exacta (opcional)' },
          eq_value: { type: 'string', description: 'Valor a buscar en columna exacta (opcional)' },
          ilike_column: { type: 'string', description: 'Columna para buscar substrings con LIKE (opcional)' },
          ilike_value: { type: 'string', description: 'Valor para buscar con LIKE (opcional)' },
          limit: {
            type: 'string',
            description: 'Máximo de filas como texto (ej. "15"). Opcional.'
          }
        },
        required: ['table']
      }
    }
  }
];

function normalizeActionFilter(raw) {
  if (raw == null || raw === '') return 'all';
  const s = String(raw).trim().toLowerCase();
  if (['withdrawn', 'retiro', 'retiros', 'prestamo', 'préstamo'].includes(s)) return 'withdrawn';
  if (['returned', 'devolucion', 'devoluciones', 'devolución', 'devuelto', 'devueltos'].includes(s)) {
    return 'returned';
  }
  if (['all', 'todo', 'todos', 'ambos'].includes(s)) return 'all';
  return 'all';
}

/** Groq a veces envía limit como string; otros modelos como número. */
function coerceToolLimit(raw, def = 20) {
  if (raw === undefined || raw === null || raw === '') return def;
  const n =
    typeof raw === 'string'
      ? parseInt(raw.trim(), 10)
      : Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, 50);
}

// ─── Ejecutar una Tool por nombre ────────────────────────────────
async function executeTool(toolName, args) {
  try {
    switch (toolName) {
      case 'query_stock':
        return await tools.queryStock(args.keyword);
      case 'query_estado':
        return await tools.queryEstado(args.keyword);
      case 'query_categorias_gabinetes':
        return await tools.queryCategoriasGabinetes({
          filtro_gabinete: args.filtro_gabinete || '',
        });
      case 'query_prestamo':
        return await tools.queryPrestamo(args.keyword);
      case 'query_actividad_reciente':
        return await tools.queryActividadReciente({
          limit: coerceToolLimit(args.limit, 20),
          action_filter: normalizeActionFilter(args.action_filter),
        });
      case 'query_mantenimiento':
        return await tools.queryMantenimiento(args.keyword || '');
      case 'get_estadisticas':
        return await tools.getEstadisticas(args.keyword || '');
      case 'search_web':
        return await tools.searchWeb(args.query);
      case 'query_database_all':
        return await tools.queryDatabaseAll(args);
      default:
        return { error: `Tool "${toolName}" no reconocida` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Llamada a la API de AI (Multi-APIs Fallback) ──────────────
async function callAi(messages, useTools = true, providerIndex = 0, dynamicMaxTokens = 2048) {
  if (providerIndex >= PROVIDERS.length) {
    throw new Error('Todos los proveedores de AI han fallado.');
  }

  const provider = PROVIDERS[providerIndex];
  if (!provider.key) {
    console.warn(`[AI] Proveedor ${provider.name} no tiene API Key configurada. Saltando al siguiente...`);
    return await callAi(messages, useTools, providerIndex + 1, dynamicMaxTokens);
  }

  const body = {
    model: provider.model,
    messages,
    temperature: 0.3,
    max_tokens: dynamicMaxTokens,
  };

  if (useTools) {
    body.tools = TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  let response;
  try {
    response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.key}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000) // Timeout de 9s para responder antes que Vercel corte
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      console.warn(`[AI] Timeout de 9s alcanzado con ${provider.name}. Intentando respaldo...`);
    } else {
      console.warn(`[AI] Error de red con ${provider.name} (${provider.model}): ${err.message}. Intentando respaldo...`);
    }
    return await callAi(messages, useTools, providerIndex + 1, dynamicMaxTokens);
  }

  if (!response.ok) {
    // Manejo específico de falta de tokens o saldo (402/429)
    if (response.status === 402 || response.status === 429) {
      console.warn(`[AI] Agotada cuota en ${provider.name} (${response.status}).`);
      if (providerIndex < PROVIDERS.length - 1) {
        console.warn(`[AI] Intentando respaldo...`);
        return await callAi(messages, useTools, providerIndex + 1, dynamicMaxTokens);
      } else {
        throw new Error('QUOTA_EXCEEDED');
      }
    }

    const errText = await response.text();
    if (response.status === 400) {
      console.warn(
        `[AI] HTTP 400 en ${provider.name} (revisa modelo y esquema de tools). Primeros 900 caracteres del cuerpo:\n${errText.slice(0, 900)}`
      );
    } else {
      console.warn(`[AI] Falló ${provider.name} (${provider.model}) - HTTP ${response.status}: ${errText.slice(0, 500)}`);
    }
    console.warn(`[AI] Reintentando con siguiente proveedor de respaldo...`);
    return await callAi(messages, useTools, providerIndex + 1, dynamicMaxTokens);
  }

  return await response.json();
}

/** Algunos proveedores rechazan o reinyectan campos extra en el mensaje del asistente. */
function sanitizeAssistantMessageForApi(msg) {
  if (!msg || typeof msg !== 'object') return msg;
  const out = { ...msg };
  delete out.refusal;
  delete out.reasoning;
  delete out.reasoning_content;
  delete out.audio;
  return out;
}

// ─── Ciclo Principal de Chat ─────────────────────────────────────
// Maneja el flujo: mensaje → AI → (tool calls) → resultado final
async function chat(conversationHistory) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory
  ];

  try {
    // Primera llamada al AI (Buscando herramientas o respuesta directa)
    // Usamos menos tokens aquí para que sea más rápido.
    let result = await callAi(messages, true, 0, 800);
    let choice = result.choices[0];
    let assistantMessage = choice.message;

    // Si el AI quiere usar tools, ejecutarlas y reenviar
    let iterations = 0;
    const MAX_ITERATIONS = 3; // Reducido para evitar timeouts en Vercel

    while (choice.finish_reason === 'tool_calls' && iterations < MAX_ITERATIONS) {
      iterations++;

      // Agregar el mensaje del asistente (con tool_calls) al historial
      messages.push(sanitizeAssistantMessageForApi(assistantMessage));

      // Ejecutar cada tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs = {};

        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          fnArgs = {};
        }

        console.log(`[AI] Ejecutando tool: ${fnName}(${JSON.stringify(fnArgs)})`);
        const toolResult = await executeTool(fnName, fnArgs);

        // Agregar resultado de la tool al historial
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });
      }

      // Reenviar al AI con los resultados de las tools
      // Si iterations es menor que MAX_ITERATIONS-1, usamos pocos tokens; en la última vuelta damos margen para la respuesta final.
      const isLastLap = iterations >= MAX_ITERATIONS;
      result = await callAi(messages, true, 0, isLastLap ? 2048 : 800);
      choice = result.choices[0];
      assistantMessage = choice.message;
    }

    return assistantMessage.content || 'Lo siento, no pude procesar tu solicitud. ¿Podrías reformular tu pregunta?';
  } catch (error) {
    // Manejo elegante de errores
    if (error.message === 'QUOTA_EXCEEDED') {
      return 'He agotado mi cuota de mensajes o tokens por hoy. 😔 Por favor, revisa tu saldo en la API o vuelve a intentarlo más tarde.';
    }
    
    console.warn('[CHAT] Excepción atrapada elegantemente:', error.message);
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return 'La respuesta está tardando más de lo esperado debido a la complejidad de la consulta. ⏳ Por favor, intenta ser más específico o prueba de nuevo en un momento.';
    }
    return 'Lamentablemente mis circuitos de IA principales y de respaldo están experimentando alta demanda o fallos en este momento. 😔 Por favor, vuelve a intentarlo en un minuto.';
  }
}

module.exports = { chat };
