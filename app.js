(function () {
  const screenStart = document.getElementById('screen-start');
  const screenQr = document.getElementById('screen-qr');
  const screenResult = document.getElementById('screen-result');

  const osFormWrap = document.getElementById('os-form-wrap');
  const osReadyWrap = document.getElementById('os-ready-wrap');
  const osForm = document.getElementById('os-form');
  const osReadyName = document.getElementById('os-ready-name');
  const osReadySub = document.getElementById('os-ready-sub');

  const btnStart = document.getElementById('btn-start');
  const btnCancel = document.getElementById('btn-cancel');
  const btnFinish = document.getElementById('btn-finish');
  const sessionCodeEl = document.getElementById('session-code');
  const qrCanvas = document.getElementById('qr-canvas');
  const resultClientEl = document.getElementById('result-client');
  const resultListEl = document.getElementById('result-list');

  // Lista de testes conhecida pelo sistema — usada pra montar a tela
  // de resultado e o docx com nome bonito, e pra apontar o que não
  // foi testado (o celular só envia o que ele realmente sabe).
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

  // Estado da OS atual e do último resultado recebido — vivem só na
  // memória desta aba enquanto não existe backend/banco de dados.
  let currentOS = null;
  let lastResults = {};

  function generateSessionCode(length = 5) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0/I/1 (evita confusão visual)
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // Número de OS simples, sem contador sequencial de verdade (não
  // existe banco de dados ainda pra manter uma numeração contínua).
  // Serve pra identificar essa OS de forma única no arquivo gerado.
  function generateOsNumber() {
    return 'OS-' + Date.now().toString().slice(-6);
  }

  function goTo(screenToShow, ...screensToHide) {
    screensToHide.forEach(s => s.classList.remove('is-active'));
    screenToShow.classList.add('is-active');
  }

  // --- Comunicação em tempo real com o celular via MQTT público ---
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
    lastResults = results;
    resultClientEl.textContent = currentOS ? currentOS.cliente : sessionCodeEl.textContent;
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

  // --- Formulário de nova OS ---
  function submitOsForm(e) {
    e.preventDefault();

    currentOS = {
      numero: generateOsNumber(),
      data: new Date().toLocaleDateString('pt-BR'),
      cliente: document.getElementById('os-cliente').value.trim(),
      telefone: document.getElementById('os-telefone').value.trim(),
      aparelho: document.getElementById('os-aparelho').value.trim(),
      defeito: document.getElementById('os-defeito').value.trim(),
      acessorios: document.getElementById('os-acessorios').value.trim(),
    };

    osReadyName.textContent = currentOS.cliente;
    osReadySub.textContent = currentOS.numero + ' · ' + currentOS.data + (currentOS.aparelho ? ' · ' + currentOS.aparelho : '');

    osFormWrap.style.display = 'none';
    osReadyWrap.style.display = 'block';
  }

  function resetToNewOs() {
    stopListening();
    currentOS = null;
    lastResults = {};
    osForm.reset();
    osReadyWrap.style.display = 'none';
    osFormWrap.style.display = 'block';
    goTo(screenStart, screenQr, screenResult);
  }

  function startSession() {
    const code = generateSessionCode();
    sessionCodeEl.textContent = code;

    goTo(screenQr, screenStart, screenResult);

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

  // --- Geração do arquivo .docx com a OS + resultado do diagnóstico ---
  function statusLabel(status) {
    if (status === 'ok') return 'OK';
    if (status === 'fail') return 'Verificar';
    return 'Não testado';
  }

  function sanitizeFilename(text) {
    return text.replace(/[\\/:*?"<>|]/g, '').trim();
  }

  async function generateAndDownloadDocx() {
    if (typeof docx === 'undefined') {
      alert('Não foi possível gerar o arquivo — a biblioteca docx não carregou (vendor.docx.js).');
      return;
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = docx;

    const os = currentOS || { numero: '-', data: new Date().toLocaleDateString('pt-BR'), cliente: 'Cliente não identificado', telefone: '', aparelho: '', defeito: '', acessorios: '' };

    const headerRow = new TableRow({
      children: [
        new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Teste', bold: true })] })] }),
        new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true })] })] }),
      ]
    });

    const testRows = TESTS.map(test => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(test.label)] }),
        new TableCell({ children: [new Paragraph(statusLabel(lastResults[test.id]))] }),
      ]
    }));

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...testRows]
    });

    function field(label, value) {
      return new Paragraph({
        children: [
          new TextRun({ text: label + ': ', bold: true }),
          new TextRun(value || '-'),
        ],
        spacing: { after: 100 }
      });
    }

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: 'Ordem de Serviço', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: os.numero + '  ·  ' + os.data, spacing: { after: 200 } }),

          field('Cliente', os.cliente),
          field('Telefone', os.telefone),
          field('Aparelho', os.aparelho),
          field('Defeito relatado', os.defeito),
          field('Acessórios entregues', os.acessorios),

          new Paragraph({ text: '', spacing: { after: 200 } }),
          new Paragraph({ text: 'Resultado do Diagnóstico', heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }),
          table,

          new Paragraph({ text: '', spacing: { before: 300 } }),
          new Paragraph({ children: [new TextRun({ text: 'Gerado por All In One Assistech em ' + new Date().toLocaleString('pt-BR'), italics: true, size: 18, color: '888888' })] }),
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(os.numero + ' - ' + os.cliente) + '.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function finishDevice() {
    btnFinish.disabled = true;
    btnFinish.textContent = 'Gerando arquivo...';
    try {
      await generateAndDownloadDocx();
    } catch (err) {
      console.error('Erro ao gerar docx:', err);
      alert('Erro ao gerar o arquivo. Veja o console (F12).');
    }
    btnFinish.disabled = false;
    btnFinish.textContent = '📄 Finalizar aparelho';
    resetToNewOs();
  }

  osForm.addEventListener('submit', submitOsForm);
  btnStart.addEventListener('click', startSession);
  btnCancel.addEventListener('click', cancelSession);
  btnFinish.addEventListener('click', finishDevice);
})();
