/**
 * app.js
 * Frontend del Chat de OptiStock Agent.
 * Maneja la interacción del usuario con el agente via API.
 */

(function () {
  'use strict';

  // ─── DOM Elements ───────────────────────────────────────────
  const chatArea = document.getElementById('chatArea');
  const chatInput = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');
  const btnClear = document.getElementById('btnClear');
  const welcomeCard = document.getElementById('welcomeCard');
  const typingIndicator = document.getElementById('typingIndicator');
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  const suggestions = document.getElementById('suggestions');

  // ─── State ──────────────────────────────────────────────────
  let sessionId = localStorage.getItem('optistock_session') || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let isProcessing = false;

  localStorage.setItem('optistock_session', sessionId);

  // ─── Auto-resize Textarea ─────────────────────────────────
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  // ─── Send on Enter (Shift+Enter for new line) ─────────────
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  btnSend.addEventListener('click', sendMessage);

  // ─── Suggestion Chips ─────────────────────────────────────
  suggestions.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const query = chip.dataset.query;
      chatInput.value = query;
      sendMessage();
    }
  });

  // ─── Clear Chat ───────────────────────────────────────────
  btnClear.addEventListener('click', async () => {
    // Generar nueva sesión
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('optistock_session', sessionId);

    // Limpiar mensajes del DOM
    const messages = chatArea.querySelectorAll('.message');
    messages.forEach(msg => msg.remove());

    // Mostrar welcome card de nuevo
    welcomeCard.style.display = '';
    welcomeCard.style.animation = 'fadeInUp 0.5s ease';
  });

  // ─── Send Message ─────────────────────────────────────────
  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isProcessing) return;

    isProcessing = true;
    btnSend.disabled = true;

    // Ocultar welcome card
    if (welcomeCard) {
      welcomeCard.style.display = 'none';
    }

    // Agregar mensaje del usuario al chat
    appendMessage('user', text);

    // Limpiar input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Mostrar indicador de escritura
    showTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId
        })
      });

      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (parseErr) {
        showTyping(false);
        const hint =
          response.status === 504 || response.status === 502
            ? ' (a veces pasa en Vercel si la función supera el tiempo máximo de ejecución).'
            : '';
        appendMessage(
          'bot',
          `⚠️ El servidor respondió pero no es JSON válido (HTTP ${response.status})${hint}. Revisa logs del deploy o prueba de nuevo.`
        );
        console.error('Chat parse error:', parseErr, raw.slice(0, 400));
        return;
      }

      showTyping(false);

      if (response.ok && data.reply) {
        appendMessage('bot', data.reply);
        if (data.sessionId) {
          sessionId = data.sessionId;
          localStorage.setItem('optistock_session', sessionId);
        }
      } else {
        const detail = data.details ? ` ${data.details}` : '';
        appendMessage(
          'bot',
          '⚠️ ' + (data.error || 'Error al procesar tu mensaje.') + detail
        );
      }
    } catch (err) {
      showTyping(false);
      const isAbort = err && err.name === 'AbortError';
      appendMessage(
        'bot',
        isAbort
          ? '❌ La petición tardó demasiado y se canceló. En Vercel el límite de tiempo del servidor puede cortar respuestas largas del agente.'
          : '❌ No hubo respuesta del servidor (red, CORS o el servidor caído). Si usas Vercel, revisa que el deploy esté bien y la URL sea la correcta.'
      );
      console.error('Chat error:', err);
    }

    isProcessing = false;
    btnSend.disabled = false;
    chatInput.focus();
  }

  // ─── Append Message to Chat ───────────────────────────────
  function appendMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = formatMarkdown(content);

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.appendChild(bubble);
    bubbleWrapper.appendChild(time);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(bubbleWrapper);

    // Insertar antes del typing indicator
    chatArea.insertBefore(messageDiv, typingIndicator);

    scrollToBottom();
  }

  // ─── Simple Markdown Formatter ────────────────────────────
  function formatMarkdown(text) {
    if (!text) return '';

    let html = text
      // Escalar HTML básico
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headings (importante antes de otras reglas)
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      // Negrita
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Cursiva
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Código
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // Listas con viñetas
      .replace(/^[-*•]\s+(.*)$/gm, '<li>$1</li>')
      // Listas numeradas
      .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
      // Saltos de línea dobles → párrafos
      .split(/\n\n+/).map(p => {
        if (p.includes('<li>')) return `<ul>${p}</ul>`;
        return `<p>${p.replace(/\n/g, '<br>')}</p>`;
      }).join('');

    return html;
  }

  // ─── Typing Indicator ────────────────────────────────────
  function showTyping(visible) {
    if (visible) {
      typingIndicator.classList.add('visible');
      statusText.textContent = 'Escribiendo...';
      statusDot.style.background = 'var(--accent-orange)';
    } else {
      typingIndicator.classList.remove('visible');
      statusText.textContent = 'En línea';
      statusDot.style.background = 'var(--accent-green)';
    }
    scrollToBottom();
  }

  // ─── Scroll to Bottom ────────────────────────────────────
  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  // ─── Initial Focus ───────────────────────────────────────
  chatInput.focus();

  // ─── Maintenance Alarms Checking ─────────────────────────

  // Fix del bug de Chrome: speechSynthesis se pausa solo si la pestaña pierde foco.
  // Este keepalive lo despierta cada 10 segundos para mantenerlo activo.
  setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);

  function speakMessage(text) {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel(); // Cancelar cualquier cosa que esté en cola
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.95;
      utterance.volume = 1.0;
      utterance.pitch = 1.0;

      // Intentar obtener una voz en español explícitamente
      const voices = window.speechSynthesis.getVoices();
      const spanishVoice = voices.find(v => v.lang.startsWith('es'));
      if (spanishVoice) utterance.voice = spanishVoice;

      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  async function checkMaintenanceAlarms() {
    try {
      const resp = await fetch('/api/maintenance/alarms');
      if (resp.ok) {
        const data = await resp.json();
        if (data.alarms && data.alarms.length > 0) {
          // Mostrar mensaje visual en el chat
          appendMessage('bot', `🚨 **Alerta Automática de Mantenimiento** 🚨\n\n${data.alarms.map(a => `- ${a.voice_message}`).join('\n')}`);

          // Reproducir alarmas en secuencia
          for (const alarm of data.alarms) {
            if (alarm.voice_message) {
              await speakMessage(alarm.voice_message);
              await new Promise(r => setTimeout(r, 600)); // pausa entre alarmas
            }
          }
        }
      }
    } catch (err) {
      console.error('Error al chequear alarmas de mantenimiento:', err);
    }
  }

  // Boton de prueba de voz (solo para verificar que el navegador soporte TTS)
  const testVoiceBtn = document.createElement('button');
  testVoiceBtn.id = 'testVoiceBtn';
  testVoiceBtn.title = 'Probar alarma de voz';
  testVoiceBtn.innerHTML = '🔔';
  testVoiceBtn.style.cssText = `
    position: fixed; bottom: 100px; right: 24px; z-index: 9999;
    width: 44px; height: 44px; border-radius: 50%; border: none;
    background: #e74c3c; color: white; font-size: 20px;
    cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s;
  `;
  testVoiceBtn.addEventListener('mouseenter', () => testVoiceBtn.style.transform = 'scale(1.1)');
  testVoiceBtn.addEventListener('mouseleave', () => testVoiceBtn.style.transform = 'scale(1)');
  testVoiceBtn.addEventListener('click', () => speakMessage('Falta 1 día para realizar mantenimiento a la cortadora láser.'));
  document.body.appendChild(testVoiceBtn);

  // Las voces de algunos navegadores cargan de forma asíncrona.
  // Esperamos a que estén disponibles antes de arrancar.
  let alarmsChecked = false;
  function startAlarmCheck() {
    if (!alarmsChecked) {
      alarmsChecked = true;
      checkMaintenanceAlarms();
      setInterval(checkMaintenanceAlarms, 60 * 60 * 1000);
    }
  }

  // Lanzar alarma al primer click del usuario (requisito de Chrome para permitir audio)
  document.addEventListener('click', startAlarmCheck, { once: true });

})();
