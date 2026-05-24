import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { usePlano } from "../hooks/usePlano";
import { useTableSort } from "../hooks/useTableSort";
import { moedaBR, inteiroBR, dataBR, numeroBR } from "../utils/formatters";
import {
  calcularEstoqueInsumos,
  calcularEstoqueProdutos,
} from "../utils/estoqueProdutos";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import saasLogo from "../assets/saas-logo.png";

const NOME_SAAS = "Renovar ERP";
const PDF_COLORS = {
  navy: [15, 23, 42],
  blue: [37, 99, 235],
  slate: [100, 116, 139],
  border: [226, 232, 240],
  light: [248, 250, 252],
  green: [22, 163, 74],
  red: [220, 38, 38],
  amber: [217, 119, 6],
};

const PDF_MARGIN = 14;
const PDF_WIDTH = 210;
const PDF_CONTENT_WIDTH = PDF_WIDTH - PDF_MARGIN * 2;

export default function Relatorios() {
  const {
    insumos,
    produtos,
    producoes,
    vendas,
    perdasDoacoes,
    despesas,
    empresas,
    empresaId,
    configuracoes,
  } = useERP();
  const { showToast } = useToast();
  const { podeUsarDRE, podeGerarPDF } = usePlano();
  const ordenacaoAlertas = useTableSort({
    chave: "item",
    direcao: "asc",
  });
  const ordenacaoVendas = useTableSort({
    chave: "data",
    direcao: "desc",
  });

  // ================================
  // 🔹 FILTRO GLOBAL DOS RELATÓRIOS
  // ================================
  const [filtro, setFiltro] = useState({
    inicio: "",
    fim: "",
  });

  // ================================
  // 🔹 FILTRAR LISTAS POR PERÍODO
  // ================================
  const filtrarPorPeriodo = (lista) => {
    return (lista || []).filter((item) => {
      const data = item.data || item.criadoEm || "";

      if (filtro.inicio && data < filtro.inicio) return false;
      if (filtro.fim && data > filtro.fim) return false;

      return true;
    });
  };

  // ================================
  // 🔹 DADOS FILTRADOS
  // ================================
  const vendasFiltradas = filtrarPorPeriodo(vendas);
  const despesasFiltradas = filtrarPorPeriodo(despesas);
  const producoesFiltradas = filtrarPorPeriodo(producoes);

  // ================================
  // 🔹 INDICADORES GERAIS
  // ================================
  const totalVendas = vendasFiltradas.reduce(
    (total, venda) => total + Number(venda.total ?? 0),
    0
  );

  const totalDespesas = despesasFiltradas.reduce(
    (total, despesa) => total + Number(despesa.valor ?? 0),
    0
  );

  const saldoFinanceiro = totalVendas - totalDespesas;

  const custoProdutosVendidos = vendasFiltradas.reduce(
    (total, venda) => total + Number(venda.custoTotal ?? 0),
    0
  );

  const lucroBruto = totalVendas - custoProdutosVendidos;

  const margemBruta =
    totalVendas > 0 ? (lucroBruto / totalVendas) * 100 : 0;

  const totalItensVendidos = vendasFiltradas.reduce((total, venda) => {
    const itens = venda.itens || [];

    return (
      total +
      itens.reduce(
        (subtotal, item) => subtotal + Number(item.quantidade ?? 0),
        0
      )
    );
  }, 0);

  const totalProduzido = producoesFiltradas.reduce(
    (total, producao) => total + Number(producao.quantidade ?? 0),
    0
  );
  const produtosEstoqueCalculado = calcularEstoqueProdutos({
    produtos,
    producoes,
    vendas,
    perdasDoacoes,
  });
  const insumosEstoqueCalculado = calcularEstoqueInsumos({
    insumos,
    producoes,
    perdasDoacoes,
  });
  const produtosPorId = new Map(
    (produtos || []).map((produto) => [produto.id, produto])
  );

  // ================================
  // 🔹 ALERTAS DE ESTOQUE
  // ================================
  const insumosAbaixoMinimo = (insumos || []).filter((insumo) => {
    const estoqueAtual = Number(insumo.estoqueAtual ?? insumo.estoque ?? 0);
    const estoqueMinimo = Number(insumo.estoqueMinimo ?? 0);

    return estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo;
  });

  const produtosAbaixoMinimo = produtosEstoqueCalculado.filter((produto) => {
    const estoqueAtual = Number(produto.saldo ?? 0);
    const estoqueMinimo = Number(produto.estoqueMinimo ?? 0);

    return estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo;
  });

  const alertasEstoqueOrdenados = ordenacaoAlertas.ordenar(
    [
      ...insumosAbaixoMinimo.map((insumo) => {
        const estoqueAtual = Number(insumo.estoqueAtual ?? insumo.estoque ?? 0);
        const estoqueMinimo = Number(insumo.estoqueMinimo ?? 0);

        return {
          id: insumo.id,
          tipo: "Insumo",
          item: insumo.nome || "",
          estoqueAtual,
          estoqueMinimo,
          situacao: "Estoque baixo",
        };
      }),
      ...produtosAbaixoMinimo.map((produto) => {
        const estoqueAtual = Number(produto.saldo ?? 0);
        const estoqueMinimo = Number(produto.estoqueMinimo ?? 0);

        return {
          id: produto.id || produto.produto,
          tipo: "Produto",
          item: produto.produto || "",
          estoqueAtual,
          estoqueMinimo,
          situacao: "Estoque baixo",
        };
      }),
    ],
    (item, chave) => {
      const valores = {
        tipo: item.tipo,
        item: item.item,
        estoqueAtual: item.estoqueAtual,
        estoqueMinimo: item.estoqueMinimo,
        situacao: item.situacao,
      };

      return valores[chave] ?? "";
    }
  );

  const vendasTabelaOrdenadas = ordenacaoVendas.ordenar(
    vendasFiltradas.map((venda) => {
      const total = Number(venda.total ?? 0);
      const custo = Number(venda.custoTotal ?? 0);
      const margem = total > 0 ? ((total - custo) / total) * 100 : 0;

      return {
        venda,
        total,
        custo,
        margem,
      };
    }),
    (item, chave) => {
      const valores = {
        data: item.venda.data || "",
        pedido: item.venda.numeroPedido || "",
        cliente: item.venda.cliente || "",
        total: item.total,
        custo: item.custo,
        margem: item.margem,
      };

      return valores[chave] ?? "";
    }
  );

  const renderCabecalhoOrdenavel = (label, chave, sort) => {
    const ativo = sort.ativo(chave);

    return (
      <button
        type="button"
        className={ativo ? "table-sort-button active" : "table-sort-button"}
        onClick={() => sort.ordenarPor(chave)}
      >
        <span>{label}</span>
        {ativo && <span aria-hidden="true">{sort.indicador(chave)}</span>}
      </button>
    );
  };

  // ================================
  // 🔹 DRE GERENCIAL
  // ================================
  const despesasPorCategoria = despesasFiltradas.reduce((acc, despesa) => {
    const categoria = despesa.categoria || "Outros";
    const valor = Number(despesa.valor ?? 0);

    if (!acc[categoria]) {
      acc[categoria] = 0;
    }

    acc[categoria] += valor;

    return acc;
  }, {});

  const receitaBruta = vendasFiltradas.reduce(
    (total, venda) => total + Number(venda.valorBruto ?? venda.total ?? 0),
    0
  );

  const descontosVendas = vendasFiltradas.reduce(
    (total, venda) => total + Number(venda.desconto ?? 0),
    0
  );

  const receitaLiquida = receitaBruta - descontosVendas;

  const resultadoLiquido = lucroBruto - totalDespesas;

  const margemLiquida =
    receitaLiquida > 0 ? (resultadoLiquido / receitaLiquida) * 100 : 0;

  // ================================
  // 🔹 EMPRESA ATIVA PARA PDF
  // ================================
  const empresaAtiva = (empresas || []).find(
    (empresa) => empresa.id === empresaId
  );

  const dadosEmpresaPDF = {
  nome:
    configuracoes?.empresa?.nome ||
    empresaAtiva?.nome ||
    NOME_SAAS,

  cnpj:
    configuracoes?.empresa?.cnpj ||
    empresaAtiva?.cnpj ||
    "CNPJ não informado",

  cidade:
    configuracoes?.empresa?.cidade ||
    empresaAtiva?.cidade ||
    "Cidade não informada",

  telefone:
    configuracoes?.empresa?.telefone ||
    empresaAtiva?.telefone ||
    "",

  email:
    configuracoes?.empresa?.email ||
    empresaAtiva?.email ||
    "",

  logoBase64:
    configuracoes?.empresa?.logoBase64 ||
    empresaAtiva?.logoBase64 ||
    "",

  saasNome: NOME_SAAS,
};

  // ================================
  // 🔹 RELATÓRIOS DISPONÍVEIS
  // ================================
  const relatoriosDisponiveis = [
    {
      tipo: "vendas",
      titulo: "Relatório de Vendas",
      descricao: "Resumo de pedidos, clientes, itens vendidos, receita e margem.",
      status: "Disponível",
    },
    {
      tipo: "financeiro",
      titulo: "Relatório Financeiro",
      descricao: "Entradas, saídas, saldo, despesas pendentes e fluxo de caixa.",
      status: "Disponível",
    },
    {
      tipo: "dre",
      titulo: "DRE Gerencial",
      descricao: "Receita, custos, despesas, lucro bruto e resultado líquido.",
      status: "Disponível",
    },
    {
      tipo: "estoque",
      titulo: "Relatório de Estoque",
      descricao: "Produtos e insumos com estoque atual, mínimo e alertas.",
      status: "Disponível",
    },
    {
      tipo: "producao",
      titulo: "Relatório de Produção",
      descricao: "Produções realizadas, custo real e quantidade produzida.",
      status: "Disponível",
    },
    {
      tipo: "insumos",
      titulo: "Relatório de Insumos",
      descricao: "Compras, consumo, estoque e custo médio dos insumos.",
      status: "Disponível",
    },
  ];

  // ================================
  // 🔹 PDF - CONVERTER LOGO PARA BASE64
  // ================================
  const carregarImagemBase64 = async (imagemUrl) => {
    const response = await fetch(imagemUrl);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;

      reader.readAsDataURL(blob);
    });
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

  const periodoPDF =
    filtro.inicio || filtro.fim
      ? `${filtro.inicio ? dataBR(filtro.inicio) : "Início"} até ${
          filtro.fim ? dataBR(filtro.fim) : "Hoje"
        }`
      : "Todos os registros";

  const dataGeracaoPDF = new Date().toLocaleString("pt-BR");

  const getClasseIndustrialLabel = (valor) => {
    const classes = {
      produto_acabado: "Produto acabado",
      semiacabado: "Semiacabado",
      materia_prima: "Matéria-prima",
      embalagem: "Embalagem",
      servico: "Serviço",
      outro: "Outro",
    };

    return classes[String(valor || "produto_acabado")] || "Produto acabado";
  };

  const getTipoEstoqueProduto = (produto = {}) => {
    const classe = String(produto.classeIndustrial || "produto_acabado");
    if (classe === "semiacabado") return "Semiacabado";
    if (classe === "produto_acabado") return "Produto acabado";
    return "Outro produto";
  };

  const desenharTextoLimitado = (doc, texto, x, y, largura, options = {}) => {
    const linhas = doc.splitTextToSize(textoPDF(texto), largura);
    doc.text(linhas, x, y, options);
    return y + linhas.length * 4;
  };

  const gerarCabecalhoPDF = async (doc, titulo, subtitulo = "") => {
    doc.setFillColor(...PDF_COLORS.navy);
    doc.rect(0, 0, PDF_WIDTH, 42, "F");
    doc.setFillColor(...PDF_COLORS.blue);
    doc.rect(0, 40, PDF_WIDTH, 2, "F");

    try {
      const logoPDF =
        dadosEmpresaPDF.logoBase64 || (await carregarImagemBase64(saasLogo));
      const tipoLogoPDF = String(logoPDF).includes("image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(logoPDF, tipoLogoPDF, PDF_MARGIN, 8, 28, 18);
    } catch (error) {
      console.error("Erro ao carregar logo no PDF:", error);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(textoPDF(dadosEmpresaPDF.nome), 48, 12);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`CNPJ: ${textoPDF(dadosEmpresaPDF.cnpj)}`, 48, 19);
    doc.text(`Cidade: ${textoPDF(dadosEmpresaPDF.cidade)}`, 48, 25);
    doc.text(`Contato: ${textoPDF(dadosEmpresaPDF.telefone)}`, 48, 31);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Gerado pelo Renovar ERP", 145, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`E-mail: ${textoPDF(dadosEmpresaPDF.email)}`, 145, 19);
    doc.text(`Geração: ${dataGeracaoPDF}`, 145, 25);
    doc.text(`Período: ${periodoPDF}`, 145, 31);

    doc.setTextColor(...PDF_COLORS.navy);
    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.text(titulo, PDF_MARGIN, 54);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.slate);
    desenharTextoLimitado(
      doc,
      subtitulo || "Relatório executivo gerado automaticamente pelo Renovar ERP.",
      PDF_MARGIN,
      61,
      PDF_CONTENT_WIDTH
    );

    return 72;
  };

  const desenharCardsPDF = (doc, cards = [], startY = 72) => {
    const cardsPorLinha = 3;
    const gap = 5;
    const cardW = (PDF_CONTENT_WIDTH - gap * (cardsPorLinha - 1)) / cardsPorLinha;
    const cardH = 24;

    cards.forEach((card, index) => {
      const linha = Math.floor(index / cardsPorLinha);
      const coluna = index % cardsPorLinha;
      const x = PDF_MARGIN + coluna * (cardW + gap);
      const y = startY + linha * (cardH + gap);
      const cor = card.color || PDF_COLORS.blue;

      doc.setDrawColor(...PDF_COLORS.border);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");
      doc.setFillColor(...cor);
      doc.roundedRect(x, y, 3, cardH, 2, 2, "F");

      doc.setTextColor(...PDF_COLORS.slate);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text(textoPDF(card.label).toUpperCase(), x + 6, y + 7);

      doc.setTextColor(...PDF_COLORS.navy);
      doc.setFontSize(13);
      doc.text(textoPDF(card.value), x + 6, y + 15);

      if (card.detail) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...PDF_COLORS.slate);
        doc.text(textoPDF(card.detail), x + 6, y + 21);
      }
    });

    return startY + Math.ceil(cards.length / cardsPorLinha) * (cardH + gap) + 4;
  };

  const desenharAvisoPDF = (doc, texto, startY, color = PDF_COLORS.amber) => {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(PDF_MARGIN, startY, PDF_CONTENT_WIDTH, 16, 2, 2, "FD");
    doc.setTextColor(...color);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text(texto, PDF_MARGIN + 4, startY + 10);
    return startY + 22;
  };

  const tabelaPDF = (doc, { startY, head, body, columnStyles = {}, didParseCell }) => {
    const totalColunas = head?.[0]?.length || 1;
    const corpo = body.length > 0
      ? body
      : [
          [
            "Nenhum registro encontrado",
            ...Array.from({ length: Math.max(totalColunas - 1, 0) }, () => ""),
          ],
        ];

    autoTable(doc, {
      startY,
      head,
      body: corpo,
      theme: "grid",
      margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 26 },
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
      columnStyles,
      didParseCell,
    });

    return doc.lastAutoTable.finalY;
  };

  const gerarRodapePDF = (doc) => {
    const totalPaginas = doc.internal.getNumberOfPages();

    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      const pageHeight = doc.internal.pageSize.height;

      doc.setDrawColor(...PDF_COLORS.border);
      doc.line(PDF_MARGIN, pageHeight - 18, 196, pageHeight - 18);

      doc.setFontSize(7.5);
      doc.setTextColor(...PDF_COLORS.slate);
      doc.text("Renovar ERP SaaS", PDF_MARGIN, pageHeight - 12);
      doc.text(
        "Documento gerado automaticamente pelo Renovar ERP",
        PDF_MARGIN,
        pageHeight - 7
      );
      doc.text(`Geração: ${dataGeracaoPDF}`, 116, pageHeight - 12);
      doc.text(`Página ${i} de ${totalPaginas}`, 170, pageHeight - 7);
    }
  };

  // ================================
  // 🔹 GERAR RELATÓRIOS EM PDF
  // ================================
  const gerarRelatorioPDF = async (tipo) => {
    if (tipo === "dre" && !podeUsarDRE) {
      showToast("Recurso disponível no plano Profissional.", "warning");
      return;
    }

    if (!podeGerarPDF) {
      showToast("Recurso disponível no plano Profissional.", "warning");
      return;
    }

    const doc = new jsPDF();

    if (tipo === "vendas") {
      let y = await gerarCabecalhoPDF(
        doc,
        "Relatório de Vendas",
        "Resumo executivo de pedidos, clientes, receita, custo, lucro e margem no período selecionado."
      );
      const lucroTotalVendas = totalVendas - custoProdutosVendidos;
      const ticketMedio =
        vendasFiltradas.length > 0 ? totalVendas / vendasFiltradas.length : 0;
      const margemMediaVendas =
        totalVendas > 0 ? (lucroTotalVendas / totalVendas) * 100 : 0;

      y = desenharCardsPDF(
        doc,
        [
          { label: "Total vendido", value: moedaBR(totalVendas), color: PDF_COLORS.green },
          { label: "Pedidos", value: inteiroBR(vendasFiltradas.length), color: PDF_COLORS.blue },
          { label: "Ticket médio", value: moedaBR(ticketMedio), color: PDF_COLORS.blue },
          { label: "Custo total", value: moedaBR(custoProdutosVendidos), color: PDF_COLORS.amber },
          {
            label: "Lucro / margem",
            value: moedaBR(lucroTotalVendas),
            detail: `${numeroBR(margemMediaVendas, 2)}%`,
            color: lucroTotalVendas >= 0 ? PDF_COLORS.green : PDF_COLORS.red,
          },
        ],
        y
      );

      tabelaPDF(doc, {
        startY: y,
        head: [["Data", "Pedido", "Cliente", "Total", "Custo", "Lucro", "Margem"]],
        body: vendasFiltradas.map((venda) => {
          const total = numeroSeguro(venda.total);
          const custo = numeroSeguro(venda.custoTotal);
          const lucro = total - custo;
          const margem = total > 0 ? ((total - custo) / total) * 100 : 0;

          return [
            dataBR(venda.data),
            textoPDF(venda.numeroPedido),
            textoPDF(venda.cliente, "Cliente não informado"),
            moedaBR(total),
            moedaBR(custo),
            moedaBR(lucro),
            `${numeroBR(margem, 2)}%`,
          ];
        }),
        columnStyles: {
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
        },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-vendas-renovar-erp.pdf");
      return;
    }

    if (tipo === "financeiro") {
      let y = await gerarCabecalhoPDF(
        doc,
        "Relatório Financeiro",
        "Visão operacional de entradas, saídas, custos e margem. O saldo apresentado é gerencial, não necessariamente bancário."
      );

      y = desenharCardsPDF(
        doc,
        [
          { label: "Total de vendas", value: moedaBR(totalVendas), color: PDF_COLORS.green },
          { label: "Despesas", value: moedaBR(totalDespesas), color: PDF_COLORS.red },
          {
            label: "Saldo operacional",
            value: moedaBR(saldoFinanceiro),
            color: saldoFinanceiro >= 0 ? PDF_COLORS.green : PDF_COLORS.red,
          },
          { label: "CPV", value: moedaBR(custoProdutosVendidos), color: PDF_COLORS.amber },
          { label: "Margem bruta", value: `${numeroBR(margemBruta, 2)}%`, color: PDF_COLORS.blue },
        ],
        y
      );
      y = desenharAvisoPDF(
        doc,
        "Saldo financeiro operacional: pode divergir do saldo bancário real sem conciliação.",
        y
      );

      tabelaPDF(doc, {
        startY: y,
        head: [["Indicador", "Valor"]],
        body: [
          ["Total de Vendas", moedaBR(totalVendas)],
          ["Total de Despesas", moedaBR(totalDespesas)],
          ["Saldo Financeiro", moedaBR(saldoFinanceiro)],
          ["Custo dos Produtos Vendidos", moedaBR(custoProdutosVendidos)],
          ["Lucro Bruto", moedaBR(lucroBruto)],
          ["Margem Bruta", `${numeroBR(margemBruta, 2)}%`],
        ],
        columnStyles: {
          1: { halign: "right" },
        },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-financeiro-renovar-erp.pdf");
      return;
    }

    if (tipo === "dre") {
      let y = await gerarCabecalhoPDF(
        doc,
        "DRE Gerencial - Demonstrativo de Resultado",
        "Leitura gerencial de receita, descontos, custos, despesas, resultado e margens no período selecionado."
      );

      y = desenharCardsPDF(
        doc,
        [
          { label: "Receita líquida", value: moedaBR(receitaLiquida), color: PDF_COLORS.blue },
          { label: "Lucro bruto", value: moedaBR(lucroBruto), color: PDF_COLORS.green },
          {
            label: "Resultado líquido",
            value: moedaBR(resultadoLiquido),
            color: resultadoLiquido >= 0 ? PDF_COLORS.green : PDF_COLORS.red,
          },
          { label: "Margem bruta", value: `${numeroBR(margemBruta, 2)}%`, color: PDF_COLORS.blue },
          { label: "Margem líquida", value: `${numeroBR(margemLiquida, 2)}%`, color: PDF_COLORS.amber },
        ],
        y
      );

      tabelaPDF(doc, {
        startY: y,
        head: [["Descrição", "Valor"]],
        body: [
          ["Receita Bruta", moedaBR(receitaBruta)],
          ["(-) Descontos Concedidos", moedaBR(descontosVendas)],
          ["= Receita Líquida", moedaBR(receitaLiquida)],
          ["(-) Custo dos Produtos Vendidos", moedaBR(custoProdutosVendidos)],
          ["= Lucro Bruto", moedaBR(lucroBruto)],
          ["(-) Despesas Operacionais", moedaBR(totalDespesas)],
          ["= Resultado Líquido", moedaBR(resultadoLiquido)],
          ["Margem Bruta", `${numeroBR(margemBruta, 2)}%`],
          ["Margem Líquida", `${numeroBR(margemLiquida, 2)}%`],
        ],
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section !== "body" || data.column.index !== 1) return;
          const descricao = String(data.row.raw?.[0] || "");
          if (descricao.includes("Resultado Líquido")) {
            data.cell.styles.textColor =
              resultadoLiquido >= 0 ? PDF_COLORS.green : PDF_COLORS.red;
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      y = doc.lastAutoTable.finalY + 10;

      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text("Despesas por Categoria", 14, y);

      tabelaPDF(doc, {
        startY: y + 6,
        head: [["Categoria", "Valor"]],
        body:
          Object.entries(despesasPorCategoria).length > 0
            ? Object.entries(despesasPorCategoria).map(([categoria, valor]) => [
                categoria,
                moedaBR(valor),
              ])
            : [["Nenhuma despesa no período", moedaBR(0)]],
        columnStyles: {
          1: { halign: "right" },
        },
      });

      gerarRodapePDF(doc);
      doc.save("dre-gerencial-renovar-erp.pdf");
      return;
    }

    if (tipo === "estoque") {
      let y = await gerarCabecalhoPDF(
        doc,
        "Relatório de Estoque",
        "Saldos gerenciais de insumos, semiacabados, produtos acabados e alertas de estoque."
      );

      const valorTotalInsumos = insumosEstoqueCalculado.reduce(
        (total, insumo) => total + numeroSeguro(insumo.valorEstoque),
        0
      );
      const valorTotalProdutosAcabados = produtosEstoqueCalculado
        .filter((produto) => getTipoEstoqueProduto(produto) === "Produto acabado")
        .reduce((total, produto) => total + numeroSeguro(produto.valorEstoque), 0);
      const itensAbaixoMinimo =
        insumosAbaixoMinimo.length + produtosAbaixoMinimo.length;
      const itensZerados =
        insumosEstoqueCalculado.filter((insumo) => numeroSeguro(insumo.saldo) <= 0)
          .length +
        produtosEstoqueCalculado.filter((produto) => numeroSeguro(produto.saldo) <= 0)
          .length;

      y = desenharCardsPDF(
        doc,
        [
          { label: "Valor em insumos", value: moedaBR(valorTotalInsumos), color: PDF_COLORS.blue },
          {
            label: "Produtos acabados",
            value: moedaBR(valorTotalProdutosAcabados),
            color: PDF_COLORS.green,
          },
          { label: "Abaixo do mínimo", value: inteiroBR(itensAbaixoMinimo), color: PDF_COLORS.amber },
          { label: "Itens zerados", value: inteiroBR(itensZerados), color: PDF_COLORS.red },
        ],
        y
      );

      const itensEstoque = [
        ...insumosEstoqueCalculado.map((insumo) => {
          const cadastro = (insumos || []).find(
            (item) => item.id === insumo.insumoId || item.nome === insumo.nome
          );
          const estoqueAtual = numeroSeguro(insumo.saldo);
          const estoqueMinimo = numeroSeguro(cadastro?.estoqueMinimo);

          return [
            "Insumo",
            textoPDF(insumo.nome),
            numeroBR(estoqueAtual, 2),
            numeroBR(estoqueMinimo, 2),
            estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo
              ? "Estoque baixo"
              : "OK",
            moedaBR(numeroSeguro(insumo.valorEstoque)),
          ];
        }),
        ...produtosEstoqueCalculado.map((produto) => {
          const estoqueAtual = numeroSeguro(produto.saldo);
          const estoqueMinimo = numeroSeguro(produto.estoqueMinimo);

          return [
            getTipoEstoqueProduto(produto),
            textoPDF(produto.produto),
            numeroBR(estoqueAtual, 2),
            numeroBR(estoqueMinimo, 2),
            estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo
              ? "Estoque baixo"
              : "OK",
            moedaBR(numeroSeguro(produto.valorEstoque)),
          ];
        }),
      ];

      tabelaPDF(doc, {
        startY: y,
        head: [["Tipo", "Item", "Estoque Atual", "Estoque Mínimo", "Situação", "Valor"]],
        body: itensEstoque,
        columnStyles: {
          2: { halign: "right" },
          3: { halign: "right" },
          5: { halign: "right" },
        },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-estoque-renovar-erp.pdf");
      return;
    }

    if (tipo === "producao") {
      let y = await gerarCabecalhoPDF(
        doc,
        "Relatório de Produção",
        "Produções realizadas, volumes fabricados, custo total, custo unitário e classificação industrial."
      );
      const custoTotalProduzido = producoesFiltradas.reduce(
        (total, producao) => total + numeroSeguro(producao.custoTotal),
        0
      );
      const custoMedioProducao =
        totalProduzido > 0 ? custoTotalProduzido / totalProduzido : 0;

      y = desenharCardsPDF(
        doc,
        [
          { label: "Total produzido", value: inteiroBR(totalProduzido), color: PDF_COLORS.blue },
          { label: "Custo total", value: moedaBR(custoTotalProduzido), color: PDF_COLORS.amber },
          { label: "Custo médio", value: moedaBR(custoMedioProducao), color: PDF_COLORS.green },
          { label: "Registros", value: inteiroBR(producoesFiltradas.length), color: PDF_COLORS.blue },
        ],
        y
      );

      tabelaPDF(doc, {
        startY: y,
        head: [["Data", "Produto", "Quantidade", "Custo Total", "Custo Unit.", "Classe"]],
        body: producoesFiltradas.map((producao) => {
          const produtoCadastro =
            produtosPorId.get(producao.produtoId) ||
            (produtos || []).find(
              (produto) =>
                produto.codigo === producao.codigo ||
                produto.nome === producao.nomeProduto
            );
          return [
            dataBR(producao.data),
            textoPDF(producao.produtoNome || producao.produto),
            inteiroBR(numeroSeguro(producao.quantidade)),
            moedaBR(numeroSeguro(producao.custoTotal)),
            moedaBR(numeroSeguro(producao.custoUnitario)),
            getClasseIndustrialLabel(produtoCadastro?.classeIndustrial),
          ];
        }),
        columnStyles: {
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
        },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-producao-renovar-erp.pdf");
      return;
    }

    if (tipo === "insumos") {
      let y = await gerarCabecalhoPDF(
        doc,
        "Relatório de Insumos",
        "Controle de matérias-primas, estoque atual, custo médio, valor em estoque e itens críticos."
      );
      const valorTotalEstoqueInsumos = insumosEstoqueCalculado.reduce(
        (total, insumo) => total + numeroSeguro(insumo.valorEstoque),
        0
      );
      const insumosZerados = insumosEstoqueCalculado.filter(
        (insumo) => numeroSeguro(insumo.saldo) <= 0
      ).length;
      const insumosCriticos = insumosEstoqueCalculado.filter((insumo) => {
        const cadastro = (insumos || []).find(
          (item) => item.id === insumo.insumoId || item.nome === insumo.nome
        );
        const minimo = numeroSeguro(cadastro?.estoqueMinimo);
        return minimo > 0 && numeroSeguro(insumo.saldo) <= minimo;
      }).length;

      y = desenharCardsPDF(
        doc,
        [
          { label: "Total de insumos", value: inteiroBR(insumosEstoqueCalculado.length), color: PDF_COLORS.blue },
          { label: "Valor em estoque", value: moedaBR(valorTotalEstoqueInsumos), color: PDF_COLORS.green },
          { label: "Zerados", value: inteiroBR(insumosZerados), color: PDF_COLORS.red },
          { label: "Críticos", value: inteiroBR(insumosCriticos), color: PDF_COLORS.amber },
        ],
        y
      );

      tabelaPDF(doc, {
        startY: y,
        head: [["Insumo", "Estoque atual", "Estoque mínimo", "Custo médio", "Valor em estoque", "Status"]],
        body: insumosEstoqueCalculado.map((insumo) => {
          const cadastro = (insumos || []).find(
            (item) => item.id === insumo.insumoId || item.nome === insumo.nome
          );
          const estoqueAtual = numeroSeguro(insumo.saldo);
          const estoqueMinimo = numeroSeguro(cadastro?.estoqueMinimo);
          const status =
            estoqueAtual <= 0
              ? "Zerado"
              : estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo
              ? "Crítico"
              : "OK";

          return [
            textoPDF(insumo.nome),
            numeroBR(estoqueAtual, 2),
            numeroBR(estoqueMinimo, 2),
            moedaBR(numeroSeguro(insumo.custoMedio)),
            moedaBR(numeroSeguro(insumo.valorEstoque)),
            status,
          ];
        }),
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
        },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-insumos-renovar-erp.pdf");
    }
  };

  return (
    <div className="reports-page">
      <h1 className="page-title">Relatórios</h1>

      {/* ================================
          🔹 FILTROS
      ================================= */}
      <div className="card reports-filter-card">
        <h3>Filtros dos Relatórios</h3>

        <div className="reports-filter-grid">
          <input
            type="date"
            value={filtro.inicio}
            onChange={(e) => setFiltro({ ...filtro, inicio: e.target.value })}
          />

          <input
            type="date"
            value={filtro.fim}
            onChange={(e) => setFiltro({ ...filtro, fim: e.target.value })}
          />

          <button onClick={() => setFiltro({ inicio: "", fim: "" })}>
            Limpar Filtro
          </button>
        </div>
      </div>

      {/* ================================
          🔹 INDICADORES PRINCIPAIS
      ================================= */}
      <div className="reports-summary-grid">
        <div className="card reports-metric-card reports-metric-green">
          <p>Vendas</p>
          <h2>{moedaBR(totalVendas)}</h2>
          <small>{inteiroBR(vendasFiltradas.length)} vendas no período</small>
        </div>

        <div className="card reports-metric-card reports-metric-red">
          <p>Despesas</p>
          <h2>{moedaBR(totalDespesas)}</h2>
          <small>Saídas no período</small>
        </div>

        <div className="card reports-metric-card reports-metric-blue">
          <p>Saldo</p>
          <h2 className={saldoFinanceiro >= 0 ? "text-blue" : "text-red"}>
            {moedaBR(saldoFinanceiro)}
          </h2>
          <small>Vendas - despesas</small>
        </div>

        <div className="card reports-metric-card reports-metric-amber">
          <p>Margem Bruta</p>
          <h2>{numeroBR(margemBruta, 2)}%</h2>
          <small>Lucro bruto sobre vendas</small>
        </div>
      </div>

      {/* ================================
          🔹 INDICADORES OPERACIONAIS
      ================================= */}
      <div className="reports-summary-grid">
        <div className="card reports-metric-card">
          <p>Itens Vendidos</p>
          <h2>{inteiroBR(totalItensVendidos)}</h2>
          <small>Quantidade total vendida</small>
        </div>

        <div className="card reports-metric-card">
          <p>Produção</p>
          <h2>{inteiroBR(totalProduzido)}</h2>
          <small>Quantidade produzida no período</small>
        </div>

        <div className="card reports-metric-card">
          <p>Insumos em Alerta</p>
          <h2 className="text-red">{inteiroBR(insumosAbaixoMinimo.length)}</h2>
          <small>Abaixo ou igual ao estoque mínimo</small>
        </div>

        <div className="card reports-metric-card">
          <p>Produtos em Alerta</p>
          <h2 className="text-red">{inteiroBR(produtosAbaixoMinimo.length)}</h2>
          <small>Abaixo ou igual ao estoque mínimo</small>
        </div>
      </div>

      {/* ================================
          🔹 CENTRAL DE RELATÓRIOS
      ================================= */}
      <div className="card">
        <h3>Central de Relatórios</h3>

        <div className="reports-list-grid">
          {relatoriosDisponiveis.map((relatorio) => (
            <div key={relatorio.tipo} className="reports-report-card">
              <div>
                <h3>{relatorio.titulo}</h3>
                <p>{relatorio.descricao}</p>
              </div>

              <div className="reports-report-actions">
                <span>{relatorio.status}</span>

                <button
                  type="button"
                  className="reports-report-button"
                  onClick={() => gerarRelatorioPDF(relatorio.tipo)}
                >
                  Ver relatório
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================================
          🔹 ALERTAS DE ESTOQUE
      ================================= */}
      <div className="card">
        <h3>Alertas de Estoque</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Tipo", "tipo", ordenacaoAlertas)}</th>
              <th>{renderCabecalhoOrdenavel("Item", "item", ordenacaoAlertas)}</th>
              <th>{renderCabecalhoOrdenavel("Estoque Atual", "estoqueAtual", ordenacaoAlertas)}</th>
              <th>{renderCabecalhoOrdenavel("Estoque Mínimo", "estoqueMinimo", ordenacaoAlertas)}</th>
              <th>{renderCabecalhoOrdenavel("Situação", "situacao", ordenacaoAlertas)}</th>
            </tr>
          </thead>

          <tbody>
            {alertasEstoqueOrdenados.map((alerta, index) => (
              <tr key={`${alerta.tipo}-${alerta.id || index}`}>
                <td>{alerta.tipo}</td>
                <td>{alerta.item}</td>
                <td>{numeroBR(alerta.estoqueAtual, 2)}</td>
                <td>{numeroBR(alerta.estoqueMinimo, 2)}</td>
                <td className="text-red strong">{alerta.situacao}</td>
              </tr>
            ))}

            {insumosAbaixoMinimo.length === 0 &&
              produtosAbaixoMinimo.length === 0 && (
                <tr>
                  <td colSpan="5">Nenhum item abaixo do estoque mínimo.</td>
                </tr>
              )}
          </tbody>
        </table>
      </div>

      {/* ================================
          🔹 ÚLTIMAS VENDAS
      ================================= */}
      <div className="card">
        <h3>Últimas Vendas no Período</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Data", "data", ordenacaoVendas)}</th>
              <th>{renderCabecalhoOrdenavel("Pedido", "pedido", ordenacaoVendas)}</th>
              <th>{renderCabecalhoOrdenavel("Cliente", "cliente", ordenacaoVendas)}</th>
              <th>{renderCabecalhoOrdenavel("Total", "total", ordenacaoVendas)}</th>
              <th>{renderCabecalhoOrdenavel("Custo", "custo", ordenacaoVendas)}</th>
              <th>{renderCabecalhoOrdenavel("Margem", "margem", ordenacaoVendas)}</th>
            </tr>
          </thead>

          <tbody>
            {/* Mostra apenas as 10 primeiras vendas para evitar sobrecarregar a tabela */}
            {vendasTabelaOrdenadas.slice(0, 10).map(({
              venda,
              total,
              custo,
              margem,
            }) => {
              return (
                <tr key={venda.id}>
                  <td>{dataBR(venda.data)}</td>
                  <td>{venda.numeroPedido || "-"}</td>
                  <td>{venda.cliente || "Cliente não informado"}</td>
                  <td>{moedaBR(total)}</td>
                  <td>{moedaBR(custo)}</td>
                  <td>{numeroBR(margem, 2)}%</td>
                </tr>
              );
            })}

            {vendasFiltradas.length === 0 && (
              <tr>
                <td colSpan="6">Nenhuma venda encontrada no período.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
