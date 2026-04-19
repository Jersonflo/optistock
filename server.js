/**
 * server.js
 * Servidor Express para el Agente OptiStock.
 * Sirve la interfaz de chat y gestiona la API de conversación.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { chat } = require('./ai-client');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Almacenamiento de sesiones en memoria ──────────────────────
// En producción se usaría Redis o similar
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { history: [], createdAt: Date.now() });
  }
  return sessions.get(sessionId);
}

// Limpiar sesiones viejas cada 30 minutos
setInterval(() => {
  const now = Date.now();
  const MAX_AGE = 2 * 60 * 60 * 1000; // 2 horas
  for (const [id, session] of sessions) {
    if (now - session.createdAt > MAX_AGE) {
      sessions.delete(id);
    }
  }
}, 30 * 60 * 1000);

// ─── Rutas API ──────────────────────────────────────────────────

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'OptiStock Bot',
    uptime: process.uptime(),
    model: process.env.AI_MODEL
  });
});

// Endpoint principal de Chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Se requiere un mensaje válido' });
    }

    const sid = sessionId || `sess_${Date.now()}`;
    const session = getSession(sid);

    // Agregar mensaje del usuario al historial
    session.history.push({ role: 'user', content: message });

    // Limitar historial a los últimos 20 mensajes para no exceder tokens
    const recentHistory = session.history.slice(-20);

    console.log(`[Chat] Session ${sid} | Mensaje: "${message.substring(0, 50)}..."`);
    const startTime = Date.now();

    // Llamar al cliente AI
    const reply = await chat(recentHistory);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Chat] Respuesta en ${duration}s para ${sid}`);

    // Agregar respuesta al historial
    session.history.push({ role: 'assistant', content: reply });

    res.json({
      reply,
      sessionId: sid,
      stats: { duration }
    });

  } catch (err) {
    console.error('[Chat] Error:', err.message);
    res.status(500).json({
      error: 'Error interno del agente',
      details: err.message
    });
  }
});

// Limpiar historial de sesión
app.delete('/api/chat/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ status: 'session_cleared' });
});

// Ver historial de la conversación (misma sesión que en localStorage del chat).
// En Vercel serverless la memoria no se comparte entre invocaciones: suele devolver 404 salvo que acertes la misma instancia.
app.get('/api/chat/session/:sessionId', (req, res) => {
  const s = sessions.get(req.params.sessionId);
  if (!s) {
    return res.status(404).json({
      error: 'session_not_found',
      hint: 'La sesión expiró, el servidor se reinició, o en Vercel cada request puede ir a otra instancia. Para historial persistente guarda mensajes en Supabase.',
    });
  }
  res.json({
    sessionId: req.params.sessionId,
    messages: s.history,
    messageCount: s.history.length,
  });
});

// Endpoint para revisar alarmas de mantenimiento periodicamente
app.get('/api/maintenance/alarms', async (req, res) => {
  try {
    const { checkMaintenanceAlarms } = require('./agent-tools');
    const { alarms, message } = await checkMaintenanceAlarms(2);
    res.json({ status: 'ok', alarms, message });
  } catch (err) {
    console.error('[Alarms] Error chequeando mantenimientos:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Catch-all: servir el frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Iniciar Servidor ───────────────────────────────────────────
// En Vercel no necesitamos app.listen, exportamos el app directamente.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════╗');
    console.log('  ║                                           ║');
    console.log('  ║   🤖 OptiStock Agent - Servidor Activo    ║');
    console.log('  ║                                           ║');
    console.log(`  ║   🌐 http://localhost:${PORT}                ║`);
    console.log(`  ║   🧠 Modelo: ${(process.env.AI_MODEL || 'N/A').substring(0, 28).padEnd(28)}║`);
    console.log('  ║                                           ║');
    console.log('  ╚═══════════════════════════════════════════╝');
    console.log('');
  });
}

module.exports = app;
