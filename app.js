(function () {
  const screenStart = document.getElementById('screen-start');
  const screenQr = document.getElementById('screen-qr');
  const screenResult = document.getElementById('screen-result');
  const btnStart = document.getElementById('btn-start');
  const btnCancel = document.getElementById('btn-cancel');
  const btnNew = document.getElementById('btn-new');
  const sessionCodeEl = document.getElementById('session-code');
  const qrCanvas = document.getElementById('qr-canvas');
  const resultSessionEl = document.getElementById('result-session');
  const resultListEl = document.getElementById('result-list');

  // Lista de testes conhecida pelo sistema — usada só pra montar a
  // tela de resultado com nome bonito e pra apontar o que não foi
  // testado (o celular só envia o que ele realmente sabe).
  const TESTS = [
    { id: 'touch', label: 'Touchscreen' },
    { id: 'charge-port', label: 'Conector de carga' },
    { id: 'charging', label: 'Carregamento' },
    { id: 'speaker', label: 'Alto-falante' },
    { id: 'earpiece', label: 'Auricular' },
    { id: 'mic', label: 'Microfone' },
    { id: 'cam-back', label: 'Câmera traseira' },
    { id: 'cam-front', label: 'Câmera frontal' },
    { id: 'wifi', label: 'Wi-Fi' },
    { id: 'mobile-net', label: 'Rede móvel' },
    { id: 'bluetooth', label: 'Bluetooth' },
    { id: 'biometry', label: 'Biometria / Face ID' },
  ];

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

  function goTo(screenToShow, ...screensToHide) {
    screensToHide.forEach(s => s.classList.remove('is-active'));
    screenToShow.classList.add('is-active');
  }

  // --- Comunicação em tempo real com o celular via MQTT público ---
  // Não existe backend nesse projeto ainda, então usamos um broker
  // público (gratuito, sem cadastro) só como "correio" de mensagens:
  // o celular publica o resultado final numa sala com o código da
  // sessão, e o PC — que já está escutando essa sala — recebe na
  // hora e troca de tela sozinho.
  let mqttClient = null;
  let currentTopic = null;

  function ensureMqttClient() {
    if (mqttClient) return mqttClient;
    if (typeof mqtt === 'undefined') {
      console.error('Lib mqtt não carregou — confira se vendor.mqtt.js está na mesma pasta do index.html.');
      return null;
    }
    mqttClient = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      clientId: 'aio-painel-' + Math.random().toString(16).slice(2)
    });
    mqttClient.on('message', (topic, payload) => {
      if (topic !== currentTopic) return;
      try {
        const results = JSON.parse(payload.toString());
        showResult(results);
      } catch (e) {
        console.error('Payload inválido recebido via mqtt:', e);
      }
    });
    return mqttClient;
  }

  function listenForSession(code) {
    const client = ensureMqttClient();
    if (!client) return;

    const topic = 'aio-diag/' + code + '/final';

    function subscribe() {
      if (currentTopic) client.unsubscribe(currentTopic);
      currentTopic = topic;
      client.subscribe(topic);
    }

    if (client.connected) subscribe();
    else client.once('connect', subscribe);
  }

  function stopListening() {
    if (mqttClient && currentTopic) {
      mqttClient.unsubscribe(currentTopic);
      currentTopic = null;
    }
  }

  function showResult(results) {
    resultSessionEl.textContent = sessionCodeEl.textContent;
    resultListEl.innerHTML = '';

    TESTS.forEach(test => {
      const status = results[test.id]; // 'ok' | 'fail' | undefined
      const cls = status === 'ok' ? 'ok' : status === 'fail' ? 'fail' : 'missing';
      const tagText = status === 'ok' ? 'OK' : status === 'fail' ? 'Verificar' : 'Não testado';

      const row = document.createElement('div');
      row.className = 'result-row ' + cls;
      row.innerHTML = `<span>${test.label}</span><span class="tag">${tagText}</span>`;
      resultListEl.appendChild(row);
    });

    goTo(screenResult, screenStart, screenQr);
  }

  function startSession() {
    const code = generateSessionCode();
    sessionCodeEl.textContent = code;

    // Troca de tela primeiro — assim, mesmo se a geração do QR falhar
    // por algum motivo, o técnico vê a tela 2 e o erro fica visível,
    // em vez do clique "não fazer nada".
    goTo(screenQr, screenStart, screenResult);

    // Calcula a URL relativa à página atual. Agora aponta pro menu de
    // seleção de testes — de lá o técnico escolhe qual teste rodar.
    const sessionUrl = new URL(`menu.html?session=${code}`, window.location.href).href;

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

    listenForSession(code);
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
    stopListening();
    goTo(screenStart, screenQr, screenResult);
  }

  btnStart.addEventListener('click', startSession);
  btnCancel.addEventListener('click', cancelSession);
  btnNew.addEventListener('click', cancelSession);
})();
