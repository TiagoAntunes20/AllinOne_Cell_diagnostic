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
  // de resultado e o PDF, e pra apontar o que não foi testado (o
  // celular só envia o que ele realmente sabe).
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

  // Identificador interno só pra nomear os arquivos baixados (não
  // aparece nos documentos — o modelo real só mostra o Ano).
  function generateFileTag() {
    return Date.now().toString().slice(-6);
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
  // Os IDs do formulário têm caracteres especiais (°, /, espaços), então
  // lemos os valores pelo texto do <label> — mais seguro e não depende
  // de IDs frágeis. NÃO mexe na estrutura do formulário em si.
  function fieldByLabel(exactLabelText) {
    const target = exactLabelText.trim().toLowerCase();
    const labels = osForm.querySelectorAll('label');
    for (const lbl of labels) {
      const firstNode = lbl.childNodes[0];
      const text = (firstNode ? firstNode.textContent : lbl.textContent).trim().toLowerCase();
      if (text === target) {
        const field = lbl.querySelector('input, textarea, select');
        return field ? field.value.trim() : '';
      }
    }
    console.warn('Campo do formulário não encontrado pelo label:', exactLabelText);
    return '';
  }

  function submitOsForm(e) {
    e.preventDefault();

    currentOS = {
      fileTag: generateFileTag(),
      ano: String(new Date().getFullYear()),
      cliente: fieldByLabel('Nome do cliente*'),
      telefone: fieldByLabel('Telefone'),
      endereco: fieldByLabel('End'),
      numero: fieldByLabel('N°'),
      bairroCidade: fieldByLabel('Bairro/Cidade'),
      estado: fieldByLabel('Estado'),
      cep: fieldByLabel('CEP'),
      cpfCnpj: fieldByLabel('CPF/CNPJ'),
      serie: fieldByLabel('N° de Serie'),
      imei: fieldByLabel('IMEI'),
      aparelho: fieldByLabel('Aparelho (marca/modelo)'),
      defeito: fieldByLabel('Defeito relatado*'),
      solucao: fieldByLabel('Solução Apresentado*'),
      senha: fieldByLabel('Senha do aparelho*'),
      acessorios: fieldByLabel('Acessórios entregues'),
      dataHoraEntrada: fieldByLabel('Data e hora de entrada*'),
      dataHoraSaida: fieldByLabel('Data e hora de saida*'),
      orcamento: fieldByLabel('orçamento aprovado*'),
      tecnico: fieldByLabel('Tecnico visto'),
    };

    osReadyName.textContent = currentOS.cliente;
    osReadySub.textContent = currentOS.aparelho || '';

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

  function sanitizeFilename(text) {
    return text.replace(/[\\/:*?"<>|]/g, '').trim();
  }

  function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  let logoBytesCache = null;
  async function loadLogoBytes() {
    if (logoBytesCache) return logoBytesCache;

    // 1) Usa a MESMA logo que já está aparecendo na página (qualquer
    //    nome/formato: png, jpg, svg, webp) convertida pra PNG via canvas.
    try {
      const img = document.querySelector('.brandbar__logo');
      if (img) {
        if (!img.complete) await new Promise(res => { img.onload = img.onerror = res; });
        if (img.naturalWidth > 0) {
          const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
          if (blob) {
            logoBytesCache = new Uint8Array(await blob.arrayBuffer());
            return logoBytesCache;
          }
        }
      }
    } catch (e) {
      console.warn('Não foi possível ler a logo pela imagem da página, tentando fetch:', e);
    }

    // 2) Fallback: busca o arquivo direto
    try {
      const resp = await fetch(document.querySelector('.brandbar__logo')?.getAttribute('src') || 'logo.png');
      if (!resp.ok) throw new Error('logo não encontrada');
      logoBytesCache = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
      console.error('Não foi possível carregar a logo pro PDF:', e);
      logoBytesCache = null;
    }
    return logoBytesCache;
  }

  async function finishDevice() {
    btnFinish.disabled = true;
    btnFinish.textContent = 'Gerando PDF...';
    try {
      if (typeof PDFLib === 'undefined') {
        throw new Error('Biblioteca PDFLib não carregou (vendor.pdflib.js).');
      }
      const os = currentOS || { ano: String(new Date().getFullYear()), cliente: 'Cliente não identificado', fileTag: generateFileTag() };
      const logoBytes = await loadLogoBytes();

      // Um único PDF de 3 páginas: Ordem de Serviço, Ficha de Testes,
      // Termo de Garantia — nessa ordem.
      const pdfBytes = await buildFullPdf(PDFLib, logoBytes, os, lastResults, TESTS);

      const filename = sanitizeFilename('OS ' + os.ano + ' - ' + (os.cliente || 'cliente') + ' - ' + os.fileTag) + '.pdf';
      downloadBytes(pdfBytes, filename);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
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
