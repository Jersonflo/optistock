/**
 * Pruebas manuales de las herramientas del agente (sin llamar al LLM).
 * Requiere .env con Supabase. Uso: npm run test:agent
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const tools = require('../agent-tools');

function title(t) {
  console.log('\n========', t, '========');
}

async function safe(label, fn) {
  try {
    const out = await fn();
    console.log(JSON.stringify(out, null, 2).slice(0, 3500));
    if (JSON.stringify(out).length > 3500) console.log('… (truncado en consola)');
  } catch (e) {
    console.error(`[${label}] ERROR:`, e.message);
  }
}

async function main() {
  if (!process.env.SUPABASE_URL) {
    console.error('Falta SUPABASE_URL en .env');
    process.exit(1);
  }

  title('Actividad reciente global (últimos 8)');
  await safe('actividad', () => tools.queryActividadReciente({ limit: 8, action_filter: 'all' }));

  title('Solo últimos retiros (withdrawn)');
  await safe('retiros', () => tools.queryActividadReciente({ limit: 5, action_filter: 'withdrawn' }));

  title('Estadísticas globales (sin keyword) — mira pendientes_devolucion');
  await safe('stats', () => tools.getEstadisticas(''));

  title('Mantenimiento (sin keyword = todos los planes)');
  await safe('maint-all', () => tools.queryMantenimiento(''));

  title('Categorías en gabinetes');
  await safe('categorias', () => tools.queryCategoriasGabinetes({}));

  title('Stock keyword corto');
  await safe('stock', () => tools.queryStock('arduino'));

  title('Préstamo por artículo (ajusta el keyword a tu inventario)');
  await safe('prestamo', () => tools.queryPrestamo('arduino'));
}

main();
