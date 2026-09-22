(function () {
  const screenStart = document.getElementById('screen-start');
  const screenQr = document.getElementById('screen-qr');
  const btnStart = document.getElementById('btn-start');
  const btnCancel = document.getElementById('btn-cancel');
  const sessionCodeEl = document.getElementById('session-code');
  const qrCanvas = document.getElementById('qr-canvas');

  // Gera um código de sessão curto (ex: 8F4K2).
  // Placeholder até existir backend real criando sessões.
  function generateSessionCode(length = 5) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0/I/1 (evita confusão visual)
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function goTo(screenToShow, screenToHide) {
    screenToHide.classList.remove('is-active');
    screenToShow.classList.add('is-active');
  }

  function startSession() {
    const code = generateSessionCode();
    sessionCodeEl.textContent = code;

    // Troca de tela primeiro — assim, mesmo se a geração do QR falhar
    // por algum motivo, o técnico vê a tela 2 e o erro fica visível,
    // em vez do clique "não fazer nada".
    goTo(screenQr, screenStart);

    // Calcula a URL relativa à página atual, em vez de montar a partir
    // da raiz do domínio. Isso funciona tanto em hospedagem na raiz
    // quanto em "project pages" do GitHub (usuario.github.io/repo/),
    // onde o nome do repositório entra no meio do caminho.
    const sessionUrl = new URL(`../touch.html?session=${code}`, window.location.href).href;

    if (typeof QRCode === 'undefined') {
      console.error('Lib QRCode não carregou — confira se vendor.qrcode.js está na mesma pasta do index.html.');
      qrCanvas.replaceWith(errorMessage('Não foi possível carregar o gerador de QR code.'));
      return;
    }

    QRCode.toCanvas(qrCanvas, sessionUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#0B0B0C', light: '#FAFAF8' }
    }, function (err) {
      if (err) {
        console.error('Erro ao gerar QR code:', err);
        qrCanvas.replaceWith(errorMessage('Erro ao gerar o QR code. Veja o console (F12).'));
      }
    });
  }

  function errorMessage(text) {
    const p = document.createElement('p');
    p.textContent = text;
    p.style.color = '#E85D1A';
    p.style.fontSize = '14px';
    p.style.maxWidth = '240px';
    return p;
  }

  function cancelSession() {
    goTo(screenStart, screenQr);
  }

  btnStart.addEventListener('click', startSession);
  btnCancel.addEventListener('click', cancelSession);
})();
