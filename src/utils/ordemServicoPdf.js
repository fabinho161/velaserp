import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import saasLogo from "../assets/saas-logo.png";
import { moedaBR } from "./formatters";

const NOME_SAAS = "Renovar ERP";
const PDF_MARGIN = 14;
const PDF_WIDTH = 210;
const PDF_HEIGHT = 297;
const PDF_CONTENT_WIDTH = PDF_WIDTH - PDF_MARGIN * 2;
const PDF_COLORS = {
  navy: [15, 23, 42],
  blue: [37, 99, 235],
  slate: [100, 116, 139],
  border: [226, 232, 240],
  light: [248, 250, 252],
  green: [22, 163, 74],
};

const STATUS_OS_LABEL = {
  aberta: "Aberta",
  aguardando_aprovacao: "Aguardando aprovacao",
  aprovada: "Aprovada",
  em_execucao: "Em execucao",
  concluida: "Concluida",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
};

const STATUS_PAGAMENTO_LABEL = {
  pendente: "Pendente",
  pago: "Pago",
};

const FORMA_PAGAMENTO_LABEL = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartao de credito",
  cartao_debito: "Cartao de debito",
  transferencia: "Transferencia",
  boleto: "Boleto",
  outro: "Outro",
};

const textoPDF = (valor, fallback = "-") => {
  if (valor === null || valor === undefined || valor === "") return fallback;
  const texto = String(valor);
  return texto === "NaN" || texto === "undefined" ? fallback : texto;
};

const numeroSeguro = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const dataParaDate = (valor) => {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return valor;

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

const formatarDataPDF = (valor) => {
  const data = dataParaDate(valor);
  return data ? data.toLocaleDateString("pt-BR") : "-";
};

const carregarImagemBase64 = async (imagemUrl) => {
  if (!imagemUrl) return "";
  if (String(imagemUrl).startsWith("data:image/")) return imagemUrl;

  const response = await fetch(imagemUrl);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const limparNomeArquivo = (valor) =>
  textoPDF(valor, "OS")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const normalizarStatusOS = (status) =>
  String(status || "aberta").trim().toLowerCase();

const normalizarStatusPagamento = (status) =>
  String(status || "pendente").trim().toLowerCase();

const formatarFormaPagamento = (forma) =>
  FORMA_PAGAMENTO_LABEL[String(forma || "").trim().toLowerCase()] || "-";

const desenharRodape = (doc, dataGeracao) => {
  const totalPaginas = doc.internal.getNumberOfPages();

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.line(PDF_MARGIN, PDF_HEIGHT - 18, PDF_WIDTH - PDF_MARGIN, PDF_HEIGHT - 18);
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.slate);
    doc.text("Renovar ERP SaaS", PDF_MARGIN, PDF_HEIGHT - 12);
    doc.text(`Geracao: ${dataGeracao}`, 108, PDF_HEIGHT - 12);
    doc.text(`Pagina ${pagina} de ${totalPaginas}`, 170, PDF_HEIGHT - 7);
  }
};

