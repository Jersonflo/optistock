require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { createClient } = require('@supabase/supabase-js');

// Variables de entorno de Supabase requeridas
// SUPABASE_URL, SUPABASE_KEY (Deberían estar cargadas en la Shell donde el Agente opera)
const supabaseUrl = process.env.SUPABASE_URL || "https://vpusmprxvxmipgijitki.supabase.co"; // URL quemada temporal solo para el ejemplo del snippet del usuario, REEMPLAZAR.
const supabaseKey = process.env.SUPABASE_KEY || "YOUR_SUPABASE_ANON_KEY"; 

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const args = process.argv.slice(2);
    const action = args[0];
    
    // Buscar param keyword si existe: --keyword "valor"
    let keyword = "";
    const keywordIndex = args.indexOf("--keyword");
    if (keywordIndex !== -1 && args[keywordIndex + 1]) {
        keyword = args[keywordIndex + 1];
    }

    try {
        if (action === 'estado') {
            const { data, error } = await supabase.rpc('rpc_search_item_details', { search_term: keyword });
            if (error) throw error;
            console.log(JSON.stringify(data && data.length ? data : { result: "NOT_FOUND" }));

        } else if (action === 'stock') {
            const { data, error } = await supabase
                .from('inventory_items_rows')
                .select('id, name, quantity, cabinet_id')
                .ilike('name', `%${keyword}%`);
            
            if (error) throw error;
            console.log(JSON.stringify(data.length ? data : { result: "NOT_FOUND" }));

        } else if (action === 'prestamo') {
            // Se usa la función RPC o query con joins para traer las sesiones activas ('withdrawn')
            // Simularemos un SQL complejo llamando a la RPC creada en diseño architecture
            const { data, error } = await supabase.rpc('rpc_get_current_borrower', { search_term: keyword });
            if (error) throw error;
            console.log(JSON.stringify(data.length ? data : { result: "NO_ACTIVE_LOANS_OR_NOT_FOUND" }));

        } else if (action === 'mantenimiento') {
            // Ejemplo para mantenimiento, incluyendo historial
            const { data, error } = await supabase
                .from('maintenance_rows')
                .select('id, interval_days, item_id, inventory_items_rows!inner(name), maintenance_history_rows(fecha)')
                .ilike('inventory_items_rows.name', `%${keyword}%`)
                // Nota: Esto trae todo el historial anidado. En base de datos grandes es mejor limitar.
            if (error) throw error;
            console.log(JSON.stringify(data.length ? data : { result: "NO_MAINTENANCE_PLAN" }));

        } else if (action === 'top_items') {
            console.log(JSON.stringify({ error: "ACTION_DEPRECATED_USE_ESTADISTICAS_INVENTARIO_SKILL" }));

        } else {
            console.log(JSON.stringify({ error: "ACTION_NOT_SUPPORTED" }));
        }
    } catch (err) {
        console.log(JSON.stringify({ error: err.message }));
    }
}

main();
