// ---------- Helpers de layout ----------
function wrapText(font, text, size, maxWidth) {
  const words = String(text || '-').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fieldLines(font, fontBold, label, value, size, maxWidth) {
  const labelText = label + ': ';
  const labelWidth = labelW(fontBold, labelText, size);
  const valueLines = wrapText(font, value || '-', size, maxWidth - labelWidth);
  return valueLines.map((line, i) => ({
    label: i === 0 ? labelText : null,
    text: line,
    indent: i === 0 ? 0 : labelWidth,
  }));
}

const COLORS = {
  black: [0, 0, 0],
  white: [1, 1, 1],
  orange: [0.910, 0.365, 0.102],
  grayText: [0.42, 0.42, 0.45],
  green: [0.11, 0.63, 0.36],
  red: [0.76, 0.23, 0.23],
};
function rgbOf(PDFLib, arr) { return PDFLib.rgb(arr[0], arr[1], arr[2]); }

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function extenso(date) {
  return date.getDate() + ' de ' + MESES[date.getMonth()] + ' de ' + date.getFullYear();
}

const PAGE_W = 595, PAGE_H = 842, MARGIN = 24;
const LABEL_GAP = 3; // respiro entre "Rótulo:" e o valor
function labelW(font, text, size) { return font.widthOfTextAtSize(text, size) + LABEL_GAP; }
const WIDTH = PAGE_W - MARGIN * 2;

// ---------- Cabeçalho preto padrão (logo + wordmark + título à direita) ----------
function drawHeader(PDFLib, page, fonts, logoImg, rightTitle, ano) {
  const HEADER_H = 92;

  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: rgbOf(PDFLib, COLORS.black) });

  if (logoImg) {
    // Logo grande no canto superior esquerdo (igual ao modelo enviado)
    const logoSize = 80;
    page.drawImage(logoImg, { x: 14, y: PAGE_H - HEADER_H + (HEADER_H - logoSize) / 2, width: logoSize, height: logoSize });
  }

  // Nome da empresa centralizado na página (cada linha centralizada individualmente)
  const line1 = 'ALL IN ONE', line1Size = 20;
  const line2 = 'ASSISTECH', line2Size = 26;
  const line1W = fonts.bold.widthOfTextAtSize(line1, line1Size);
  const line2W = fonts.bold.widthOfTextAtSize(line2, line2Size);
  page.drawText(line1, { x: (PAGE_W - line1W) / 2, y: PAGE_H - 36, size: line1Size, font: fonts.bold, color: rgbOf(PDFLib, COLORS.orange) });
  page.drawText(line2, { x: (PAGE_W - line2W) / 2, y: PAGE_H - 64, size: line2Size, font: fonts.bold, color: rgbOf(PDFLib, COLORS.white) });

  const rightMargin = PAGE_W - 24;
  const titleSize = 15;
  const titleW = fonts.bold.widthOfTextAtSize(rightTitle, titleSize);
  page.drawText(rightTitle, { x: rightMargin - titleW, y: PAGE_H - 34, size: titleSize, font: fonts.bold, color: rgbOf(PDFLib, COLORS.white) });

  const anoText = 'Ano: ' + ano;
  const anoSize = 12;
  const anoW = fonts.regular.widthOfTextAtSize(anoText, anoSize);
  page.drawText(anoText, { x: rightMargin - anoW, y: PAGE_H - 54, size: anoSize, font: fonts.regular, color: rgbOf(PDFLib, COLORS.white) });

  return PAGE_H - HEADER_H;
}