const desenharCabecalho = async (doc, dadosEmpresa, ordem, dataGeracao, simples = false) => {
  doc.setFillColor(...PDF_COLORS.navy);
  doc.rect(0, 0, PDF_WIDTH, simples ? 28 : 42, "F");
  doc.setFillColor(...PDF_COLORS.blue);
  doc.rect(0, simples ? 26 : 40, PDF_WIDTH, 2, "F");

  if (!simples) {
    try {
      const logoPDF =
        dadosEmpresa.logoBase64 || dadosEmpresa.logoUrl
          ? await carregarImagemBase64(dadosEmpresa.logoBase64 || dadosEmpresa.logoUrl)
          : await carregarImagemBase64(saasLogo);
      const tipoLogoPDF = String(logoPDF).includes("image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(logoPDF, tipoLogoPDF, PDF_MARGIN, 8, 28, 18);
    } catch (error) {
      console.error("Erro ao carregar logo no PDF da OS:", error);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(simples ? 12 : 15);
  doc.text(textoPDF(dadosEmpresa.nome, NOME_SAAS), simples ? PDF_MARGIN : 48, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (simples) {
    doc.text(`Ordem de Servico: ${textoPDF(ordem.numero || `OS-${ordem.id}`)}`, PDF_MARGIN, 20);
    return 38;
  }

  doc.text(`CNPJ: ${textoPDF(dadosEmpresa.cnpj, "CNPJ nao informado")}`, 48, 19);
  doc.text(`Cidade: ${textoPDF(dadosEmpresa.cidade, "Cidade nao informada")}`, 48, 25);
  doc.text(`Contato: ${textoPDF(dadosEmpresa.telefone)}`, 48, 31);
  if (dadosEmpresa.email) doc.text(`E-mail: ${textoPDF(dadosEmpresa.email)}`, 48, 37);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("ORDEM DE SERVICO", 138, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Numero: ${textoPDF(ordem.numero || `OS-${ordem.id}`)}`, 138, 20);
  doc.text(`Geracao: ${dataGeracao}`, 138, 26);
  doc.text(`Status: ${STATUS_OS_LABEL[normalizarStatusOS(ordem.status)] || "Aberta"}`, 138, 32);

  return 54;
};

const garantirEspaco = async (doc, y, altura, cabecalho) => {
  if (y + altura <= PDF_HEIGHT - 28) return y;

  doc.addPage();
  return cabecalho(true);
};

const desenharTituloSecao = async (doc, titulo, y, cabecalho) => {
  const yAjustado = await garantirEspaco(doc, y, 12, cabecalho);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(titulo, PDF_MARGIN, yAjustado);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.line(PDF_MARGIN, yAjustado + 3, PDF_WIDTH - PDF_MARGIN, yAjustado + 3);
  return yAjustado + 9;
};

const desenharLinhasInfo = async (doc, linhas, y, cabecalho) => {
  let cursor = y;

  for (const linha of linhas.filter((item) => item.valor || item.obrigatorio)) {
    const texto = `${linha.label}: ${textoPDF(linha.valor)}`;
    const partes = doc.splitTextToSize(texto, PDF_CONTENT_WIDTH);
    cursor = await garantirEspaco(doc, cursor, partes.length * 5 + 2, cabecalho);
    doc.setFont("helvetica", linha.destaque ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.slate);
    doc.text(partes, PDF_MARGIN, cursor);
    cursor += partes.length * 5;
  }

  return cursor + 4;
};

const tabelaPDF = async (doc, { titulo, head, body, mensagemVazia, startY, cabecalho }) => {
  let y = await desenharTituloSecao(doc, titulo, startY, cabecalho);
  const corpo = body.length
    ? body
    : [[mensagemVazia, ...Array.from({ length: head[0].length - 1 }, () => "")]];

  autoTable(doc, {
    startY: y,
    head,
    body: corpo,
    theme: "grid",
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, top: 38, bottom: 26 },
    styles: {
      fontSize: 8,
      cellPadding: 2.6,
      overflow: "linebreak",
      valign: "middle",
      lineColor: PDF_COLORS.border,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: PDF_COLORS.navy,
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: PDF_COLORS.light },
    columnStyles: {
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) cabecalho(true);
    },
  });

  return doc.lastAutoTable.finalY + 10;
};

const desenharTotais = async (doc, ordem, y, cabecalho) => {
  const altura = 28;
  const largura = 70;
  const x = PDF_WIDTH - PDF_MARGIN - largura;
  const yAjustado = await garantirEspaco(doc, y, altura, cabecalho);

  doc.setDrawColor(...PDF_COLORS.border);
  doc.setFillColor(...PDF_COLORS.light);
  doc.roundedRect(x, yAjustado, largura, altura, 2, 2, "FD");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.slate);
  doc.text("Total de Servicos", x + 4, yAjustado + 7);
  doc.text(moedaBR(ordem.totalServicos || 0), x + largura - 4, yAjustado + 7, { align: "right" });
  doc.text("Total de Peças", x + 4, yAjustado + 15);
  doc.text(moedaBR(ordem.totalPecas || 0), x + largura - 4, yAjustado + 15, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text("TOTAL GERAL", x + 4, yAjustado + 24);
  doc.text(moedaBR(ordem.totalGeral || 0), x + largura - 4, yAjustado + 24, { align: "right" });
  doc.setFont("helvetica", "normal");

  return yAjustado + altura + 12;
};

const desenharAssinaturas = async (doc, y, cabecalho) => {
  const yAjustado = await garantirEspaco(doc, y, 34, cabecalho);
  const largura = 72;
  const yLinha = yAjustado + 18;

  doc.setDrawColor(...PDF_COLORS.slate);
  doc.line(PDF_MARGIN, yLinha, PDF_MARGIN + largura, yLinha);
  doc.line(PDF_WIDTH - PDF_MARGIN - largura, yLinha, PDF_WIDTH - PDF_MARGIN, yLinha);
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.slate);
  doc.text("Cliente", PDF_MARGIN + largura / 2, yLinha + 6, { align: "center" });
  doc.text("Responsavel pela Oficina", PDF_WIDTH - PDF_MARGIN - largura / 2, yLinha + 6, {
    align: "center",
  });
};

export const gerarOrdemServicoPDF = async ({ ordem, dadosEmpresa = {} }) => {
  const doc = new jsPDF();
  const dataGeracao = new Date().toLocaleString("pt-BR");
  const cabecalho = (simples = false) =>
    desenharCabecalho(doc, dadosEmpresa, ordem, dataGeracao, simples);
  let y = await cabecalho(false);
  const status = normalizarStatusOS(ordem.status);
  const statusPagamento = normalizarStatusPagamento(ordem.statusPagamento);

  y = await desenharLinhasInfo(
    doc,
    [
      { label: "Data de abertura", valor: formatarDataPDF(ordem.criadoEm), obrigatorio: true },
      {
        label: "Data de encerramento",
        valor: status === "encerrada" ? formatarDataPDF(ordem.encerradoEm) : "",
      },
      {
        label: "Pagamento",
        valor: STATUS_PAGAMENTO_LABEL[statusPagamento] || "Pendente",
        obrigatorio: true,
      },
      { label: "Forma de pagamento", valor: formatarFormaPagamento(ordem.formaPagamento) },
      { label: "Data do pagamento", valor: formatarDataPDF(ordem.dataPagamento) },
    ],
    y,
    cabecalho
  );

  y = await desenharTituloSecao(doc, "CLIENTE", y, cabecalho);
  y = await desenharLinhasInfo(
    doc,
    [
      { label: "Nome", valor: ordem.clienteNome, obrigatorio: true },
      { label: "Telefone", valor: ordem.clienteTelefone },
    ],
    y,
    cabecalho
  );

  y = await desenharTituloSecao(doc, "VEICULO", y, cabecalho);
  y = await desenharLinhasInfo(
    doc,
    [
      { label: "Placa", valor: ordem.veiculoPlaca, obrigatorio: true },
      { label: "Marca", valor: ordem.veiculoMarca },
      { label: "Modelo", valor: ordem.veiculoModelo },
      { label: "Ano", valor: ordem.veiculoAno },
      { label: "Quilometragem de entrada", valor: ordem.quilometragemEntrada },
    ],
    y,
    cabecalho
  );

  y = await desenharTituloSecao(doc, "ATENDIMENTO", y, cabecalho);
  y = await desenharLinhasInfo(
    doc,
    [
      { label: "Defeito relatado", valor: ordem.defeitoRelatado, obrigatorio: true },
      { label: "Diagnostico", valor: ordem.diagnostico },
      { label: "Observacoes", valor: ordem.observacoes },
    ],
    y,
    cabecalho
  );

  y = await tabelaPDF(doc, {
    titulo: "SERVICOS / MAO DE OBRA",
    head: [["Servico", "Qtd.", "Valor unitario", "Subtotal"]],
    body: (Array.isArray(ordem.servicos) ? ordem.servicos : []).map((servico) => [
      textoPDF(servico.nome || servico.servicoNome || servico.servico),
      numeroSeguro(servico.quantidade).toLocaleString("pt-BR"),
      moedaBR(servico.valorUnitario || 0),
      moedaBR(servico.subtotal || 0),
    ]),
    mensagemVazia: "Nenhum servico informado.",
    startY: y,
    cabecalho,
  });

  y = await tabelaPDF(doc, {
    titulo: "PEÇAS",
    head: [["Peça", "Qtd.", "Valor unitario", "Subtotal"]],
    body: (Array.isArray(ordem.pecas) ? ordem.pecas : []).map((peca) => [
      textoPDF(peca.produtoNome || peca.produto),
      numeroSeguro(peca.quantidade).toLocaleString("pt-BR"),
      moedaBR(peca.valorUnitario || 0),
      moedaBR(peca.subtotal || 0),
    ]),
    mensagemVazia: "Nenhuma peça informada.",
    startY: y,
    cabecalho,
  });

  y = await desenharTotais(doc, ordem, y, cabecalho);
  await desenharAssinaturas(doc, y, cabecalho);
  desenharRodape(doc, dataGeracao);

  const arquivo = `Ordem-Servico-${limparNomeArquivo(ordem.numero || ordem.id)}.pdf`;
  doc.autoPrint();
  const url = doc.output("bloburl");
  const janela = window.open(url, "_blank");

  if (!janela) {
    doc.save(arquivo);
  }
};
