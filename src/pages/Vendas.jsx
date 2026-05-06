import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import { usePlano } from "../hooks/usePlano";
import ActionMenu from "../components/ActionMenu";
import saasLogo from "../assets/saas-logo.png";
import html2pdf from "html2pdf.js";
import { dataBR, numeroBR } from "../utils/formatters";
import {
  calcularEstoqueProdutos as calcularEstoqueProdutosCompartilhado,
  normalizarChaveProduto,
} from "../utils/estoqueProdutos";
import {
  alternarOrdenacao,
  extrairNumeroPedido,
  ordenarPorConfig,
} from "../utils/sortUtils";

const NOME_SAAS = "Renovar ERP";

const STATUS_EXPEDICAO = ["Pendente", "Separado", "Enviado", "Entregue", "Cancelado"];

const STATUS_PAGAMENTO = ["pendente", "pago", "parcial", "cancelado"];

const FORMAS_PAGAMENTO = [
  "pix",
  "dinheiro",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "transferencia",
  "outro",
];

const PAGAMENTO_PADRAO = {
  statusPagamento: "pendente",
  formaPagamento: "",
  dataPagamento: "",
  observacaoPagamento: "",
};

const LABEL_STATUS_PAGAMENTO = {
  pendente: "Pendente",
  pago: "Pago",
  parcial: "Parcial",
  cancelado: "Cancelado",
};

const LABEL_FORMA_PAGAMENTO = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};

