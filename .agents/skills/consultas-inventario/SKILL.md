---
name: consultas-inventario
description: Colección de herramientas seguras para consultar, contar y revisar historiales y mantenimientos de inventario físico.
---

# Consultas de Inventario para OptiStock

Esta habilidad encapsula las Tools principales de verificación a la Base de Datos Supabase.
Las interacciones a base de datos deben realizarse delegándose a los scripts definidos aquí.

## Uso del Script de Tools

Tienes acceso a un script Node.js configurado en `scripts/tools.js`.
Por seguridad, el script lee `SUPABASE_URL` y `SUPABASE_KEY` de las variables de entorno para ejecutarse.

Para utilizarlo en bash, se debe llamar pasándole como argumentos: `accion` y un flag `--keyword`.

Ejemplo para **Stock**:
```bash
node .agents/skills/consultas-inventario/scripts/tools.js stock --keyword "multímetro"
```
Ejemplo para ver **Préstamos (Borrowers)**:
```bash
node .agents/skills/consultas-inventario/scripts/tools.js prestamo --keyword "cautin"
```
Ejemplo para **Reglas de Mantenimiento**:
```bash
node .agents/skills/consultas-inventario/scripts/tools.js mantenimiento --keyword "osciloscopio"
```

> **Nota:** Si necesitas generar reportes macro o **estadísticas avanzadas** (Más Usados, etc.), DEBES utilizar la habilidad `estadisticas-inventario`.

## Prácticas Base para tu Resolución LLM:
1. Ejecuta el comando necesario.
2. Lee la salida por terminal estándar (stdout), que SIEMPRE regresará en un formato textual JSON si tiene éxito.
3. Analiza el JSON antes de componer cualquier respuesta al usuario.
4. Redacta en el idioma del usuario, confirmando datos reales.