// ---------- Caixa com borda + linhas de texto/funções já calculadas ----------
function drawBox(PDFLib, page, x, yTop, boxWidth, lines, fonts, opts) {
  opts = opts || {};
  const padding = 12;
  const lineHeight = opts.lineHeight || 15;
  const titleGap = opts.title ? 20 : 0;
  const contentHeight = lines.length * lineHeight;
  const boxHeight = Math.max(padding * 2 + titleGap + contentHeight, opts.minHeight || 0);

  page.drawRectangle({
    x, y: yTop - boxHeight, width: boxWidth, height: boxHeight,
    borderColor: rgbOf(PDFLib, COLORS.black), borderWidth: 1,
  });

  let cursorY = yTop - padding;

  if (opts.title) {
    const titleSize = 11;
    const titleW = fonts.bold.widthOfTextAtSize(opts.title, titleSize);
    page.drawText(opts.title, { x: x + (boxWidth - titleW) / 2, y: cursorY - 10, size: titleSize, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
    cursorY -= titleGap;
  }

  for (const line of lines) {
    if (typeof line === 'function') {
      line(cursorY);
      cursorY -= lineHeight;
      continue;
    }
    const cx = x + padding + (line.indent || 0);
    if (line.label) {
      page.drawText(line.label, { x: cx, y: cursorY - 10, size: 10, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
      const lblW = labelW(fonts.bold, line.label, 10);
      page.drawText(line.text, { x: cx + lblW, y: cursorY - 10, size: 10, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
    } else {
      page.drawText(line.text, { x: cx, y: cursorY - 10, size: 10, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
    }
    cursorY -= lineHeight;
  }

  return yTop - boxHeight;
}

function twoColFn(PDFLib, page, fonts, col2X, label1, value1, label2, value2, size) {
  return (yy) => {
    page.drawText(label1, { x: MARGIN + 12, y: yy - 10, size, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
    const w1 = labelW(fonts.bold, label1, size);
    page.drawText(value1 || '-', { x: MARGIN + 12 + w1, y: yy - 10, size, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });

    if (label2) {
      page.drawText(label2, { x: col2X, y: yy - 10, size, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
      const w2 = labelW(fonts.bold, label2, size);
      page.drawText(value2 || '-', { x: col2X + w2, y: yy - 10, size, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
    }
  };
}

// =====================================================================
// PÁGINA 1 — ORDEM DE SERVIÇO
// =====================================================================
function drawOsPage(PDFLib, page, fonts, logoImg, os) {
  const col2X = MARGIN + WIDTH / 2 + 8;
  let y = drawHeader(PDFLib, page, fonts, logoImg, 'Ordem de Serviço', os.ano);
  y -= 16;

  // Caixa 1: Dados do(a) Cliente
  const clienteLines = [
    twoColFn(PDFLib, page, fonts, col2X, 'Cliente: ', os.cliente, 'Telefone: ', os.telefone, 11),
    twoColFn(PDFLib, page, fonts, col2X, 'End: ', (os.endereco || '-') + (os.numero ? ', N° ' + os.numero : ''), 'Bairro/Cidade: ', os.bairroCidade, 10),
    twoColFn(PDFLib, page, fonts, col2X, 'Estado: ', (os.estado || '-') + '   CEP: ' + (os.cep || '-'), 'CPF/CNPJ: ', os.cpfCnpj, 10),
  ];
  y = drawBox(PDFLib, page, MARGIN, y, WIDTH, clienteLines, fonts, { title: 'Dados do(a) Cliente:', lineHeight: 18 });
  y -= 14;

  // Caixa 2: Dados do Aparelho
  const apLines = [
    twoColFn(PDFLib, page, fonts, col2X, 'N° de Série: ', os.serie, 'IMEI: ', os.imei, 10),
  ];
  function pushWrapped(label, value) {
    fieldLines(fonts.regular, fonts.bold, label, value, 10, WIDTH - 24).forEach(p => {
      apLines.push((yy) => {
        const x = MARGIN + 12 + p.indent;
        if (p.label) {
          page.drawText(p.label, { x, y: yy - 10, size: 10, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
          const w = labelW(fonts.bold, p.label, 10);
          page.drawText(p.text, { x: x + w, y: yy - 10, size: 10, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
        } else {
          page.drawText(p.text, { x, y: yy - 10, size: 10, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
        }
      });
    });
  }
  pushWrapped('Aparelho', os.aparelho);
  pushWrapped('Defeito Relatado', os.defeito);
  pushWrapped('Solução Apresentada', os.solucao);
  pushWrapped('Senha do Aparelho', os.senha);
  pushWrapped('Acessórios entregues', os.acessorios);

  y = drawBox(PDFLib, page, MARGIN, y, WIDTH, apLines, fonts, { title: 'Dados do Aparelho:', lineHeight: 16 });
  y -= 14;

  // Caixa 3 (duas colunas): Atendimento | Orçamento
  const halfW = WIDTH / 2 - 6;
  const atendLines = [];
  ['Data/Hora de entrada', 'Data/Hora de saída', 'Técnico Visto'].forEach((label, i) => {
    const value = [os.dataHoraEntrada, os.dataHoraSaida, os.tecnico][i];
    fieldLines(fonts.regular, fonts.bold, label, value, 9.5, halfW - 24).forEach(p => {
      atendLines.push((yy) => {
        const x = MARGIN + 12 + p.indent;
        if (p.label) {
          page.drawText(p.label, { x, y: yy - 10, size: 9.5, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
          const w = labelW(fonts.bold, p.label, 9.5);
          page.drawText(p.text, { x: x + w, y: yy - 10, size: 9.5, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
        } else {
          page.drawText(p.text, { x, y: yy - 10, size: 9.5, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
        }
      });
    });
  });
  // (a caixa de orçamento é montada logo abaixo; as duas usam a mesma altura)

  const orcLines = [];
  fieldLines(fonts.regular, fonts.bold, 'Orçamento Aprovado', os.orcamento, 9.5, halfW - 24).forEach(p => {
    orcLines.push((yy) => {
      const x = MARGIN + halfW + 8 + 12 + p.indent;
      if (p.label) {
        page.drawText(p.label, { x, y: yy - 10, size: 9.5, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
        const w = labelW(fonts.bold, p.label, 9.5);
        page.drawText(p.text, { x: x + w, y: yy - 10, size: 9.5, font: fonts.regular, color: rgbOf(PDFLib, COLORS.orange) });
      } else {
        page.drawText(p.text, { x, y: yy - 10, size: 9.5, font: fonts.regular, color: rgbOf(PDFLib, COLORS.orange) });
      }
    });
  });
  const row3Height = 24 + Math.max(atendLines.length, orcLines.length) * 15;
  const yAfterAtend = drawBox(PDFLib, page, MARGIN, y, halfW, atendLines, fonts, { lineHeight: 15, minHeight: row3Height });
  const yAfterOrc = drawBox(PDFLib, page, MARGIN + halfW + 8, y, halfW, orcLines, fonts, { lineHeight: 15, minHeight: row3Height });

  y = Math.min(yAfterAtend, yAfterOrc) - 20;

  // Texto de autorização
  const authText = 'A ASSINATURA DO(A) CLIENTE COMPROVA A EXECUÇÃO DOS SERVIÇOS BEM COMO A VERACIDADE DOS DADOS CONSTANTES ACIMA E AUTORIZA-NOS A EXECUTAR A COBRANÇA DOS SERVIÇOS EXECUTADOS.';
  wrapText(fonts.bold, authText, 9, WIDTH).forEach(line => {
    const w = fonts.bold.widthOfTextAtSize(line, 9);
    page.drawText(line, { x: MARGIN + (WIDTH - w) / 2, y, size: 9, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
    y -= 13;
  });

  y -= 40;

  // Local/data + assinatura
  const dataText = 'São Leopoldo, ' + extenso(new Date());
  page.drawText(dataText, { x: MARGIN, y, size: 10, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });

  const sigLineW = 200;
  const sigX = PAGE_W - MARGIN - sigLineW;
  page.drawLine({ start: { x: sigX, y: y + 14 }, end: { x: sigX + sigLineW, y: y + 14 }, thickness: 1, color: rgbOf(PDFLib, COLORS.black) });
  const sigLabel = 'Assinatura do(a) Cliente';
  const sigLabelW = fonts.regular.widthOfTextAtSize(sigLabel, 9);
  page.drawText(sigLabel, { x: sigX + (sigLineW - sigLabelW) / 2, y, size: 9, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
}

// =====================================================================
// PÁGINA 2 — FICHA DE TESTES
// =====================================================================
function drawFichaTestesPage(PDFLib, page, fonts, logoImg, os, results, TESTS) {
  let y = drawHeader(PDFLib, page, fonts, logoImg, 'Ficha de Testes', os.ano);
  y -= 24;

  const introLines = [
    twoColFn(PDFLib, page, fonts, MARGIN + WIDTH / 2 + 8, 'Cliente: ', os.cliente, 'Aparelho: ', os.aparelho, 10),
  ];
  y = drawBox(PDFLib, page, MARGIN, y, WIDTH, introLines, fonts, { lineHeight: 18 });
  y -= 20;

  const headerRow = (yy) => {
    page.drawText('Teste', { x: MARGIN + 12, y: yy - 11, size: 11, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
    page.drawText('Status', { x: MARGIN + WIDTH - 100, y: yy - 11, size: 11, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
    page.drawLine({ start: { x: MARGIN, y: yy - 18 }, end: { x: MARGIN + WIDTH, y: yy - 18 }, thickness: 0.75, color: rgbOf(PDFLib, COLORS.black) });
  };

  const rows = [headerRow];
  TESTS.forEach(t => {
    const status = results ? results[t.id] : undefined;
    const label = status === 'ok' ? 'OK' : status === 'fail' ? 'Verificar' : 'Não testado';
    const color = status === 'ok' ? COLORS.green : status === 'fail' ? COLORS.red : COLORS.grayText;
    rows.push((yy) => {
      page.drawText(t.label, { x: MARGIN + 12, y: yy - 11, size: 10.5, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
      page.drawText(label, { x: MARGIN + WIDTH - 100, y: yy - 11, size: 10.5, font: fonts.bold, color: rgbOf(PDFLib, color) });
    });
  });

  const hasResults = results && Object.keys(results).length > 0;
  y = drawBox(PDFLib, page, MARGIN, y, WIDTH, rows, fonts, { title: 'Resultado do Diagnóstico (Teste de Bancada)', lineHeight: 20 });

  if (!hasResults) {
    y -= 20;
    const note = 'Nenhum resultado de teste foi recebido do celular até a geração deste documento.';
    wrapText(fonts.regular, note, 10, WIDTH).forEach(line => {
      page.drawText(line, { x: MARGIN, y, size: 10, font: fonts.regular, color: rgbOf(PDFLib, COLORS.grayText) });
      y -= 14;
    });
  }
}

// =====================================================================
// PÁGINA 3 — TERMO DE GARANTIA
// =====================================================================
function drawGarantiaPage(PDFLib, page, fonts, logoImg, os) {
  let y = drawHeader(PDFLib, page, fonts, logoImg, 'Garantia', os.ano);
  y -= 26;

  const introLines = [
    twoColFn(PDFLib, page, fonts, MARGIN + WIDTH / 2 + 8, 'Cliente: ', os.cliente, 'Aparelho: ', os.aparelho, 10),
  ];
  y = drawBox(PDFLib, page, MARGIN, y, WIDTH, introLines, fonts, { lineHeight: 18 });
  y -= 26;

  const bullets = [
    'Cobertura: todos os serviços realizados.',
    'Prazo: 3 meses a partir da conclusão do serviço.',
    'Válido apenas para defeitos técnicos ou falhas de fabricação.',
    'Não cobre danos por mau uso (quedas, líquidos, consertos por terceiros).',
    'Em caso de defeito, o aparelho deve ser levado à assistência o quanto antes.',
  ];
  bullets.forEach(b => {
    page.drawText('•', { x: MARGIN, y, size: 11, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
    const lines = wrapText(fonts.bold, b, 11, WIDTH - 18);
    lines.forEach((line, i) => {
      page.drawText(line, { x: MARGIN + 14, y: y - i * 15, size: 11, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
    });
    y -= 15 * lines.length + 6;
  });

  y -= 14;
  const legal = 'Garantia conforme Art. 18, 20 e 26 do Código de Defesa do Consumidor (Lei 8.078/90), válida por 3 meses para defeitos técnicos ou de fabricação.';
  wrapText(fonts.bold, legal, 11, WIDTH).forEach(line => {
    page.drawText(line, { x: MARGIN, y, size: 11, font: fonts.bold, color: rgbOf(PDFLib, COLORS.black) });
    y -= 16;
  });

  y -= 70;
  const sigLineW = 220;
  const sigX = PAGE_W - MARGIN - sigLineW;
  page.drawLine({ start: { x: sigX, y: y + 14 }, end: { x: sigX + sigLineW, y: y + 14 }, thickness: 1, color: rgbOf(PDFLib, COLORS.black) });
  const sigLabel = 'Assinatura do(a) Cliente';
  const sigLabelW = fonts.regular.widthOfTextAtSize(sigLabel, 10);
  page.drawText(sigLabel, { x: sigX + (sigLineW - sigLabelW) / 2, y, size: 10, font: fonts.regular, color: rgbOf(PDFLib, COLORS.black) });
}

// =====================================================================
// Monta o PDF completo de 3 páginas
// =====================================================================
async function embedLogo(doc, bytes) {
  try { return await doc.embedPng(bytes); }
  catch (e1) {
    try { return await doc.embedJpg(bytes); }
    catch (e2) { console.warn('Logo em formato não suportado pelo PDF:', e2); return null; }
  }
}

async function buildFullPdf(PDFLib, logoBytes, os, results, TESTS) {
  const { PDFDocument, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logoImg = logoBytes ? await embedLogo(doc, logoBytes) : null;

  const page1 = doc.addPage([PAGE_W, PAGE_H]);
  drawOsPage(PDFLib, page1, fonts, logoImg, os);

  const page2 = doc.addPage([PAGE_W, PAGE_H]);
  drawFichaTestesPage(PDFLib, page2, fonts, logoImg, os, results, TESTS);

  const page3 = doc.addPage([PAGE_W, PAGE_H]);
  drawGarantiaPage(PDFLib, page3, fonts, logoImg, os);

  return doc.save();
}
