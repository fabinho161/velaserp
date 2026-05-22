import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { usePlano } from "../hooks/usePlano";
import { useTableSort } from "../hooks/useTableSort";
import { moedaBR, inteiroBR, dataBR, numeroBR } from "../utils/formatters";
import { calcularEstoqueProdutos } from "../utils/estoqueProdutos";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import saasLogo from "../assets/saas-logo.png";

const NOME_SAAS = "Renovar ERP";

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

 // ================================
// 🔹 PDF - CABEÇALHO MULTIEMPRESA
// ================================
const gerarCabecalhoPDF = async (doc, titulo) => {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 34, "F");

  try {
    // Usa primeiro a logo salva em Base64 da empresa.
    // Se não existir, usa a logo padrão do sistema.
    const logoPDF =
      dadosEmpresaPDF.logoBase64 || (await carregarImagemBase64(saasLogo));
    const tipoLogoPDF = String(logoPDF).includes("image/jpeg") ? "JPEG" : "PNG";

    doc.addImage(logoPDF, tipoLogoPDF, 14, 6, 34, 20);
  } catch (error) {
    console.error("Erro ao carregar logo no PDF:", error);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(dadosEmpresaPDF.nome, 55, 12);

  doc.setFontSize(9);
  doc.text(`CNPJ: ${dadosEmpresaPDF.cnpj}`, 55, 19);
  doc.text(`Cidade: ${dadosEmpresaPDF.cidade}`, 55, 25);

  if (dadosEmpresaPDF.telefone) {
    doc.text(`Contato: ${dadosEmpresaPDF.telefone}`, 130, 25);
  }

  if (dadosEmpresaPDF.email) {
    doc.text(`E-mail: ${dadosEmpresaPDF.email}`, 130, 19);
  }

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.text(titulo, 14, 44);

  const periodo =
    filtro.inicio || filtro.fim
      ? `Período: ${filtro.inicio ? dataBR(filtro.inicio) : "Início"} até ${
          filtro.fim ? dataBR(filtro.fim) : "Hoje"
        }`
      : "Período: Todos os registros";

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(periodo, 14, 51);
};
  // ================================
  // 🔹 PDF - RODAPÉ MULTIEMPRESA
  // ================================
  const gerarRodapePDF = (doc) => {
    const totalPaginas = doc.internal.getNumberOfPages();

    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);

      const pageHeight = doc.internal.pageSize.height;

      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 16, 196, pageHeight - 16);

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);

      doc.text(
        `${dadosEmpresaPDF.nome} | CNPJ: ${dadosEmpresaPDF.cnpj}`,
        14,
        pageHeight - 10
      );

      doc.text(
        `Gerado pelo ${dadosEmpresaPDF.saasNome}`,
        14,
        pageHeight - 5
      );

      doc.text(`Página ${i} de ${totalPaginas}`, 170, pageHeight - 10);
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
      await gerarCabecalhoPDF(doc, "Relatório de Vendas");

      autoTable(doc, {
        startY: 55,
        head: [["Data", "Pedido", "Cliente", "Total", "Custo", "Margem"]],
        body: vendasFiltradas.map((venda) => {
          const total = Number(venda.total ?? 0);
          const custo = Number(venda.custoTotal ?? 0);
          const margem = total > 0 ? ((total - custo) / total) * 100 : 0;

          return [
            dataBR(venda.data),
            venda.numeroPedido || "-",
            venda.cliente || "Cliente não informado",
            moedaBR(total),
            moedaBR(custo),
            `${numeroBR(margem, 2)}%`,
          ];
        }),
        headStyles: { fillColor: [37, 99, 235] },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-vendas-renovar-erp.pdf");
      return;
    }

    if (tipo === "financeiro") {
      await gerarCabecalhoPDF(doc, "Relatório Financeiro");

      autoTable(doc, {
        startY: 55,
        head: [["Indicador", "Valor"]],
        body: [
          ["Total de Vendas", moedaBR(totalVendas)],
          ["Total de Despesas", moedaBR(totalDespesas)],
          ["Saldo Financeiro", moedaBR(saldoFinanceiro)],
          ["Custo dos Produtos Vendidos", moedaBR(custoProdutosVendidos)],
          ["Lucro Bruto", moedaBR(lucroBruto)],
          ["Margem Bruta", `${numeroBR(margemBruta, 2)}%`],
        ],
        headStyles: { fillColor: [37, 99, 235] },
        columnStyles: {
          1: { halign: "right" },
        },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-financeiro-renovar-erp.pdf");
      return;
    }

    if (tipo === "dre") {
      await gerarCabecalhoPDF(
        doc,
        "DRE Gerencial - Demonstrativo de Resultado"
      );

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text("Resumo gerencial do resultado financeiro da empresa.", 14, 55);

      autoTable(doc, {
        startY: 63,
        head: [["Descrição", "Valor"]],
        body: [
          ["Receita Bruta", moedaBR(receitaBruta)],
          ["(-) Descontos Concedidos", moedaBR(descontosVendas)],
          ["= Receita Líquida", moedaBR(receitaLiquida)],
          ["(-) Custo dos Produtos Vendidos", moedaBR(custoProdutosVendidos)],
          ["= Lucro Bruto", moedaBR(lucroBruto)],
          ["(-) Despesas Operacionais", moedaBR(totalDespesas)],
          ["= Resultado Líquido", moedaBR(resultadoLiquido)],
        ],
        styles: {
          fontSize: 10,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: "bold",
        },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "right" },
        },
      });

      let y = doc.lastAutoTable.finalY + 10;

      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text("Despesas por Categoria", 14, y);

      autoTable(doc, {
        startY: y + 6,
        head: [["Categoria", "Valor"]],
        body:
          Object.entries(despesasPorCategoria).length > 0
            ? Object.entries(despesasPorCategoria).map(([categoria, valor]) => [
                categoria,
                moedaBR(valor),
              ])
            : [["Nenhuma despesa no período", moedaBR(0)]],
        styles: {
          fontSize: 10,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: 255,
          fontStyle: "bold",
        },
        columnStyles: {
          1: { halign: "right" },
        },
      });

      y = doc.lastAutoTable.finalY + 10;

      autoTable(doc, {
        startY: y,
        head: [["Indicador", "Resultado"]],
        body: [
          ["Margem Bruta", `${numeroBR(margemBruta, 2)}%`],
          ["Margem Líquida", `${numeroBR(margemLiquida, 2)}%`],
          [
            "Situação",
            resultadoLiquido >= 0
              ? "Resultado positivo"
              : "Resultado negativo",
          ],
        ],
        styles: {
          fontSize: 10,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: resultadoLiquido >= 0 ? [22, 163, 74] : [220, 38, 38],
          textColor: 255,
          fontStyle: "bold",
        },
        columnStyles: {
          1: { halign: "right" },
        },
      });

      gerarRodapePDF(doc);
      doc.save("dre-gerencial-renovar-erp.pdf");
      return;
    }

    if (tipo === "estoque") {
      await gerarCabecalhoPDF(doc, "Relatório de Estoque");

      const itensEstoque = [
        ...(insumos || []).map((insumo) => {
          const estoqueAtual = Number(insumo.estoqueAtual ?? insumo.estoque ?? 0);
          const estoqueMinimo = Number(insumo.estoqueMinimo ?? 0);

          return [
            "Insumo",
            insumo.nome || "-",
            numeroBR(estoqueAtual, 2),
            numeroBR(estoqueMinimo, 2),
            estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo
              ? "Estoque baixo"
              : "OK",
          ];
        }),
        ...produtosEstoqueCalculado.map((produto) => {
          const estoqueAtual = Number(produto.saldo ?? 0);
          const estoqueMinimo = Number(produto.estoqueMinimo ?? 0);

          return [
            "Produto",
            produto.produto || "-",
            numeroBR(estoqueAtual, 2),
            numeroBR(estoqueMinimo, 2),
            estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo
              ? "Estoque baixo"
              : "OK",
          ];
        }),
      ];

      autoTable(doc, {
        startY: 55,
        head: [["Tipo", "Item", "Estoque Atual", "Estoque Mínimo", "Situação"]],
        body: itensEstoque,
        headStyles: { fillColor: [37, 99, 235] },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-estoque-renovar-erp.pdf");
      return;
    }

    if (tipo === "producao") {
      await gerarCabecalhoPDF(doc, "Relatório de Produção");

      autoTable(doc, {
        startY: 55,
        head: [["Data", "Produto", "Quantidade", "Custo Total"]],
        body: producoesFiltradas.map((producao) => [
          dataBR(producao.data),
          producao.produtoNome || producao.produto || "-",
          inteiroBR(Number(producao.quantidade ?? 0)),
          moedaBR(Number(producao.custoTotal ?? 0)),
        ]),
        headStyles: { fillColor: [37, 99, 235] },
      });

      gerarRodapePDF(doc);
      doc.save("relatorio-producao-renovar-erp.pdf");
      return;
    }

    if (tipo === "insumos") {
      await gerarCabecalhoPDF(doc, "Relatório de Insumos");

      autoTable(doc, {
        startY: 55,
        head: [["Insumo", "Estoque", "Estoque Mínimo", "Custo Médio"]],
        body: (insumos || []).map((insumo) => [
          insumo.nome || "-",
          numeroBR(Number(insumo.estoqueAtual ?? insumo.estoque ?? 0), 2),
          numeroBR(Number(insumo.estoqueMinimo ?? 0), 2),
          moedaBR(Number(insumo.custoMedio ?? insumo.valorUnitario ?? 0)),
        ]),
        headStyles: { fillColor: [37, 99, 235] },
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
