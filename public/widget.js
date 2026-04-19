(function() {
  // Determinar automáticamente la URL de donde se sirve este script (para cargar el iframe correctamente)
  let scriptUrl = 'https://streamlit-delta.vercel.app/widget.js';
  if (document.currentScript && document.currentScript.src) {
    scriptUrl = document.currentScript.src;
  }
  const CHAT_URL = new URL('/', scriptUrl).href;

  // Icono por defecto (si queremos usar una imagen, podría ser un tag <img>)
  const WIDGET_ICON = '🤖'; 

  // Inyectar CSS
  const styles = `
    .optistock-widget-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3dbbd4 0%, #a48fc2 100%);
      color: white;
      text-align: center;
      line-height: 60px;
      font-size: 28px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(61, 187, 212, 0.4);
      z-index: 999999;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      font-family: Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .optistock-widget-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(61, 187, 212, 0.6);
    }
    .optistock-widget-container {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 400px;
      height: 600px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 110px);
      background: #0a0e1a;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      z-index: 999998;
      overflow: hidden;
      display: none;
      border: 1px solid rgba(61, 187, 212, 0.3);
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .optistock-widget-container.open {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }
    .optistock-widget-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
    
    @media (max-width: 480px) {
      .optistock-widget-container {
        width: calc(100vw - 40px);
        height: calc(100vh - 110px);
      }
    }
  `;

  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  // Crear el botón
  const btn = document.createElement('div');
  btn.className = 'optistock-widget-btn';
  btn.innerHTML = WIDGET_ICON;
  document.body.appendChild(btn);

  // Crear el contenedor del Iframe
  const container = document.createElement('div');
  container.className = 'optistock-widget-container';
  container.innerHTML = `<iframe class="optistock-widget-iframe" src="${CHAT_URL}"></iframe>`;
  document.body.appendChild(container);

  // Lógica de toggle
  let isOpen = false;
  btn.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      container.style.display = 'block';
      // Animación suave
      setTimeout(() => {
        container.classList.add('open');
      }, 10);
      btn.innerHTML = '✖';
      btn.style.fontSize = '24px';
    } else {
      container.classList.remove('open');
      setTimeout(() => {
         container.style.display = 'none';
      }, 300); // Esperar que termine la transición
      btn.innerHTML = WIDGET_ICON;
      btn.style.fontSize = '28px';
    }
  });

})();
