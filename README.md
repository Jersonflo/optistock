# OptiStock · OptiBot 📦🤖

Agente de IA para la gestión de inventario, préstamos y mantenimientos de equipos técnicos del Centro de Prototipado (Aula STEM FabLab, Universidad Nacional de Colombia).

OptiBot migra un chatbot basado en flujos de **Node-RED** hacia una arquitectura de **agentes inteligentes** con *Function Calling*: el modelo interpreta la pregunta del usuario y consulta la base de datos en tiempo real, sin respuestas inventadas.

## Características

- 💬 **Consultas en lenguaje natural:** dónde está un equipo, quién lo tiene y en qué estado se encuentra.
- 🛠️ **Mantenimientos:** próxima fecha de mantenimiento de cada equipo.
- 📈 **Estadísticas de uso:** qué equipos se prestan más.
- 🧠 **Function Calling** contra Supabase / PostgreSQL con datos en tiempo real.
- 🚫 **Anti-alucinaciones:** si no hay registros, el agente lo dice en vez de inventar.
- 🔁 **Proveedores de LLM con respaldo** (Groq y OpenRouter).
- 🌐 **Interfaz web** con identidad visual propia y widget embebible.
- ☁️ **Despliegue serverless** en Vercel.

## Stack

Node.js · Express · Supabase (PostgreSQL) · Groq / OpenRouter (LLMs) · Vercel · HTML/CSS/JS

## Estructura

```
optistock/
├── server.js          # Servidor Express y API de conversación
├── ai-client.js       # Cliente LLM con Function Calling y respaldo
├── agent-tools.js     # Herramientas que el agente puede invocar
├── api/index.js       # Entrada serverless para Vercel
├── public/            # Interfaz de chat y widget
├── scripts/           # Pruebas de escenarios del agente
└── vercel.json
```

## Instalación

```bash
git clone https://github.com/Jersonflo/optistock.git
cd optistock
npm install
```

Crea un archivo `.env` en la raíz (no se sube al repositorio):

```env
SUPABASE_URL=...
SUPABASE_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

```bash
npm run dev          # desarrollo
npm start            # producción
npm run test:agent   # escenarios de prueba del agente
```

## Autor

**Jerson Estiven Giraldo Florez** · [LinkedIn](https://linkedin.com/in/jerson-estiven-giraldo-florez-96a3031b0)
