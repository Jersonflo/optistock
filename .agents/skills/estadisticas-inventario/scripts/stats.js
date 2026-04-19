require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { createClient } = require('@supabase/supabase-js');

// Utilizamos KEY genérica que tenga permisos para recuperar toda la matriz de rows (Ideal SERVICE_ROLE o politicas RLS flexibles)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if(!supabaseUrl || !supabaseKey) {
  console.log(JSON.stringify({ error: "No se encontraron credenciales de Supabase en .env" }));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function computeStats() {
  try {
    const [
      { data: items, error: errItems },
      { data: sessionItems, error: errSession },
      { data: sessions, error: errSess },
      { data: profiles, error: errProf }
    ] = await Promise.all([
      supabase.from('inventory_items_rows').select('id, name, quantity'),
      supabase.from('session_items_rows').select('item_id, session_id, action, quantity'),
      supabase.from('cabinet_sessions_rows').select('id, user_id'),
      supabase.from('profiles_rows').select('id, full_name')
    ]);

    if (errItems || errSession || errSess || errProf) {
      console.log(JSON.stringify({ 
        error: "Error extrayendo datos de tablas. Asegure que la API key tiene permisos suficientes.",
        details: errItems || errSession || errSess || errProf
      }));
      process.exit(1);
    }

    // Hash Maps
    const profileMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));
    const itemMap = Object.fromEntries(items.map(i => [i.id, i.name]));
    const sessionUserMap = Object.fromEntries(sessions.map(s => [s.id, s.user_id]));

    // Agregators
    let itemUsageCount = {};
    let userActivityCount = {};
    let itemCurrentState = {};
    let usedItemIds = new Set((sessionItems || []).map(si => si.item_id));

    for (let si of (sessionItems || [])) {
      const itemName = itemMap[si.item_id] || 'Unknown Item';
      const userId = sessionUserMap[si.session_id];
      const user = profileMap[userId] || 'Unknown User';

      // Conteos de uso global de la plataforma
      itemUsageCount[itemName] = (itemUsageCount[itemName] || 0) + 1;
      userActivityCount[user] = (userActivityCount[user] || 0) + 1;

      // Tracking de retiros - devoluciones para inventario activo actual
      if (!itemCurrentState[itemName]) itemCurrentState[itemName] = 0;
      if (si.action === 'withdrawn') itemCurrentState[itemName] += si.quantity;
      if (si.action === 'returned') itemCurrentState[itemName] -= si.quantity;
    }

    // Results formatting
    const topItems = Object.entries(itemUsageCount).sort((a,b) => b[1] - a[1]).slice(0, 10);
    const topUsers = Object.entries(userActivityCount).sort((a,b) => b[1] - a[1]).slice(0, 10);
    const neverUsed = items.filter(i => !usedItemIds.has(i.id)).map(i => i.name).sort();
    
    // items with net > 0 indicating pending to return in cabinets
    const currentlyWithdrawn = Object.entries(itemCurrentState)
      .filter(e => e[1] > 0)
      .sort((a,b) => b[1] - a[1]);

    const report = {
      total_items_catalog: items.length,
      never_used_count: neverUsed.length,
      topItems,
      topUsers,
      some_never_used: neverUsed.slice(0, 15),
      currentlyWithdrawn
    };

    console.log(JSON.stringify(report));
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
  }
}

computeStats();
