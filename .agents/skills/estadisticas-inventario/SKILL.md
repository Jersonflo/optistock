---
name: estadisticas-inventario
description: Extrae métricas avanzadas, KPIs, y analíticas complejas del inventario directamente desde la base de datos Supabase evaluando el ciclo de vida de los artículos.
---

# Estadísticas de Inventario para OptiStock

Este skill otorga al Agente métricas precisas sobre cómo se está utilizando el inventario. Dado que el catálogo maneja más de 100 artículos e historias de uso, este script hace cruce de datos interno (agrupaciones y conteos) sin depender de funciones RPC en Supabase, sino operando a nivel de aplicación Node.

## Uso del Script de Estadísticas

Tienes acceso al script central de analítica en `scripts/stats.js`.
Para ejecutarse e imprimir el reporte en formato JSON, no se requieren parámetros adicionales.
Depende enteramente de los roles en `.env` (preferiblemente `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_KEY` con permisos amplios).

**Comando de Ejecución:**
```bash
node .agents/skills/estadisticas-inventario/scripts/stats.js
```

## Estructura de la Respuesta JSON

Si el script se ejecuta correctamente, stdout mostrará un JSON con la siguiente estructura:

- `total_items_catalog` (Número entero con la totalidad de existencias)
- `never_used_count` (Cantidad de artículos que jamás se han retirado)
- `topItems` (Arreglo con subarreglos de `[NombreArticulo, CantidadUso]`)
- `topUsers` (Arreglo ordenado con los usuarios con mayor interacción `[Usuario, CantidadUso]`)
- `some_never_used` (Muestra array de strings con nombres de ítems sin uso)
- `currentlyWithdrawn` (Lista de ítems que actualmente siguen extraídos del gabinete y no han reingresado)

## Reglas de Comportamiento LLM

1. Identifica cuándo el usuario requiere resúmenes generales de inventario, analíticas o cruces de data y utiliza **este** skill, a diferencia del skill de `consultas-inventario` (que está orientado a búsquedas por palabra clave).
2. Procesa la salida JSON y constrúyela en el propio formato amigable para el humano; haz énfasis si hay valores anómalos o artículos pendientes de entrega (nodos de "currentlyWithdrawn").