export default function Vendas() {
  // ================================
  // 🔹 CONTEXTO GLOBAL DO ERP
  // ================================
  const {
    producoes: producoesContexto = [],
    vendas: vendasContexto = [],
    addItem,
    updateItem,
    deleteItem,
    clientesComerciais: clientesComerciaisContexto = [],
    configuracoes = {},
    empresas = [],
    empresaId,
  } = useERP() || {};
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();
  const { isGratis, limiteVendasMes, podeGerarPDF, podeUsarCRMBasico } = usePlano();

  const producoes = Array.isArray(producoesContexto)
    ? producoesContexto
    : [];

  const vendas = Array.isArray(vendasContexto) ? vendasContexto : [];
  const clientesComerciais = Array.isArray(clientesComerciaisContexto)
    ? clientesComerciaisContexto
    : [];

  const textoSeguro = (valor, fallback = "-") => {
    if (valor === null || valor === undefined || valor === "") return fallback;

    if (typeof valor === "object") {
      const partes = [valor.codigo, valor.nome, valor.tipo].filter(Boolean);
      return partes.length > 0 ? partes.join(" ") : fallback;
    }

    return String(valor);
  };

  const normalizarPagamento = (venda = {}) => ({
    statusPagamento: venda.statusPagamento || PAGAMENTO_PADRAO.statusPagamento,
    formaPagamento: venda.formaPagamento || PAGAMENTO_PADRAO.formaPagamento,
    dataPagamento: venda.dataPagamento || PAGAMENTO_PADRAO.dataPagamento,
    observacaoPagamento:
      venda.observacaoPagamento || PAGAMENTO_PADRAO.observacaoPagamento,
  });

  const obterClasseStatusExpedicao = (status = "Pendente") => {
    const classes = {
      Pendente: "badge-warning",
      Separado: "badge-info",
      Enviado: "badge-purple",
      Entregue: "badge-success",
      Cancelado: "badge-danger",
    };

    return classes[status] || "badge-warning";
  };

  const obterClasseStatusPagamento = (status = "pendente") => {
    const classes = {
      pendente: "badge-warning",
      pago: "badge-success",
      parcial: "badge-info",
      cancelado: "badge-danger",
    };

    return classes[status] || "badge-warning";
  };

  const formatarStatusPagamento = (status) =>
    LABEL_STATUS_PAGAMENTO[status || "pendente"] || "Pendente";

  const formatarFormaPagamento = (forma) =>
    LABEL_FORMA_PAGAMENTO[forma] || "-";

  const empresaAtiva = (empresas || []).find(
    (empresa) => empresa.id === empresaId
  );

  const empresaConfig = configuracoes?.empresa || {};

  const dadosEmpresaPDF = {
    nome: empresaConfig.nome || empresaAtiva?.nome || NOME_SAAS,
    cnpj: empresaConfig.cnpj || empresaAtiva?.cnpj || "CNPJ nao informado",
    cidade: empresaConfig.cidade || empresaAtiva?.cidade || "Cidade nao informada",
    telefone: empresaConfig.telefone || empresaAtiva?.telefone || "",
    email: empresaConfig.email || empresaAtiva?.email || "",
    logoBase64: empresaConfig.logoBase64 || empresaAtiva?.logoBase64 || "",
  };

  // ================================
  // 🔹 DADOS DO PEDIDO
  // ================================
  const [pedido, setPedido] = useState({
    clienteId: "",
    clienteNome: "",
    clienteTelefone: "",
    cliente: "",
    data: "",
    ...PAGAMENTO_PADRAO,
  });

  // ================================
  // 🔹 ITEM TEMPORÁRIO DO PEDIDO
  // ================================
  const [itemAtual, setItemAtual] = useState({
    produto: "",
    quantidade: "",
    margemDesejada: "",
    valorUnitario: "",
    desconto: "",
  });

  // ================================
  // 🔹 LISTA DE ITENS DO PEDIDO
  // ================================
  const [itens, setItens] = useState([]);

  // ================================
  // 🔹 CONTROLE DE EDIÇÃO
  // ================================
  const [editIndex, setEditIndex] = useState(null);
  const [ordenacaoHistorico, setOrdenacaoHistorico] = useState({
    chave: "numeroPedido",
    direcao: "asc",
  });
  const [ordenacaoExpedicao, setOrdenacaoExpedicao] = useState({
    chave: "numeroPedido",
    direcao: "asc",
  });
  const [edicaoExpedicao, setEdicaoExpedicao] = useState({
    index: null,
    status: "",
  });
  const [edicaoPagamento, setEdicaoPagamento] = useState({
    index: null,
    dados: PAGAMENTO_PADRAO,
  });

  const clientesComerciaisAtivos = clientesComerciais
    .filter(
      (cliente) => cliente.ativo !== false || cliente.id === pedido.clienteId
    )
    .sort((a, b) =>
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
        numeric: true,
        sensitivity: "base",
      })
    );

  const selecionarClienteComercial = (clienteId) => {
    if (!clienteId) {
      setPedido({
        ...pedido,
        clienteId: "",
        clienteNome: "",
        clienteTelefone: "",
      });
      return;
    }

    const clienteSelecionado = clientesComerciais.find(
      (cliente) => cliente.id === clienteId
    );

    if (!clienteSelecionado) return;

    setPedido({
      ...pedido,
      clienteId: clienteSelecionado.id,
      clienteNome: clienteSelecionado.nome || "",
      clienteTelefone: clienteSelecionado.telefone || "",
      cliente: clienteSelecionado.nome || pedido.cliente,
    });
  };
  // ================================
  // 🔹 GERAR NÚMERO AUTOMÁTICO DO PEDIDO
  // ================================
  const gerarNumeroPedido = () => {
    const ultimoNumero = vendas.reduce((maior, venda) => {
      if (!venda.numeroPedido) return maior;

      const numero = extrairNumeroPedido(venda.numeroPedido);
      return numero > maior ? numero : maior;
    }, 0);

    return `PED-${String(ultimoNumero + 1).padStart(4, "0")}`;
  };

  // ================================
  // 🔹 CALCULAR ESTOQUE DE PRODUTOS
  // Estoque = Produzido - Vendido
  // ================================
  const estoqueProdutos = calcularEstoqueProdutosCompartilhado({
    producoes,
    vendas,
    ignorarVendaIndex: editIndex,
  });

  const produtoSelecionado = estoqueProdutos.find(
    (p) => p.produto === itemAtual.produto
  );

  const quantidadeJaNoPedido = itens.reduce((total, item) => {
    if (
      normalizarChaveProduto(textoSeguro(item.produto)) !==
      normalizarChaveProduto(itemAtual.produto)
    ) {
      return total;
    }
    return total + Number(item.quantidade || 0);
  }, 0);

  const saldoDisponivelItem = produtoSelecionado
    ? produtoSelecionado.saldo - quantidadeJaNoPedido
    : 0;

  const margemDesejadaItem = Number(itemAtual.margemDesejada || 0);

  const precoSugeridoItem =
    produtoSelecionado && margemDesejadaItem > 0 && margemDesejadaItem < 100
      ? produtoSelecionado.custoMedio / (1 - margemDesejadaItem / 100)
      : 0;

  // ================================
  // 🔹 CÁLCULOS DO ITEM ATUAL
  // ================================
  const quantidadeItem = Number(itemAtual.quantidade || 0);
  const valorUnitarioItem = Number(itemAtual.valorUnitario || 0);
  const descontoItem = Number(itemAtual.desconto || 0);

  const valorBrutoItem = quantidadeItem * valorUnitarioItem;
  const totalItem = valorBrutoItem - descontoItem;

  const custoItem = produtoSelecionado
    ? quantidadeItem * produtoSelecionado.custoMedio
    : 0;

  const lucroItem = totalItem - custoItem;

  const margemItem =
    totalItem > 0 ? ((lucroItem / totalItem) * 100).toFixed(2) : "0.00";

  // ================================
  // 🔹 ADICIONAR ITEM AO PEDIDO
  // ================================
  const aplicarPrecoSugerido = () => {
    if (!produtoSelecionado) {
      showToast("Selecione um produto para calcular o preço.", "warning");
      return;
    }

    if (produtoSelecionado.custoMedio <= 0) {
      showToast("Este produto ainda não tem custo médio calculado.", "warning");
      return;
    }

    if (margemDesejadaItem <= 0 || margemDesejadaItem >= 100) {
      showToast("Informe uma margem maior que 0% e menor que 100%.", "warning");
      return;
    }

    setItemAtual({
      ...itemAtual,
      valorUnitario: precoSugeridoItem.toFixed(2),
    });
  };

  const adicionarItem = () => {
    if (!itemAtual.produto || !itemAtual.quantidade || !itemAtual.valorUnitario) {
      showToast("Preencha produto, quantidade e valor unitário.", "warning");
      return;
    }

    if (!produtoSelecionado) {
      showToast("Produto não encontrado no estoque.", "warning");
      return;
    }

    if (quantidadeItem <= 0) {
      showToast("Informe uma quantidade válida.", "warning");
      return;
    }

    if (quantidadeItem > saldoDisponivelItem) {
      showToast(
        `Estoque insuficiente. Saldo disponível: ${saldoDisponivelItem} unidades.`,
        "warning"
      );
      return;
    }

    if (descontoItem < 0) {
      showToast("O desconto não pode ser negativo.", "warning");
      return;
    }

    if (
      itemAtual.margemDesejada !== "" &&
      (margemDesejadaItem <= 0 || margemDesejadaItem >= 100)
    ) {
      showToast("A margem desejada deve ser maior que 0% e menor que 100%.", "warning");
      return;
    }

    if (descontoItem > valorBrutoItem) {
      showToast("O desconto não pode ser maior que o valor bruto do item.", "warning");
      return;
    }

    const novoItem = {
      produto: itemAtual.produto,
      quantidade: quantidadeItem,
      valorUnitario: valorUnitarioItem,
      margemDesejada: itemAtual.margemDesejada ? margemDesejadaItem : "",
      desconto: descontoItem,
      valorBruto: valorBrutoItem,
      total: totalItem,
      custo: custoItem,
      lucro: lucroItem,
      margem: margemItem,
    };

    setItens([...itens, novoItem]);

    setItemAtual({
      produto: "",
      quantidade: "",
      margemDesejada: "",
      valorUnitario: "",
      desconto: "",
    });
  };

  // ================================
  // 🔹 REMOVER ITEM DO PEDIDO
  // ================================
  const removerItem = (index) => {
    setItens(itens.filter((_, i) => i !== index));
  };

  // ================================
  // 🔹 CÁLCULOS DO PEDIDO
  // ================================
  const valorBrutoPedido = itens.reduce(
    (total, item) => total + Number(item.valorBruto || 0),
    0
  );

  const descontoPedido = itens.reduce(
    (total, item) => total + Number(item.desconto || 0),
    0
  );

  const totalPedido = itens.reduce(
    (total, item) => total + Number(item.total || 0),
    0
  );

  const custoPedido = itens.reduce(
    (total, item) => total + Number(item.custo || 0),
    0
  );

  const lucroPedido = totalPedido - custoPedido;

  const margemPedido =
    totalPedido > 0 ? ((lucroPedido / totalPedido) * 100).toFixed(2) : "0.00";

  // ================================
  // 🔹 FINALIZAR / ATUALIZAR PEDIDO
  // ================================
  const finalizarPedido = async () => {
    if (!pedido.cliente || !pedido.data) {
      showToast("Preencha cliente e data.", "warning");
      return;
    }

    if (itens.length === 0) {
      showToast("Adicione pelo menos um item ao pedido.", "warning");
      return;
    }

    if (editIndex === null && isGratis && limiteVendasMes !== null) {
      const mesAtual = new Date().toISOString().slice(0, 7);
      const vendasMesAtual = vendas.filter((venda) =>
        String(venda.data || "").startsWith(mesAtual)
      ).length;

      if (vendasMesAtual >= limiteVendasMes) {
        showToast("Você atingiu o limite de vendas do plano grátis.", "warning");
        return;
      }
    }

    const pedidoTratado = {
      numeroPedido:
        editIndex !== null
          ? vendas[editIndex].numeroPedido
          : gerarNumeroPedido(),

      cliente: pedido.cliente,
      clienteId: pedido.clienteId || "",
      clienteNome: pedido.clienteNome || pedido.cliente,
      clienteTelefone: pedido.clienteTelefone || "",
      data: pedido.data,
      itens,
      valorBruto: valorBrutoPedido,
      desconto: descontoPedido,
      total: totalPedido,
      custoTotal: custoPedido,
      lucro: lucroPedido,
      margem: margemPedido,
      statusPagamento: pedido.statusPagamento || "pendente",
      formaPagamento: pedido.formaPagamento || "",
      dataPagamento: pedido.dataPagamento || null,
      observacaoPagamento: pedido.observacaoPagamento || "",
      statusExpedicao:
        editIndex !== null
          ? vendas[editIndex].statusExpedicao || "Pendente"
          : "Pendente",
    };

      if (editIndex !== null) {
  const venda = vendas[editIndex];

    await updateItem("vendas", venda.id, pedidoTratado);
  } else {
    await addItem("vendas", pedidoTratado);
  }

    limparPedido();
  };

  // ================================
  // 🔹 EDITAR PEDIDO
  // ================================
  const editarPedido = (index) => {
    const venda = vendas[index];
    const pagamento = normalizarPagamento(venda);

    setPedido({
      clienteId: venda.clienteId || "",
      clienteNome: venda.clienteNome || venda.cliente || "",
      clienteTelefone: venda.clienteTelefone || "",
      cliente: venda.clienteNome || venda.cliente || "",
      data: venda.data || "",
      ...pagamento,
    });

    if (venda.itens && Array.isArray(venda.itens)) {
      setItens(venda.itens);
    } else {
      setItens([
        {
          produto: textoSeguro(venda.produto),
          quantidade: Number(venda.quantidade || 0),
          valorUnitario: Number(venda.valorUnitario || 0),
          margemDesejada: venda.margemDesejada || "",
          desconto: Number(venda.desconto || 0),
          valorBruto: Number(venda.valorBruto || 0),
          total: Number(venda.total || 0),
          custo: Number(venda.custoVenda || venda.custo || 0),
          lucro: Number(venda.lucro || 0),
          margem: Number(venda.margem || 0),
        },
      ]);
    }

    setEditIndex(index);
  };

  // ================================
  // 🔹 EXCLUIR PEDIDO
  // ================================
    const excluirPedido = async (index) => {
      const confirmado = await confirmar("Deseja excluir este pedido?");
      if (!confirmado) return;

      const venda = vendas[index];

      await deleteItem("vendas", venda.id);

      if (editIndex === index) {
        limparPedido();
      }
    };

  // ================================
  // 🔹 ALTERAR STATUS DA EXPEDIÇÃO
  // ================================
  const iniciarEdicaoExpedicao = (index, venda) => {
    setEdicaoExpedicao({
      index,
      status: venda.statusExpedicao || "Pendente",
    });
  };

  const cancelarEdicaoExpedicao = () => {
    setEdicaoExpedicao({
      index: null,
      status: "",
    });
  };

  const salvarStatusExpedicao = async () => {
    if (edicaoExpedicao.index === null) return;

    const venda = vendas[edicaoExpedicao.index];

    await updateItem("vendas", venda.id, {
      statusExpedicao: edicaoExpedicao.status || "Pendente",
    });

    cancelarEdicaoExpedicao();
  };

  // ================================
  // 🔹 ALTERAR PAGAMENTO DO PEDIDO
  // ================================
  const iniciarEdicaoPagamento = (index, venda) => {
    setEdicaoPagamento({
      index,
      dados: normalizarPagamento(venda),
    });
  };

  const atualizarEdicaoPagamento = (campo, valor) => {
    setEdicaoPagamento((atual) => ({
      ...atual,
      dados: {
        ...atual.dados,
        [campo]: valor,
      },
    }));
  };

  const cancelarEdicaoPagamento = () => {
    setEdicaoPagamento({
      index: null,
      dados: PAGAMENTO_PADRAO,
    });
  };

  const salvarPagamentoPedido = async () => {
    if (edicaoPagamento.index === null) return;

    const venda = vendas[edicaoPagamento.index];
    const dados = edicaoPagamento.dados;

    await updateItem("vendas", venda.id, {
      statusPagamento: dados.statusPagamento || "pendente",
      formaPagamento: dados.formaPagamento || "",
      dataPagamento: dados.dataPagamento || null,
      observacaoPagamento: dados.observacaoPagamento || "",
    });

    cancelarEdicaoPagamento();
  };

  // ================================
  // 🔹 GERAR PDF PROFISSIONAL DO PEDIDO
  // ================================
  const gerarPDFPedido = (venda, index) => {
    if (!podeGerarPDF) {
      showToast("Recurso disponível no plano Profissional.", "warning");
      return;
    }

    const itensPedido =
      venda.itens && Array.isArray(venda.itens)
        ? venda.itens
        : [
            {
              produto: textoSeguro(venda.produto),
              quantidade: venda.quantidade,
              valorUnitario: venda.valorUnitario,
              desconto: venda.desconto || 0,
              valorBruto: venda.valorBruto || 0,
              total: venda.total || 0,
            },
          ];

    const elemento = document.createElement("div");
    const logoPDF = dadosEmpresaPDF.logoBase64 || saasLogo;
    const pagamentoPDF = normalizarPagamento(venda);
    const dataPagamentoPDF = pagamentoPDF.dataPagamento
      ? `<p><strong>Data do pagamento:</strong> ${dataBR(pagamentoPDF.dataPagamento)}</p>`
      : "";
    const observacaoPagamentoPDF = pagamentoPDF.observacaoPagamento
      ? `<p><strong>Observação do pagamento:</strong> ${textoSeguro(
          pagamentoPDF.observacaoPagamento
        )}</p>`
      : "";

    elemento.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 25px; color: #111827;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #111827; padding-bottom:15px; margin-bottom:20px;">
          <div style="display:flex; gap:14px; align-items:center;">
            <div style="background:#f8fafc; padding:8px; border:1px solid #e5e7eb; border-radius:8px;">
              <img src="${logoPDF}" style="width:160px; max-height:58px; object-fit:contain;" />
            </div>

            <div style="line-height:1.35;">
              <h2 style="margin:0; font-size:18px;">${textoSeguro(dadosEmpresaPDF.nome, NOME_SAAS)}</h2>
              <p style="margin:3px 0;">CNPJ: ${textoSeguro(dadosEmpresaPDF.cnpj)}</p>
              <p style="margin:3px 0;">Cidade: ${textoSeguro(dadosEmpresaPDF.cidade)}</p>
              ${
                dadosEmpresaPDF.telefone
                  ? `<p style="margin:3px 0;">Contato: ${textoSeguro(dadosEmpresaPDF.telefone)}</p>`
                  : ""
              }
              ${
                dadosEmpresaPDF.email
                  ? `<p style="margin:3px 0;">E-mail: ${textoSeguro(dadosEmpresaPDF.email)}</p>`
                  : ""
              }
            </div>
          </div>

          <div style="text-align:right;">
            <h1 style="margin:0; font-size:26px;">PEDIDO DE VENDA</h1>
            <p style="margin:5px 0;">Nº ${
              venda.numeroPedido || `PED-${String(index + 1).padStart(4, "0")}`
            }</p>
          </div>
        </div>

        <div style="margin-bottom:20px; line-height:1.6;">
          <p><strong>Cliente:</strong> ${textoSeguro(venda.cliente)}</p>
          <p><strong>Data:</strong> ${dataBR(venda.data)}</p>
          <p><strong>Status:</strong> ${venda.statusExpedicao || "Pendente"}</p>
          <p><strong>Status do pagamento:</strong> ${formatarStatusPagamento(pagamentoPDF.statusPagamento)}</p>
          <p><strong>Forma de pagamento:</strong> ${formatarFormaPagamento(pagamentoPDF.formaPagamento)}</p>
          ${dataPagamentoPDF}
          ${observacaoPagamentoPDF}
        </div>

        <table style="width:100%; border-collapse:collapse; margin-top:15px;">
          <thead>
            <tr>
              <th style="border:1px solid #d1d5db; padding:10px; background:#f1f5f9;">Produto</th>
              <th style="border:1px solid #d1d5db; padding:10px; background:#f1f5f9;">Qtd</th>
              <th style="border:1px solid #d1d5db; padding:10px; background:#f1f5f9;">Valor Unit.</th>
              <th style="border:1px solid #d1d5db; padding:10px; background:#f1f5f9;">Bruto</th>
              <th style="border:1px solid #d1d5db; padding:10px; background:#f1f5f9;">Desconto</th>
              <th style="border:1px solid #d1d5db; padding:10px; background:#f1f5f9;">Total</th>
            </tr>
          </thead>

          <tbody>
            ${itensPedido
              .map(
                (item) => `
                  <tr>
                    <td style="border:1px solid #d1d5db; padding:10px;">${textoSeguro(item?.produto)}</td>
                    <td style="border:1px solid #d1d5db; padding:10px;">${item?.quantidade || 0}</td>
                    <td style="border:1px solid #d1d5db; padding:10px;">R$ ${numeroBR(item?.valorUnitario || 0, 2)}</td>
                    <td style="border:1px solid #d1d5db; padding:10px;">R$ ${numeroBR(item?.valorBruto || 0, 2)}</td>
                    <td style="border:1px solid #d1d5db; padding:10px;">R$ ${numeroBR(item?.desconto || 0, 2)}</td>
                    <td style="border:1px solid #d1d5db; padding:10px;">R$ ${numeroBR(item?.total || 0, 2)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>

        <div style="margin-top:25px; width:320px; margin-left:auto; border:1px solid #d1d5db; padding:15px;">
          <p style="display:flex; justify-content:space-between;">
            <span>Valor bruto:</span>
            <strong>R$ ${numeroBR(venda.valorBruto || 0, 2)}</strong>
          </p>

          <p style="display:flex; justify-content:space-between;">
            <span>Desconto:</span>
            <strong>R$ ${numeroBR(venda.desconto || 0, 2)}</strong>
          </p>

          <p style="display:flex; justify-content:space-between; font-size:18px; font-weight:bold; border-top:1px solid #d1d5db; padding-top:10px;">
            <span>Total:</span>
            <strong>R$ ${numeroBR(venda.total || 0, 2)}</strong>
          </p>
        </div>

        <div style="margin-top:45px; font-size:12px; color:#555; text-align:center;">
          <p>Gerado pelo ${NOME_SAAS}</p>
        </div>
      </div>
    `;

    const opcoes = {
      margin: 8,
      filename: `${
        venda.numeroPedido || `PED-${String(index + 1).padStart(4, "0")}`
      }_${textoSeguro(venda.cliente, "cliente")}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    html2pdf().set(opcoes).from(elemento).save();
  };

  // ================================
  // 🔹 LIMPAR PEDIDO
  // ================================
  const limparPedido = () => {
    setPedido({
      clienteId: "",
      clienteNome: "",
      clienteTelefone: "",
      cliente: "",
      data: "",
      ...PAGAMENTO_PADRAO,
    });

    setItemAtual({
      produto: "",
      quantidade: "",
      margemDesejada: "",
      valorUnitario: "",
      desconto: "",
    });

    setItens([]);
    setEditIndex(null);
    cancelarEdicaoExpedicao();
    cancelarEdicaoPagamento();
  };

  // ================================
  // 🔹 RESUMOS VISUAIS DA PÁGINA
  // ================================
  const totalPedidos = vendas.length;

  const totalVendido = vendas.reduce(
    (total, venda) => total + Number(venda.total || 0),
    0
  );

  const lucroTotal = vendas.reduce(
    (total, venda) => total + Number(venda.lucro || 0),
    0
  );

  const pedidosPendentes = vendas.filter(
    (venda) => venda.statusExpedicao !== "Entregue"
  ).length;

  const obterNumeroPedido = (venda, index) =>
    venda.numeroPedido || `PED-${String(index + 1).padStart(4, "0")}`;

  const numeroOrdenavel = (valor) => {
    const numero = Number(String(valor ?? 0).replace(",", "."));
    return Number.isFinite(numero) ? numero : 0;
  };

  const vendasComIndice = vendas.map((venda, index) => ({
    venda,
    index,
    numeroPedido: obterNumeroPedido(venda, index),
  }));

  const getValorOrdenacaoVenda = (item, chave) => {
    const { venda, numeroPedido } = item;

    const valores = {
      numeroPedido: extrairNumeroPedido(numeroPedido),
      data: venda.data || "",
      cliente: textoSeguro(venda.cliente, ""),
      valorBruto: numeroOrdenavel(venda.valorBruto),
      desconto: numeroOrdenavel(venda.desconto),
      total: numeroOrdenavel(venda.total),
      lucro: numeroOrdenavel(venda.lucro),
      margem: numeroOrdenavel(venda.margem),
      statusExpedicao: venda.statusExpedicao || "Pendente",
      statusPagamento: formatarStatusPagamento(venda.statusPagamento),
      formaPagamento: formatarFormaPagamento(venda.formaPagamento),
    };

    return valores[chave] ?? "";
  };

  const vendasHistoricoOrdenadas = ordenarPorConfig(
    vendasComIndice,
    ordenacaoHistorico,
    getValorOrdenacaoVenda
  );

  const vendasExpedicaoOrdenadas = ordenarPorConfig(
    vendasComIndice,
    ordenacaoExpedicao,
    getValorOrdenacaoVenda
  );

  const renderStatusExpedicao = (venda, index) => {
    const statusAtual = venda.statusExpedicao || "Pendente";

    if (edicaoExpedicao.index === index) {
      return (
        <div className="sales-inline-editor">
          <select
            value={edicaoExpedicao.status}
            onChange={(e) =>
              setEdicaoExpedicao({
                ...edicaoExpedicao,
                status: e.target.value,
              })
            }
          >
            {STATUS_EXPEDICAO.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <div className="btn-action-group">
            <button className="btn-sm" type="button" onClick={salvarStatusExpedicao}>
              Salvar
            </button>
            <button className="btn-sm" type="button" onClick={cancelarEdicaoExpedicao}>
              Cancelar
            </button>
          </div>
        </div>
      );
    }

    return (
      <span className={`badge ${obterClasseStatusExpedicao(statusAtual)}`}>
        {statusAtual}
      </span>
    );
  };

  const renderPagamentoPedido = (venda, index) => {
    const pagamento = normalizarPagamento(venda);

    if (edicaoPagamento.index === index) {
      return (
        <div className="sales-payment-editor">
          <select
            value={edicaoPagamento.dados.statusPagamento}
            onChange={(e) =>
              atualizarEdicaoPagamento("statusPagamento", e.target.value)
            }
          >
            {STATUS_PAGAMENTO.map((status) => (
              <option key={status} value={status}>
                {formatarStatusPagamento(status)}
              </option>
            ))}
          </select>

          <select
            value={edicaoPagamento.dados.formaPagamento}
            onChange={(e) =>
              atualizarEdicaoPagamento("formaPagamento", e.target.value)
            }
          >
            <option value="">Forma de pagamento</option>
            {FORMAS_PAGAMENTO.map((forma) => (
              <option key={forma} value={forma}>
                {formatarFormaPagamento(forma)}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={edicaoPagamento.dados.dataPagamento || ""}
            onChange={(e) =>
              atualizarEdicaoPagamento("dataPagamento", e.target.value)
            }
          />

          <input
            placeholder="Observação"
            value={edicaoPagamento.dados.observacaoPagamento || ""}
            onChange={(e) =>
              atualizarEdicaoPagamento("observacaoPagamento", e.target.value)
            }
          />

          <div className="btn-action-group">
            <button className="btn-sm" type="button" onClick={salvarPagamentoPedido}>
              Salvar
            </button>
            <button className="btn-sm" type="button" onClick={cancelarEdicaoPagamento}>
              Cancelar
            </button>
          </div>
        </div>
      );
    }

    return (
      <span
        className={`badge ${obterClasseStatusPagamento(
          pagamento.statusPagamento
        )}`}
      >
        {formatarStatusPagamento(pagamento.statusPagamento)}
      </span>
    );
  };

  const renderMenuAcoes = (venda, index, origem = "historico") => {
    const items = [
      {
        label: "Editar pedido",
        onClick: () => editarPedido(index),
      },
    ];

    if (origem === "historico") {
      items.push({
        label: "Baixar PDF",
        onClick: () => gerarPDFPedido(venda, index),
      });
    }

    items.push({
      label: "Alterar expedição",
      onClick: () => iniciarEdicaoExpedicao(index, venda),
    });

    if (origem === "historico") {
      items.push(
        {
          label: "Alterar pagamento",
          onClick: () => iniciarEdicaoPagamento(index, venda),
        },
        {
          label: "Excluir pedido",
          danger: true,
          onClick: () => excluirPedido(index),
        }
      );
    }

    return <ActionMenu label="Abrir ações do pedido" items={items} />;
  };

  const renderCabecalhoOrdenavel = (
    label,
    chave,
    ordenacao,
    setOrdenacao
  ) => {
    const ativo = ordenacao.chave === chave;

    return (
      <button
        type="button"
        className={ativo ? "table-sort-button active" : "table-sort-button"}
        onClick={() => setOrdenacao((atual) => alternarOrdenacao(atual, chave))}
      >
        <span>{label}</span>
        {ativo && <span aria-hidden="true">{ordenacao.direcao === "asc" ? "↑" : "↓"}</span>}
      </button>
    );
  };

  // ================================
  // 🔹 RENDERIZAÇÃO
  // ================================
  return (
    <div>
      <h1 className="page-title">Vendas / Pedidos</h1>

      {/* ================================
          🔹 CARDS RESUMO
      ================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "18px",
          marginBottom: "25px",
        }}
      >
        <div className="card" style={{ borderLeft: "5px solid #2563eb" }}>
          <p style={{ color: "#64748b" }}>Total de Pedidos</p>
          <h2 style={{ color: "#2563eb" }}>{totalPedidos}</h2>
          <small>Pedidos cadastrados</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #16a34a" }}>
          <p style={{ color: "#64748b" }}>Faturamento</p>
          <h2 style={{ color: "#16a34a" }}>R$ {numeroBR(totalVendido, 2)}</h2>
          <small>Total vendido</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #7c3aed" }}>
          <p style={{ color: "#64748b" }}>Lucro</p>
          <h2 style={{ color: "#7c3aed" }}>R$ {numeroBR(lucroTotal, 2)}</h2>
          <small>Lucro acumulado</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #f59e0b" }}>
          <p style={{ color: "#64748b" }}>Pendentes</p>
          <h2 style={{ color: "#f59e0b" }}>{pedidosPendentes}</h2>
          <small>Aguardando expedição</small>
        </div>
      </div>

      {/* ================================
          🔹 DADOS DO PEDIDO
      ================================= */}
      <div className="card">
        <h3>{editIndex !== null ? "Editar Pedido" : "Novo Pedido"}</h3>

        {podeUsarCRMBasico ? (
          <div className="sales-customer-grid">
            <label>
              Cliente cadastrado
              <select
                value={pedido.clienteId || ""}
                onChange={(e) => selecionarClienteComercial(e.target.value)}
              >
                <option value="">Selecionar da carteira</option>
                {clientesComerciaisAtivos.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Cliente do pedido
              <input
                placeholder="Cliente"
                value={pedido.cliente}
                onChange={(e) =>
                  setPedido({
                    ...pedido,
                    cliente: e.target.value,
                    clienteId: "",
                    clienteNome: "",
                    clienteTelefone: "",
                  })
                }
              />
            </label>
          </div>
        ) : (
          <input
            placeholder="Cliente"
            value={pedido.cliente}
            onChange={(e) =>
              setPedido({
                ...pedido,
                cliente: e.target.value,
                clienteId: "",
                clienteNome: "",
                clienteTelefone: "",
              })
            }
          />
        )}

        <input
          type="date"
          value={pedido.data}
          onChange={(e) => setPedido({ ...pedido, data: e.target.value })}
        />

        <div className="sales-payment-grid">
          <select
            value={pedido.statusPagamento}
            onChange={(e) =>
              setPedido({ ...pedido, statusPagamento: e.target.value })
            }
          >
            {STATUS_PAGAMENTO.map((status) => (
              <option key={status} value={status}>
                {formatarStatusPagamento(status)}
              </option>
            ))}
          </select>

          <select
            value={pedido.formaPagamento}
            onChange={(e) =>
              setPedido({ ...pedido, formaPagamento: e.target.value })
            }
          >
            <option value="">Forma de pagamento</option>
            {FORMAS_PAGAMENTO.map((forma) => (
              <option key={forma} value={forma}>
                {formatarFormaPagamento(forma)}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={pedido.dataPagamento || ""}
            onChange={(e) =>
              setPedido({ ...pedido, dataPagamento: e.target.value })
            }
          />

          <input
            placeholder="Observação do pagamento"
            value={pedido.observacaoPagamento || ""}
            onChange={(e) =>
              setPedido({ ...pedido, observacaoPagamento: e.target.value })
            }
          />
        </div>

        {editIndex !== null && (
          <div
            style={{
              marginTop: "10px",
              padding: "10px",
              background: "#fef3c7",
              borderRadius: "8px",
              color: "#92400e",
            }}
          >
            Você está editando um pedido existente.
          </div>
        )}
      </div>

      <br />

      {/* ================================
          🔹 ADICIONAR ITEM
      ================================= */}
      <div className="card">
        <h3>Adicionar Item ao Pedido</h3>

        <select
          value={itemAtual.produto}
          onChange={(e) =>
            setItemAtual({
              ...itemAtual,
              produto: e.target.value,
              valorUnitario: "",
            })
          }
        >
          <option value="">Selecione o produto</option>

          {estoqueProdutos.map((p, index) => (
            <option key={index} value={p.produto}>
              {p.produto} — Estoque: {p.saldo}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Quantidade"
          value={itemAtual.quantidade}
          onChange={(e) =>
            setItemAtual({ ...itemAtual, quantidade: e.target.value })
          }
        />

        <input
          type="number"
          step="0.01"
          placeholder="Margem desejada %"
          value={itemAtual.margemDesejada}
          onChange={(e) =>
            setItemAtual({ ...itemAtual, margemDesejada: e.target.value })
          }
        />

        <button onClick={aplicarPrecoSugerido}>Aplicar margem</button>

        <input
          type="number"
          step="0.01"
          placeholder="Valor unitário"
          value={itemAtual.valorUnitario}
          onChange={(e) =>
            setItemAtual({ ...itemAtual, valorUnitario: e.target.value })
          }
        />

        <input
          type="number"
          step="0.01"
          placeholder="Desconto R$"
          value={itemAtual.desconto}
          onChange={(e) =>
            setItemAtual({ ...itemAtual, desconto: e.target.value })
          }
        />

        <button onClick={adicionarItem}>Adicionar Item</button>
      </div>

      <br />

      {/* ================================
          🔹 PRÉVIA DO ITEM
      ================================= */}
      {produtoSelecionado && (
        <div className="card">
          <h3>Prévia do Item</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "15px",
            }}
          >
            <p>
              <strong>Estoque:</strong>
              <br />
              {saldoDisponivelItem} unidades
            </p>

            <p>
              <strong>Custo unitário:</strong>
              <br />
              R$ {numeroBR(produtoSelecionado.custoMedio, 2)}
            </p>

            <p>
              <strong>Preço sugerido:</strong>
              <br />
              R$ {numeroBR(precoSugeridoItem, 2)}
            </p>

            <p>
              <strong>Valor bruto:</strong>
              <br />
              R$ {numeroBR(valorBrutoItem, 2)}
            </p>

            <p>
              <strong>Total:</strong>
              <br />
              R$ {numeroBR(totalItem, 2)}
            </p>

            <p>
              <strong>Margem:</strong>
              <br />
              {margemItem}%
            </p>
          </div>
        </div>
      )}

      <br />

      {/* ================================
          🔹 ITENS DO PEDIDO
      ================================= */}
      <div className="card">
        <h3>Itens do Pedido</h3>

        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd</th>
              <th>Unitário</th>
              <th>Margem Desejada</th>
              <th>Bruto</th>
              <th>Desconto</th>
              <th>Total</th>
              <th>Custo</th>
              <th>Lucro</th>
              <th>Margem</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {itens.map((item, index) => (
              <tr key={`${textoSeguro(item?.produto, "item")}-${index}`}>
                <td>{textoSeguro(item?.produto)}</td>
                <td>{item?.quantidade || 0}</td>
                <td>R$ {numeroBR(item?.valorUnitario || 0, 2)}</td>
                <td>
                  {item?.margemDesejada !== "" && item?.margemDesejada != null
                    ? `${numeroBR(item.margemDesejada, 2)}%`
                    : "-"}
                </td>
                <td>R$ {numeroBR(item?.valorBruto || 0, 2)}</td>
                <td>R$ {numeroBR(item?.desconto || 0, 2)}</td>
                <td>R$ {numeroBR(item?.total || 0, 2)}</td>
                <td>R$ {numeroBR(item?.custo || 0, 2)}</td>
                <td>R$ {numeroBR(item?.lucro || 0, 2)}</td>
                <td>{numeroBR(item?.margem || "0,00", 2)}%</td>

                <td>
                  <ActionMenu
                    label="Abrir ações do item"
                    items={[
                      {
                        label: "Remover item",
                        danger: true,
                        onClick: () => removerItem(index),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}

            {itens.length === 0 && (
              <tr>
                <td colSpan="11">Nenhum item adicionado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <br />

      {/* ================================
          🔹 RESUMO DO PEDIDO
      ================================= */}
      <div className="card">
        <h3>Resumo do Pedido</h3>

        <div className="resumo-grid">
          <div className="resumo-card">
            <span className="resumo-label">Bruto</span>
            <strong className="resumo-value">R$ {numeroBR(valorBrutoPedido, 2)}</strong>
          </div>

          <div className="resumo-card">
            <span className="resumo-label">Desconto</span>
            <strong className="resumo-value">R$ {numeroBR(descontoPedido, 2)}</strong>
          </div>

          <div className="resumo-card resumo-highlight">
            <span className="resumo-label">Total</span>
            <strong className="resumo-value">R$ {numeroBR(totalPedido, 2)}</strong>
          </div>

          <div className="resumo-card resumo-cost">
            <span className="resumo-label">Custo</span>
            <strong className="resumo-value">R$ {numeroBR(custoPedido, 2)}</strong>
          </div>

          <div className="resumo-card resumo-profit">
            <span className="resumo-label">Lucro</span>
            <strong className="resumo-value">R$ {numeroBR(lucroPedido, 2)}</strong>
          </div>

          <div className="resumo-card resumo-margin">
            <span className="resumo-label">Margem</span>
            <strong className="resumo-value">{numeroBR(margemPedido, 2)}%</strong>
          </div>
        </div>

        <div className="resumo-actions">
          <button className="resumo-primary-button" onClick={finalizarPedido}>
            {editIndex !== null ? "Atualizar Pedido" : "Finalizar Pedido"}
          </button>

          {editIndex !== null && (
            <button className="sales-button-secondary" onClick={limparPedido}>
              Cancelar Edição
            </button>
          )}
        </div>
      </div>

      <br />

      {/* ================================
          🔹 HISTÓRICO DE PEDIDOS
      ================================= */}
      <div className="card">
        <h3>Histórico de Pedidos</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Nº Pedido", "numeroPedido", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Data", "data", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Cliente", "cliente", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>Itens</th>
              <th>{renderCabecalhoOrdenavel("Bruto", "valorBruto", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Desconto", "desconto", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Total", "total", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Lucro", "lucro", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Margem", "margem", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Expedição", "statusExpedicao", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Pagamento", "statusPagamento", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>{renderCabecalhoOrdenavel("Forma Pagamento", "formaPagamento", ordenacaoHistorico, setOrdenacaoHistorico)}</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {vendasHistoricoOrdenadas.map(({ venda, index, numeroPedido }) => (
              <tr key={venda.id || index}>
                <td>{numeroPedido}</td>
                <td>{dataBR(venda.data)}</td>
                <td>{textoSeguro(venda.cliente)}</td>

                <td>
                  {venda.itens && Array.isArray(venda.itens)
                    ? venda.itens.map((item, i) => (
                        <div key={i}>
                          {item.quantidade}x {textoSeguro(item.produto)}
                        </div>
                      ))
                    : `${venda.quantidade}x ${textoSeguro(venda.produto)}`}
                </td>

                <td>R$ {numeroBR(venda.valorBruto || 0, 2)}</td>
                <td>R$ {numeroBR(venda.desconto || 0, 2)}</td>
                <td>R$ {numeroBR(venda.total || 0, 2)}</td>
                <td>R$ {numeroBR(venda.lucro || 0, 2)}</td>
                <td>{numeroBR(venda.margem || "0,00", 2)}%</td>

                <td>{renderStatusExpedicao(venda)}</td>
                <td>{renderPagamentoPedido(venda)}</td>
                <td>{formatarFormaPagamento(venda.formaPagamento)}</td>

                <td>{renderMenuAcoes(venda, index, "historico")}</td>
              </tr>
            ))}

            {vendas.length === 0 && (
              <tr>
                <td colSpan="13">Nenhum pedido registrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <br />

      {/* ================================
          🔹 ÁREA DE EXPEDIÇÃO
      ================================= */}
      <div className="card">
        <h3>Área de Expedição</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Nº Pedido", "numeroPedido", ordenacaoExpedicao, setOrdenacaoExpedicao)}</th>
              <th>{renderCabecalhoOrdenavel("Cliente", "cliente", ordenacaoExpedicao, setOrdenacaoExpedicao)}</th>
              <th>{renderCabecalhoOrdenavel("Data", "data", ordenacaoExpedicao, setOrdenacaoExpedicao)}</th>
              <th>Itens</th>
              <th>{renderCabecalhoOrdenavel("Total", "total", ordenacaoExpedicao, setOrdenacaoExpedicao)}</th>
              <th>{renderCabecalhoOrdenavel("Status", "statusExpedicao", ordenacaoExpedicao, setOrdenacaoExpedicao)}</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {vendasExpedicaoOrdenadas.map(({ venda, index, numeroPedido }) => (
              <tr key={venda.id || index}>
                <td>{numeroPedido}</td>
                <td>{textoSeguro(venda.cliente)}</td>
                <td>{dataBR(venda.data)}</td>

                <td>
                  {venda.itens && Array.isArray(venda.itens)
                    ? venda.itens.map((item, i) => (
                        <div key={i}>
                          {item.quantidade}x {textoSeguro(item.produto)}
                        </div>
                      ))
                    : `${venda.quantidade}x ${textoSeguro(venda.produto)}`}
                </td>

                <td>R$ {numeroBR(venda.total || 0, 2)}</td>
                <td>{renderStatusExpedicao(venda)}</td>
                <td>{renderMenuAcoes(venda, index, "expedicao")}</td>
              </tr>
            ))}

            {vendas.length === 0 && (
              <tr>
                <td colSpan="7">Nenhum pedido para expedição.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {edicaoExpedicao.index !== null && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Alterar expedição</h3>

            <label>
              <span>Status da expedição</span>
              <select
                value={edicaoExpedicao.status}
                onChange={(e) =>
                  setEdicaoExpedicao({
                    ...edicaoExpedicao,
                    status: e.target.value,
                  })
                }
              >
                {STATUS_EXPEDICAO.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <div className="modal-actions">
              <button type="button" onClick={salvarStatusExpedicao}>
                Salvar
              </button>
              <button type="button" onClick={cancelarEdicaoExpedicao}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {edicaoPagamento.index !== null && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Alterar pagamento</h3>

            <label>
              <span>Status do pagamento</span>
              <select
                value={edicaoPagamento.dados.statusPagamento}
                onChange={(e) =>
                  atualizarEdicaoPagamento("statusPagamento", e.target.value)
                }
              >
                {STATUS_PAGAMENTO.map((status) => (
                  <option key={status} value={status}>
                    {formatarStatusPagamento(status)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Forma de pagamento</span>
              <select
                value={edicaoPagamento.dados.formaPagamento}
                onChange={(e) =>
                  atualizarEdicaoPagamento("formaPagamento", e.target.value)
                }
              >
                <option value="">Forma de pagamento</option>
                {FORMAS_PAGAMENTO.map((forma) => (
                  <option key={forma} value={forma}>
                    {formatarFormaPagamento(forma)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Data do pagamento</span>
              <input
                type="date"
                value={edicaoPagamento.dados.dataPagamento || ""}
                onChange={(e) =>
                  atualizarEdicaoPagamento("dataPagamento", e.target.value)
                }
              />
            </label>

            <label>
              <span>Observação</span>
              <input
                value={edicaoPagamento.dados.observacaoPagamento || ""}
                onChange={(e) =>
                  atualizarEdicaoPagamento(
                    "observacaoPagamento",
                    e.target.value
                  )
                }
              />
            </label>

            <div className="modal-actions">
              <button type="button" onClick={salvarPagamentoPedido}>
                Salvar
              </button>
              <button type="button" onClick={cancelarEdicaoPagamento}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
