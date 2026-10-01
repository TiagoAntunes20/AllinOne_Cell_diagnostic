(function () {
  const screenStart = document.getElementById('screen-start');
  const screenQr = document.getElementById('screen-qr');
  const screenResult = document.getElementById('screen-result');
  const screenPhotos = document.getElementById('screen-photos');

  const osFormWrap = document.getElementById('os-form-wrap');
  const osReadyWrap = document.getElementById('os-ready-wrap');
  const osForm = document.getElementById('os-form');
  const osReadyName = document.getElementById('os-ready-name');
  const osReadySub = document.getElementById('os-ready-sub');

  const btnStart = document.getElementById('btn-start');
  const btnCancel = document.getElementById('btn-cancel');
  const btnContinue = document.getElementById('btn-continue');
  const btnGenerate = document.getElementById('btn-generate');
  const sessionCodeEl = document.getElementById('session-code');
  const qrCanvas = document.getElementById('qr-canvas');
  const resultClientEl = document.getElementById('result-client');
  const resultListEl = document.getElementById('result-list');

  const photosBeforeInput = document.getElementById('photos-before-input');
  const photosAfterInput = document.getElementById('photos-after-input');
  const photosBeforeGrid = document.getElementById('photos-before-grid');
  const photosAfterGrid = document.getElementById('photos-after-grid');

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

    goTo(screenResult, screenStart, screenQr, screenPhotos);
  }

  // --- Fotos (antes/depois) ---
  // Vivem só na memória desta aba, igual o resto do estado da OS.
  let photosBefore = [];
  let photosAfter = [];

  const MAX_PHOTO_DIM = 1000; // px — tamanho máximo antes de comprimir
  const PHOTO_QUALITY = 0.8;

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) { reject(new Error('Falha ao comprimir imagem')); return; }
          const bytes = new Uint8Array(await blob.arrayBuffer());
          resolve({ previewUrl: URL.createObjectURL(blob), bytes });
        }, 'image/jpeg', PHOTO_QUALITY);
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderPhotoGrid(list, gridEl) {
    gridEl.innerHTML = '';
    if (!list.length) {
      const hint = document.createElement('div');
      hint.className = 'photo-empty-hint';
      hint.textContent = 'Nenhuma foto adicionada.';
      gridEl.appendChild(hint);
      return;
    }
    list.forEach((photo, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      thumb.innerHTML = `<img src="${photo.previewUrl}" alt="Foto ${index + 1}">
        <button type="button" class="photo-thumb__remove" title="Remover">×</button>`;
      thumb.querySelector('.photo-thumb__remove').addEventListener('click', () => {
        URL.revokeObjectURL(photo.previewUrl);
        list.splice(index, 1);
        renderPhotoGrid(list, gridEl);
      });
      gridEl.appendChild(thumb);
    });
  }

  async function handlePhotoInput(e, list, gridEl) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    for (const file of files) {
      try {
        const photo = await compressImage(file);
        list.push(photo);
      } catch (err) {
        console.error('Erro ao processar foto:', err);
      }
    }
    renderPhotoGrid(list, gridEl);
  }

  function resetPhotos() {
    photosBefore.forEach(p => URL.revokeObjectURL(p.previewUrl));
    photosAfter.forEach(p => URL.revokeObjectURL(p.previewUrl));
    photosBefore = [];
    photosAfter = [];
    renderPhotoGrid(photosBefore, photosBeforeGrid);
    renderPhotoGrid(photosAfter, photosAfterGrid);
  }

  photosBeforeInput.addEventListener('change', (e) => handlePhotoInput(e, photosBefore, photosBeforeGrid));
  photosAfterInput.addEventListener('change', (e) => handlePhotoInput(e, photosAfter, photosAfterGrid));
  renderPhotoGrid(photosBefore, photosBeforeGrid);
  renderPhotoGrid(photosAfter, photosAfterGrid);

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
    resetPhotos();
    osForm.reset();
    osReadyWrap.style.display = 'none';
    osFormWrap.style.display = 'block';
    goTo(screenStart, screenQr, screenResult, screenPhotos);
  }

  function startSession() {
    const code = generateSessionCode();
    sessionCodeEl.textContent = code;

    goTo(screenQr, screenStart, screenResult, screenPhotos);

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
    goTo(screenStart, screenQr, screenResult, screenPhotos);
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

  function isPngOrJpeg(bytes) {
    if (!bytes || bytes.length < 4) return false;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const jpg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    return png || jpg;
  }

  // Logo do PDF: usa o arquivo logo.png (mesma pasta do index.html).
  // Se ele não existir ou não for PNG/JPG de verdade, usa como plano B
  // a logo que já aparece na página, convertida pra PNG via canvas.
  async function loadLogoBytes() {
    if (logoBytesCache) return logoBytesCache;

    try {
      const resp = await fetch('logo.png', { cache: 'no-cache' });
      if (resp.ok) {
        const bytes = new Uint8Array(await resp.arrayBuffer());
        if (isPngOrJpeg(bytes)) {
          logoBytesCache = bytes;
          return logoBytesCache;
        }
      }
    } catch (e) {
      console.warn('Não foi possível buscar logo.png, tentando a imagem da página:', e);
    }

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
      console.error('Não foi possível carregar a logo pro PDF:', e);
    }

    console.warn('PDF gerado sem logo: confira se logo.png está na mesma pasta do index.html.');
    return null;
  }

  async function finishDevice() {
    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Gerando PDF...';
    try {
      if (typeof PDFLib === 'undefined') {
        throw new Error('Biblioteca PDFLib não carregou (vendor.pdflib.js).');
      }
      const os = currentOS || { ano: String(new Date().getFullYear()), cliente: 'Cliente não identificado', fileTag: generateFileTag() };
      const logoBytes = await loadLogoBytes();

      // Um único PDF de 4 páginas: Ordem de Serviço, Ficha de Testes,
      // Fotos (antes/depois), Termo de Garantia — nessa ordem.
      const pdfBytes = await buildFullPdf(PDFLib, logoBytes, os, lastResults, TESTS, photosBefore, photosAfter);

      const filename = sanitizeFilename('OS ' + os.ano + ' - ' + (os.cliente || 'cliente') + ' - ' + os.fileTag) + '.pdf';
      downloadBytes(pdfBytes, filename);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar o arquivo. Veja o console (F12).');
    }
    btnGenerate.disabled = false;
    btnGenerate.textContent = '📄 Finalizar aparelho';
    resetToNewOs();
  }

  osForm.addEventListener('submit', submitOsForm);
  btnStart.addEventListener('click', startSession);
  btnCancel.addEventListener('click', cancelSession);
  btnContinue.addEventListener('click', () => goTo(screenPhotos, screenResult));
  btnGenerate.addEventListener('click', finishDevice);
})();
