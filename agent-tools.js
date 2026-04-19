/**
 * agent-tools.js
 * Módulo de herramientas del Agente OptiStock.
 * Refactor de la lógica de tools.js y stats.js como funciones exportables
 * para ser invocadas desde el servidor Express + GROQ.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { search } = require('duck-duck-scrape');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[agent-tools] ERROR: Credenciales de Supabase no encontradas en .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/** Zona horaria para respuestas al usuario (Colombia). Sobrescribe con APP_TIMEZONE si hace falta. */
const TIMEZONE_COLOMBIA = process.env.APP_TIMEZONE || 'America/Bogota';

/** ISO/timestamp → texto legible en hora Colombia (ej. retiros, sesiones). */
function formatColombiaDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: TIMEZONE_COLOMBIA,
    dateStyle: 'long',
    timeStyle: 'short',
    hour12: true,
  }).format(d);
}

/** Fecha SQL solo día (YYYY-MM-DD) o ISO completo → texto en contexto Colombia. */
function formatColombiaDateFlexible(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00-05:00`);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: TIMEZONE_COLOMBIA,
      dateStyle: 'long',
    }).format(d);
  }
  return formatColombiaDateTime(value);
}

// Función auxiliar para normalizar texto (quitar acentos)
function normalize(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'en', 'por',
  'para', 'con', 'sin', 'que', 'cual', 'cuales', 'quien', 'quienes', 'este', 'esta', 'estos', 'estas',
  'tipo', 'modelo', 'hay', 'me', 'mi', 'tu', 'su', 'se', 'les', 'lo', 'le', 'da', 'das', 'dame', 'dime',
 'saber', 'info', 'informacion', 'información', 'sobre', 'ultimo', 'último', 'ultima', 'última', 'vez',
  'fue', 'ser', 'eso', 'esa', 'como', 'cómo'
]);

/**
 * Genera variantes del texto del usuario quitando muletillas de pregunta para que ilike
 * coincida con nombres reales en inventario (ej. "¿dónde están las gafas VR?" → "gafas VR").
 */
function keywordVariants(raw) {
  const base = String(raw || '').trim().replace(/\?+$/g, '').trim();
  if (!base) return [];

  let stripped = base;
  const patterns = [
    /^(donde|dónde)\s+(estan|están|está|esta|puedo\s+encontrar|se\s+encuentran?|pueden\s+estar)\s+(las?|los?|el|un|una)?\s*/gi,
    /^(en\s+que|en\s+qué)\s+gabinete\s+(estan|están|está|esta)?\s*(las?|los?|el|un|una)?\s*/gi,
    /^(en\s+que|en\s+qué)\s+lugar\s+(estan|están|está|esta)?\s*(las?|los?|el)?\s*/gi,
    /^(dime|dame|quiero\s+saber|necesito\s+saber)\s+(donde|dónde|el|la|los|las)?\s*/gi,
    /^(cuando|cuándo)\s+se\s+(le|les)\s+(hizo|hicieron|realizo|realizó|registro|registró)\s+(el\s+|la\s+|los\s+|las\s+)?(ultimo\s+|último\s+)?(mantenimiento\s+)?(al|a|del|de)\s+/gi,
    /^(cuando|cuándo)\s+(fue|es|será|sera)\s+(el\s+|la\s+)?(ultimo|último)\s+(mantenimiento|servicio)\s+(al|a|del|de)\s+/gi,
    // "¿Cuándo se le hizo por última vez mantenimiento al plotter?" → equipo al final
    /^(cuando|cuándo)\s+.+?\s+(al|a|del|de)\s+/gi,
    /^(cuantas?|cuántas?|cuantos?|cuántos?)\s+/gi,
    /^(que|qué)\s+(articulos?|artículos?|equipos?)\s+/gi,
    /^(listar?|mostrar?|ver)\s+(los?|las?|el|la)?\s*(articulos?|artículos?)?\s*/gi,
    /\s+mantenimiento\s*$/gi,
  ];

  let prev;
  do {
    prev = stripped;
    for (const p of patterns) {
      stripped = stripped.replace(p, '');
    }
  } while (stripped !== prev);

  stripped = stripped.replace(/\s+/g, ' ').trim();

  const tokens = (s) =>
    s.split(/\s+/).filter((t) => t.length > 2 && !STOP_WORDS.has(normalize(t)));

  const tokStripped = tokens(stripped);
  const tokBase = tokens(base);

  const out = [];
  const push = (s) => {
    const t = String(s || '').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };
  const addVariants = (s) => {
    const t = String(s || '').trim();
    push(t);
    if (t.endsWith('s') && t.length > 4) {
      if (t.endsWith('es')) push(t.slice(0, -2));
      push(t.slice(0, -1));
    }
  };

  if (stripped.length >= 2) addVariants(stripped);
  if (tokStripped.length) addVariants(tokStripped.join(' '));
  if (tokStripped.length > 1) {
    const longest = [...tokStripped].sort((a, b) => normalize(b).length - normalize(a).length)[0];
    if (longest && normalize(longest).length >= 4) addVariants(longest);
  }
  if (tokBase.length && tokBase.join(' ') !== tokStripped.join(' ')) addVariants(tokBase.join(' '));
  addVariants(base);

  return out;
}

function filterItemsByNormalizedVariants(allItems, variants) {
  if (!allItems || !variants.length) return [];
  const nvars = variants.map((v) => normalize(v)).filter((v) => v.length >= 2);
  if (!nvars.length) return [];
  const best = [...nvars].sort((a, b) => b.length - a.length)[0];
  return allItems.filter((item) => {
    const nn = normalize(item.name);
    return nvars.some((nv) => nn.includes(nv) || (nv.length >= 4 && nv.includes(nn)));
  });
}

async function findInventoryByKeyword(keyword, selectColumns) {
  const variants = keywordVariants(keyword);
  for (const term of variants) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select(selectColumns)
      .ilike('name', `%${term}%`);
    if (error) throw new Error(error.message);
    if (data && data.length) return data;
  }
  const { data: allItems, error: errAll } = await supabase
    .from('inventory_items')
    .select(selectColumns);
  if (errAll || !allItems) return [];
  return filterItemsByNormalizedVariants(allItems, variants);
}

function enrichEstadoRows(rows) {
  return rows.map((row) => {
    const c = row.cabinets;
    let ubicacion_resumen;
    if (c && (c.name || c.location)) {
      const parts = [c.name, c.location].filter(Boolean);
      ubicacion_resumen = parts.length ? `Gabinete: ${parts.join(' — ')}` : 'Gabinete (sin nombre en BD)';
    } else {
      const extra =
        row.description ||
        (c && typeof c === 'object' && c.description) ||
        null;
      ubicacion_resumen = extra
        ? `Sin gabinete en inventario; detalle: ${extra}`
        : 'Sin gabinete asignado en la base de datos (revisar si está en bodega/sitio sin ficha de gabinete).';
    }
    return { 
      name: row.name, 
      quantity: row.quantity, 
      ubicacion_resumen 
    };
  });
}

function enrichMaintenanceRows(rows) {
  if (!Array.isArray(rows)) return rows;
  const now = new Date();
  
  return rows.map((row) => {
    const hist = row.maintenance_history;
    const fechas = (Array.isArray(hist) ? hist : []).map((h) => h && h.date).filter(Boolean);
    const sorted = [...fechas].sort((a, b) => String(a).localeCompare(String(b)));
    const ultimo = sorted.length ? sorted[sorted.length - 1] : null;
    
    let diasFaltantes = null;
    if (row.interval_days) {
      const baseDateIso = ultimo || row.created_at;
      if (baseDateIso) {
        const baseDate = new Date(baseDateIso);
        const maintenanceDate = new Date(baseDate.getTime() + row.interval_days * 24 * 60 * 60 * 1000);
        const msRemaining = maintenanceDate.getTime() - now.getTime();
        diasFaltantes = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      }
    }
    
    // Eliminamos info redundante para no confundir al modelo
    const { maintenance_history, ...cleanRow } = row;
    
    return {
      ...cleanRow,
      ultimo_mantenimiento_fecha: ultimo,
      ultimo_mantenimiento_fecha_colombia: ultimo ? formatColombiaDateFlexible(ultimo) : null,
      mantenimientos_registrados: fechas.length,
      dias_faltantes_calculados: diasFaltantes !== null ? diasFaltantes : 'Sin intervalo configurado'
    };
  });
}

// ─── TOOL: Consultar Stock ───────────────────────────────────────
async function queryStock(keyword) {
  const data = await findInventoryByKeyword(keyword, 'name, quantity');
  return data && data.length
    ? data
    : { result: 'NOT_FOUND', message: `No se encontraron artículos con "${keyword}"` };
}

// ─── TOOL: Estado detallado de un artículo (Sin RPC) ─────────────────
async function queryEstado(keyword) {
  const selects = [
    'id, name, quantity, category_id, cabinet_id, description, cabinets(id, name, location, description)',
    'id, name, quantity, category_id, cabinet_id, description, cabinets(id, name, location)',
    'id, name, quantity, category_id, cabinet_id, cabinets(id, name, location)',
  ];

  const variants = keywordVariants(keyword);

  for (const selectStr of selects) {
    let schemaError = false;
    for (const term of variants) {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(selectStr)
        .ilike('name', `%${term}%`);
      if (error) {
        schemaError = true;
        break;
      }
      if (data && data.length) return enrichEstadoRows(data);
    }
    if (schemaError) continue;

    const { data: allItems, error: errAll } = await supabase
      .from('inventory_items')
      .select(selectStr);
    if (!errAll && allItems) {
      const data = filterItemsByNormalizedVariants(allItems, variants);
      if (data.length) return enrichEstadoRows(data);
    }
  }

  return { result: 'NOT_FOUND', message: `No se encontró información para "${keyword}"` };
}

// ─── TOOL: Consultar quién tiene prestado un artículo (Sin RPC) ────────────
async function queryPrestamo(keyword) {
  const items = await findInventoryByKeyword(keyword, 'id, name');
  if (!items || items.length === 0) {
    return { result: 'NOT_FOUND', message: `No existe el artículo "${keyword}"` };
  }

  const matches = [];
  for (const it of items) {
    const { data, error } = await supabase
      .from('session_items')
      .select('action, quantity, cabinet_sessions(user_id, opened_at)')
      .eq('item_id', it.id)
      .order('session_id', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = data || [];
    const uids = [...new Set(rows.map((r) => r.cabinet_sessions?.user_id).filter(Boolean))];
    let profileMap = {};
    if (uids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', uids);
      profileMap = Object.fromEntries((profs || []).map((p) => [p.id, p.full_name]));
    }
    const prestamos_recientes = rows.map((row) => {
      const o = row.cabinet_sessions?.opened_at ?? null;
      return {
        action: row.action,
        quantity: row.quantity,
        opened_at: o,
        opened_at_colombia: o ? formatColombiaDateTime(o) : null,
        full_name: profileMap[row.cabinet_sessions?.user_id] || null,
      };
    });
    matches.push({
      item: it.name,
      item_id: it.id,
      prestamos_recientes,
    });
  }

  const anyHistory = matches.some((m) => m.prestamos_recientes.length > 0);
  if (!anyHistory) {
    return {
      result: 'NO_ACTIVE_LOANS',
      message: `No hay registros de préstamos para los artículos que coinciden con "${keyword}"`,
      articulos_coincidentes: matches.map((m) => m.item),
    };
  }
  return { matches };
}

/**
 * Fallback: sesiones ordenadas por opened_at, luego session_items de esas sesiones.
 * Evita depender de order por FK (si PostgREST falla) y evita el bug de ordenar por session_items.id.
 */
async function fetchActividadViaSessionsOrder(selectJoin, selectLite, filter, fetchCap) {
  const sessionLimit = Math.min(1200, Math.max(fetchCap * 4, 400));
  const { data: sess, error: errS } = await supabase
    .from('cabinet_sessions')
    .select('id, opened_at')
    .order('opened_at', { ascending: false })
    .limit(sessionLimit);
  if (errS) throw new Error(errS.message);
  if (!sess || !sess.length) return [];

  const sessionIds = sess.map((s) => s.id);
  const openedBySession = Object.fromEntries(sess.map((s) => [s.id, s.opened_at]));

  const run = async (sel) => {
    let q = supabase.from('session_items').select(sel).in('session_id', sessionIds);
    if (filter) q = q.eq('action', filter);
    const { data, error } = await q.limit(Math.min(fetchCap * 8, 4000));
    if (error) throw new Error(error.message);
    return data || [];
  };

  let rows;
  try {
    rows = await run(selectJoin);
  } catch (e) {
    rows = await run(selectLite);
  }

  rows.sort((a, b) => {
    const sa = openedBySession[a.session_id] || a.cabinet_sessions?.opened_at;
    const sb = openedBySession[b.session_id] || b.cabinet_sessions?.opened_at;
    const ta = sa ? new Date(sa).getTime() : 0;
    const tb = sb ? new Date(sb).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
  return rows.slice(0, fetchCap);
}

/**
 * Últimos retiros/devoluciones en todo el inventario (sin filtrar por artículo).
 * Orden cronológico real por fecha de sesión (opened_at), no por id de session_items.
 */
async function queryActividadReciente({ limit = 20, action_filter = 'all' } = {}) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const filter =
    action_filter === 'withdrawn' || action_filter === 'returned' ? action_filter : null;
  const fetchCap = Math.min(Math.max(n * 5, 80), 400);

  const selectJoin =
    'id, action, quantity, item_id, session_id, inventory_items(name), cabinet_sessions(opened_at, user_id)';
  const selectLite = 'id, action, quantity, item_id, session_id, cabinet_sessions(opened_at, user_id)';

  const orderBySessionOpened = (q) =>
    q
      .order('opened_at', { ascending: false, foreignTable: 'cabinet_sessions' })
      .order('id', { ascending: false });

  let data = null;

  let q1 = supabase.from('session_items').select(selectJoin);
  if (filter) q1 = q1.eq('action', filter);
  const res1 = await orderBySessionOpened(q1).limit(fetchCap);
  if (!res1.error && res1.data && res1.data.length) {
    data = res1.data;
  } else {
    let q2 = supabase.from('session_items').select(selectLite);
    if (filter) q2 = q2.eq('action', filter);
    const res2 = await orderBySessionOpened(q2).limit(fetchCap);
    if (!res2.error && res2.data && res2.data.length) {
      data = res2.data;
    }
  }

  if (!data || data.length === 0) {
    data = await fetchActividadViaSessionsOrder(selectJoin, selectLite, filter, fetchCap);
  }

  const ids = [...new Set((data || []).map((r) => r.item_id).filter(Boolean))];
  let nameMap = {};
  if (ids.length) {
    const { data: items } = await supabase.from('inventory_items').select('id, name').in('id', ids);
    nameMap = Object.fromEntries((items || []).map((i) => [i.id, i.name]));
  }
  const userIds = [...new Set((data || []).map((r) => r.cabinet_sessions?.user_id).filter(Boolean))];
  let profileMap = {};
  if (userIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
    profileMap = Object.fromEntries((profs || []).map((p) => [p.id, p.full_name]));
  }

  const eventos = sortActividadByFecha(
    (data || []).map((row) => {
      const inv = row.inventory_items;
      const fromJoin = Array.isArray(inv) ? inv[0]?.name : inv?.name;
      const uid = row.cabinet_sessions?.user_id;
      const fs = row.cabinet_sessions?.opened_at ?? null;
      return {
        id: row.id,
        accion: row.action,
        cantidad: row.quantity,
        articulo: fromJoin ?? nameMap[row.item_id] ?? null,
        fecha_sesion: fs,
        fecha_sesion_colombia: fs ? formatColombiaDateTime(fs) : null,
        usuario: profileMap[uid] || null,
      };
    })
  ).slice(0, n);

  return finalizeActividad(eventos);
}

function sortActividadByFecha(eventos) {
  return [...eventos].sort((a, b) => {
    const ta = a.fecha_sesion ? new Date(a.fecha_sesion).getTime() : 0;
    const tb = b.fecha_sesion ? new Date(b.fecha_sesion).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
}

function finalizeActividad(eventos) {
  if (!eventos.length) {
    return {
      result: 'NO_ACTIVITY',
      message: 'No hay registros de retiros o devoluciones en la base de datos.',
    };
  }
  return { eventos, mas_reciente: eventos[0] };
}

// ─── TOOL: Planes de mantenimiento ───────────────────────────────
async function queryMantenimiento(keyword) {
  if (!keyword || keyword.trim() === '') {
    // Si no hay keyword, traer todos los planes de mantenimiento
    const { data, error } = await supabase
      .from('items_maintenance')
      .select('id, interval_days, item_id, created_at');
    if (error) throw new Error(error.message);

    if (!data.length) return { result: 'NO_MAINTENANCE_PLANS', message: 'No hay planes de mantenimiento configurados' };

    // Enriquecer con nombres de items
    const itemIds = data.map(d => d.item_id);
    const { data: items } = await supabase
      .from('inventory_items')
      .select('id, name')
      .in('id', itemIds);

    const itemMap = Object.fromEntries((items || []).map(i => [i.id, i.name]));
    return data.map(d => ({ ...d, item_name: itemMap[d.item_id] || 'Desconocido' }));
  }

  // Buscar por keyword específico
  const variants = keywordVariants(keyword);
  let data;
  let error;

  for (const term of variants) {
    const res = await supabase
      .from('items_maintenance')
      .select('id, interval_days, item_id, inventory_items!inner(name), maintenance_history(date)')
      .ilike('inventory_items.name', `%${term}%`);
    error = res.error;
    if (error) throw new Error(error.message);
    if (res.data && res.data.length) {
      data = res.data;
      break;
    }
  }

  if (!data || data.length === 0) {
    const { data: allMaint, error: errAll } = await supabase
      .from('items_maintenance')
      .select('id, interval_days, item_id, inventory_items!inner(name), maintenance_history(date)');

    if (!errAll && allMaint) {
      data = allMaint.filter((m) => {
        const nn = normalize(m.inventory_items.name);
        return variants.some((v) => {
          const nv = normalize(v);
          return nn.includes(nv) || (nv.length >= 4 && nv.includes(nn));
        });
      });
    }
  }

  if (data && data.length) {
    return enrichMaintenanceRows(data);
  }
  return { result: 'NO_MAINTENANCE_PLAN', message: `No hay plan de mantenimiento para "${keyword}"` };
}

// ─── TOOL: Estadísticas generales del inventario ─────────────────
async function getEstadisticas(keyword = '') {
  const [
    { data: items, error: errItems },
    { data: sessionItems, error: errSession },
    { data: sessions, error: errSess },
    { data: profiles, error: errProf }
  ] = await Promise.all([
    supabase.from('inventory_items').select('id, name, quantity'),
    supabase
      .from('session_items')
      .select('item_id, session_id, action, quantity')
      .order('id', { ascending: false })
      .limit(8000),
    supabase.from('cabinet_sessions').select('id, user_id, opened_at'),
    supabase.from('profiles').select('id, full_name')
  ]);

  if (errItems || errSession || errSess || errProf) {
    throw new Error('Error extrayendo datos. Verifique permisos.');
  }

  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));
  const itemMap = Object.fromEntries(items.map(i => [i.id, i.name]));
  const sessionDataMap = Object.fromEntries(sessions.map(s => [s.id, { user: s.user_id, date: s.opened_at }]));

  let itemUsageCount = {};
  let userActivityCount = {};
  let itemCurrentState = {};
  let usedItemIds = new Set((sessionItems || []).map(si => si.item_id));

  const statVariants = keyword ? keywordVariants(keyword) : [];
  const statNorms = statVariants.map((v) => normalize(v)).filter(Boolean);
  let matchedItems = new Set();
  
  // Lista de eventos recientes para que la IA deduzca preguntas temporales (ej: "qué días...")
  let recent_historical_timeline = [];

  for (let si of (sessionItems || [])) {
    const itemName = itemMap[si.item_id] || 'Artículo desconocido';
    
    // Si hay keyword, filtramos las transacciones (cualquier variante extraída de la pregunta)
    if (statNorms.length) {
      const nn = normalize(itemName);
      const hit = statNorms.some(
        (nk) => nn.includes(nk) || (nk.length >= 4 && nk.includes(nn))
      );
      if (!hit) continue;
    }
    matchedItems.add(itemName);

    const sessionInfo = sessionDataMap[si.session_id] || {};
    const user = profileMap[sessionInfo.user] || 'Usuario desconocido';

    itemUsageCount[itemName] = (itemUsageCount[itemName] || 0) + 1;
    userActivityCount[user] = (userActivityCount[user] || 0) + 1;

    if (!itemCurrentState[itemName]) itemCurrentState[itemName] = 0;
    if (si.action === 'withdrawn') itemCurrentState[itemName] += si.quantity;
    if (si.action === 'returned') itemCurrentState[itemName] -= si.quantity;
    
    const dIso = sessionInfo.date;
    recent_historical_timeline.push({
      item: itemName,
      user: user,
      action: si.action,
      qty: si.quantity,
      date_iso: dIso,
      fecha_colombia: dIso ? formatColombiaDateTime(dIso) : null,
    });
  }

  const topUsers = Object.entries(userActivityCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (statNorms.length) {
    return {
      searched_item: keyword,
      exact_matches: Array.from(matchedItems),
      topUsers,
      total_transactions: recent_historical_timeline.length,
      recent_timeline: recent_historical_timeline.slice(0, 50)
    };
  }

  const topItems = Object.entries(itemUsageCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const neverUsed = items.filter(i => !usedItemIds.has(i.id)).map(i => i.name).sort();
  const currentlyWithdrawn = Object.entries(itemCurrentState).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
  const pendientes_devolucion = currentlyWithdrawn.map(([nombre, cantidad_neta]) => ({
    nombre,
    cantidad_neta_aun_retirada: cantidad_neta,
  }));

  return {
    total_items: items.length,
    never_used_count: neverUsed.length,
    topItems,
    topUsers,
    some_never_used: neverUsed.slice(0, 10),
    currentlyWithdrawn,
    pendientes_devolucion,
    // Limitado a 40 para evitar exceder el límite de TPM (Tokens Per Minute) de Groq
    recent_timeline: recent_historical_timeline.slice(0, 40)
  };
}

// ─── TOOL: Categorías en gabinetes ───────────────────────────────
/**
 * Responde: "¿qué categorías hay en los gabinetes?", desglose por armario, etc.
 */
async function queryCategoriasGabinetes({ filtro_gabinete = '' } = {}) {
  const filtro = String(filtro_gabinete || '').trim();
  const filtroNorm = filtro ? normalize(filtro) : '';

  const selects = [
    'id, name, quantity, cabinet_id, category_id, categories(id, name), cabinets(id, name, location)',
    'id, name, quantity, cabinet_id, category_id, cabinets(id, name, location)',
  ];

  let rows = null;
  let lastErr = null;
  for (const sel of selects) {
    const { data, error } = await supabase.from('inventory_items').select(sel);
    if (!error && data) {
      rows = data;
      break;
    }
    lastErr = error;
  }

  if (!rows) {
    return {
      result: 'QUERY_ERROR',
      message: lastErr ? lastErr.message : 'No se pudo leer inventario',
    };
  }

  let catNameById = {};
  const needCategoryLookup = rows.some(
    (r) => r.category_id && !(r.categories && (r.categories.name || (Array.isArray(r.categories) && r.categories[0]?.name)))
  );
  if (needCategoryLookup) {
    const { data: cats, error: ec } = await supabase.from('categories').select('id, name');
    if (!ec && cats) {
      catNameById = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    }
  }

  const conGabinete = rows.filter((r) => r.cabinet_id != null);
  let filtrados = conGabinete;
  if (filtroNorm) {
    filtrados = conGabinete.filter((r) => {
      const c = r.cabinets;
      const cab = Array.isArray(c) ? c[0] : c;
      const n = normalize([cab?.name, cab?.location].filter(Boolean).join(' '));
      return n.includes(filtroNorm);
    });
    if (!filtrados.length) {
      return {
        result: 'NO_MATCH',
        message: `No hay artículos en gabinetes que coincidan con "${filtro_gabinete}"`,
      };
    }
  }

  const categoriasSet = new Set();
  const porGabinete = new Map();

  for (const r of filtrados) {
    const cab = r.cabinets;
    const cobj = Array.isArray(cab) ? cab[0] : cab;
    const gid = r.cabinet_id;
    const gkey = gid || 'desconocido';
    const gNombre = cobj?.name || `Gabinete ${String(gid).slice(0, 8)}`;
    const gUbi = cobj?.location || null;

    let catNombre = null;
    const ce = r.categories;
    if (ce) {
      const c = Array.isArray(ce) ? ce[0] : ce;
      catNombre = c?.name || null;
    }
    if (!catNombre && r.category_id && catNameById[r.category_id]) {
      catNombre = catNameById[r.category_id];
    }
    if (!catNombre) catNombre = 'Sin categoría';

    categoriasSet.add(catNombre);

    if (!porGabinete.has(gkey)) {
      porGabinete.set(gkey, {
        gabinete_id: gid,
        gabinete_nombre: gNombre,
        ubicacion: gUbi,
        categorias: new Map(),
        total_items: 0,
      });
    }
    const entry = porGabinete.get(gkey);
    entry.total_items += 1;
    entry.categorias.set(catNombre, (entry.categorias.get(catNombre) || 0) + 1);
  }

  const resumen_por_gabinete = [...porGabinete.values()]
    .map((e) => ({
      gabinete_nombre: e.gabinete_nombre,
      ubicacion: e.ubicacion,
      total_items: e.total_items,
      categorias: [...e.categorias.entries()]
        .map(([nombre, cantidad_items]) => ({ nombre, cantidad_items }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }))
    .sort((a, b) => a.gabinete_nombre.localeCompare(b.gabinete_nombre, 'es'));

  const listaCats = [...categoriasSet].sort((a, b) => a.localeCompare(b, 'es'));
  const soloSinCategoria =
    listaCats.length === 1 && listaCats[0] === 'Sin categoría';

  const out = {
    categorias_distintas_en_gabinetes: listaCats,
    total_articulos_en_gabinetes: filtrados.length,
    resumen_por_gabinete,
  };
  if (soloSinCategoria) {
    out.aviso =
      'Ningún artículo en gabinetes tiene categoría asignada en la base (category_id vacío o tabla categories sin enlazar). Puedes decirle al usuario que rellene categorías en el inventario para ver un desglose útil.';
  }
  return out;
}

// ─── TOOL: Búsqueda Web (DuckDuckGo) ─────────────────────────────
async function searchWeb(query) {
  try {
    const results = await search(query, { safeSearch: search.SafeSearchType.STRICT });
    if (!results || !results.results || results.results.length === 0) {
      return { result: 'NO_RESULTS', message: `No encontré resultados en la web para "${query}".` };
    }
    // Devolvemos solo los 3 primeros resultados
    const top3 = results.results.slice(0, 3).map(r => ({
      title: r.title,
      summary: r.description,
      url: r.url
    }));
    return top3;
  } catch (err) {
    return { error: 'Ocurrió un error al buscar en internet: ' + err.message };
  }
}

// ─── TOOL: Acceso Total a Base de Datos ──────────────────────────
async function queryDatabaseAll(args) {
  try {
    const { table, select = '*', eq_column, eq_value, ilike_column, ilike_value, limit: limRaw } = args;
    if (!table) return { error: 'El nombre de la tabla es obligatorio' };

    const parsed =
      limRaw === undefined || limRaw === null || limRaw === ''
        ? 15
        : typeof limRaw === 'string'
          ? parseInt(limRaw.trim(), 10)
          : Number(limRaw);
    const limit = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 500) : 15;

    let query = supabase.from(table).select(select);
    
    if (eq_column && eq_value !== undefined) {
      query = query.eq(eq_column, String(eq_value));
    }
    
    if (ilike_column && ilike_value !== undefined) {
      query = query.ilike(ilike_column, `%${ilike_value}%`);
    }
    
    const { data, error } = await query.limit(limit);
    if (error) return { error: error.message };
    
    if (!data || data.length === 0) return { message: `Cero resultados en ${table}` };
    return data;
  } catch (err) {
    return { error: 'Excepción ejecutando query: ' + err.message };
  }
}

module.exports = {
  queryStock,
  queryEstado,
  queryPrestamo,
  queryActividadReciente,
  queryMantenimiento,
  queryCategoriasGabinetes,
  getEstadisticas,
  searchWeb,
  queryDatabaseAll,
  checkMaintenanceAlarms
};

// ─── TOOL: Sistema automático de alarma de mantenimiento ─────────
async function checkMaintenanceAlarms(daysThreshold = 2) {
  // Traer todos los planes con sus nombres de items e historial de fechas
  const { data: rawPlans, error } = await supabase
    .from('items_maintenance')
    .select('id, interval_days, item_id, created_at, inventory_items!inner(name), maintenance_history(date)');
    
  if (error || !rawPlans || rawPlans.length === 0) {
    return { alarms: [], message: 'No hay planes configurados.' };
  }
  
  // Como traemos inventory_items(name) como objeto, lo mapeamos a item_name 
  // y lo enriquecemos para sacar "ultimo_mantenimiento_fecha".
  const planesCrudos = rawPlans.map(p => ({
    ...p,
    item_name: p.inventory_items?.name || 'Desconocido'
  }));
  
  const queryResult = enrichMaintenanceRows(planesCrudos);
  
  const now = new Date();
  const alarms = [];
  
  for (const plan of queryResult) {
    if (!plan.interval_days) continue;
    
    const baseDateIso = plan.ultimo_mantenimiento_fecha || plan.created_at; 
    if (!baseDateIso) continue;
    
    const baseDate = new Date(baseDateIso);
    const maintenanceDate = new Date(baseDate.getTime() + plan.interval_days * 24 * 60 * 60 * 1000);
    
    const msRemaining = maintenanceDate.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
    
    if (daysRemaining <= daysThreshold) {
      // Formatear el sonido
      let textVoice = '';
      if (daysRemaining === 0) {
        textVoice = `El mantenimiento de ${plan.item_name} está vencido o vence hoy.`;
      } else if (daysRemaining === 1) {
        textVoice = `Falta 1 día para realizar mantenimiento a ${plan.item_name}.`;
      } else {
        textVoice = `Faltan ${daysRemaining} días para realizar mantenimiento a ${plan.item_name}.`;
      }

      alarms.push({
        item_id: plan.item_id,
        item_name: plan.item_name,
        days_remaining: daysRemaining,
        voice_message: textVoice,
        scheduled_date: maintenanceDate.toISOString(),
      });
    }
  }
  
  if (alarms.length === 0) {
    return { alarms: [] };
  }
  
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  
  // Consultar log de alarmas disparadas recientemente (últimas 24h)
  const { data: logsData, error: logErr } = await supabase
    .from('maintenance_alarm_logs')
    .select('item_id')
    .gte('created_at', twentyFourHoursAgo);
    
  if (logErr) {
    if (logErr.code === 'PGRST205' || logErr.code === '42P01') {
      console.warn('[Alarms] La tabla maintenance_alarm_logs no existe. Ignorando filtro de 24h hasta que se cree.');
    } else {
      console.error('[Alarms] Error consultando maintenance_alarm_logs:', logErr);
    }
  }
    
  const recentlyDispatchedItems = new Set();
  if (logsData) {
    for (const row of logsData) {
      if (row.item_id) {
        recentlyDispatchedItems.add(row.item_id);
      }
    }
  }
  
  const newAlarms = alarms.filter(a => !recentlyDispatchedItems.has(a.item_id));
  
  if (newAlarms.length === 0) {
    // Si hay alarmas pero ya se avisaron hoy, no hacemos nada ni asustamos con voz
    return { alarms: [] };
  }
  
  // Registrar las que SÍ son nuevas hoy en la base de datos
  const logsToInsert = newAlarms.map(a => ({
    item_id: a.item_id
  }));
  
  const { error: insertErr } = await supabase.from('maintenance_alarm_logs').insert(logsToInsert);
  if (insertErr) {
    console.error('[Alarms] Error registrando en maintenance_alarm_logs:', insertErr);
  }
  
  // Envío opcional de correos
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_APP_PASSWORD;
  
  if (emailUser && emailPass) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // TLS
      auth: { user: emailUser, pass: emailPass }
    });
    
    for (const alarm of newAlarms) {
      try {
        await transporter.sendMail({
          from: emailUser,
          to: emailUser, 
          subject: `🚨 Alerta OptimStock - Mantenimiento: ${alarm.item_name}`,
          text: `¡Atención!\n\n${alarm.voice_message}\n\nPor favor verifica en el sistema OptiStock.`,
        });
      } catch (mailErr) {
        console.error('[agent-tools] Error enviando correo:', mailErr.message);
      }
    }
  }
  
  // Devolvemos solo las nuevas alarmas para que la UI hable
  return { alarms: newAlarms };
}
