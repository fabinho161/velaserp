import { useMemo, useState } from "react";
import ActionMenu from "../components/ActionMenu";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import { dataBR, moedaBR, numeroBR } from "../utils/formatters";
import {
  calcularEstoqueProdutos,
  normalizarChaveProduto,
  textoProdutoSeguro,
} from "../utils/estoqueProdutos";
import { extrairNumeroPedido } from "../utils/sortUtils";

const CLIENTE_CONSUMIDOR_FINAL = "Consumidor Final";

const STATUS_PAGAMENTO = ["pendente", "pago", "cancelado"];

const FORMAS_PAGAMENTO = [
  "pix",
  "dinheiro",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "transferencia",
  "outro",
];

const LABEL_STATUS_PAGAMENTO = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
};

const LABEL_FORMA_PAGAMENTO = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartao de credito",
  cartao_debito: "Cartao de debito",
  boleto: "Boleto",
  transferencia: "Transferencia",
  outro: "Outro",
};

const dataHoje = () => new Date().toISOString().slice(0, 10);

const produtoEstaAtivoParaVenda = (produto = {}) => {
  const status = String(produto.status || "ativo").trim().toLowerCase();
  const statusInativo = [
    "inativo",
    "removido",
    "excluido",
    "exclu\u00eddo",
    "cancelado",
  ];

  return produto.ativo !== false && !statusInativo.includes(status);
};

const obterCustoUnitario = (produto = {}) =>
  Number(
    produto.custoAtual ||
      produto.custoUnitarioAtual ||
      produto.custoMedio ||
      produto.custoUnitario ||
      produto.custoProducao ||
      produto.custo ||
      0
  );

const obterPrecoVenda = (produto = {}) =>
  Number(
    produto.precoAtual ||
      produto.precoVendaAtual ||
      produto.precoVenda ||
      produto.valorUnitario ||
      produto.preco ||
      produto.precoUnitario ||
      0
  );

const formatarStatusPagamento = (status) =>
  LABEL_STATUS_PAGAMENTO[status || "pendente"] || "Pendente";

const formatarFormaPagamento = (forma) => LABEL_FORMA_PAGAMENTO[forma] || "-";

const vendaEhPecas = (venda = {}) => venda.tipoVenda === "pecas";

const vendaFoiCancelada = (venda = {}) =>
  String(venda.statusPagamento || "").toLowerCase() === "cancelado" ||
  String(venda.statusExpedicao || "").toLowerCase() === "cancelado";

export default function VendaPecas() {
  const {
    produtos: produtosContexto = [],
    vendas: vendasContexto = [],
    clientesComerciais: clientesContexto = [],
    producoes: producoesContexto = [],
    perdasDoacoes: perdasDoacoesContexto = [],
    ordensServico: ordensServicoContexto = [],
    addItem,
    updateItem,
  } = useERP() || {};
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();

  const produtos = useMemo(
    () => (Array.isArray(produtosContexto) ? produtosContexto : []),
    [produtosContexto]
  );
  const vendas = useMemo(
    () => (Array.isArray(vendasContexto) ? vendasContexto : []),
    [vendasContexto]
  );
  const clientesComerciais = useMemo(
    () => (Array.isArray(clientesContexto) ? clientesContexto : []),
    [clientesContexto]
  );
  const producoes = useMemo(
    () => (Array.isArray(producoesContexto) ? producoesContexto : []),
    [producoesContexto]
  );
  const perdasDoacoes = useMemo(
    () => (Array.isArray(perdasDoacoesContexto) ? perdasDoacoesContexto : []),
    [perdasDoacoesContexto]
  );
  const ordensServico = useMemo(
    () => (Array.isArray(ordensServicoContexto) ? ordensServicoContexto : []),
    [ordensServicoContexto]
  );

  const [vendaEditandoId, setVendaEditandoId] = useState("");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState({
    clienteId: "",
    clienteNome: CLIENTE_CONSUMIDOR_FINAL,
    clienteTelefone: "",
    data: dataHoje(),
    statusPagamento: "pendente",
    formaPagamento: "",
    dataPagamento: "",
    observacaoPagamento: "",
  });
  const [itemAtual, setItemAtual] = useState({
    produtoId: "",
    quantidade: "",
    valorUnitario: "",
    desconto: "",
  });
  const [itens, setItens] = useState([]);

  const estoqueProdutos = useMemo(
    () =>
      calcularEstoqueProdutos({
        produtos,
        producoes,
        vendas,
        perdasDoacoes,
        ordensServico,
        ignorarVendaId: vendaEditandoId,
      }),
    [
      produtos,
      producoes,
      vendas,
      perdasDoacoes,
      ordensServico,
      vendaEditandoId,
    ]
  );

  const produtosPorId = useMemo(
    () =>
      new Map(
        produtos
          .filter((produto) => {
            const produtoId = produto.id || produto.produtoId || "";
            return (
              produtoId &&
              produtoEstaAtivoParaVenda(produto) &&
              produto.vendavel !== false
            );
          })
          .map((produto) => [produto.id || produto.produtoId, produto])
      ),
    [produtos]
  );

  const produtosDisponiveis = useMemo(
    () =>
      estoqueProdutos
        .filter((produtoEstoque) => {
          if (!produtoEstoque.produtoId) return false;
          if (!produtosPorId.has(produtoEstoque.produtoId)) return false;
          return Number(produtoEstoque.saldo || 0) > 0;
        })
        .map((produtoEstoque) => {
          const cadastro = produtosPorId.get(produtoEstoque.produtoId) || {};

          return {
            ...produtoEstoque,
            codigo: cadastro.codigo || produtoEstoque.codigo || "",
            nome: cadastro.nome || produtoEstoque.nome || "",
            produto:
              produtoEstoque.produto ||
              textoProdutoSeguro({
                codigo: cadastro.codigo,
                nome: cadastro.nome,
                tipo: cadastro.tipo,
              }),
            custoAtual: obterCustoUnitario({
              ...produtoEstoque,
              ...cadastro,
            }),
            precoAtual: obterPrecoVenda({
              ...produtoEstoque,
              ...cadastro,
            }),
          };
        })
        .sort((a, b) =>
          String(a.produto || "").localeCompare(String(b.produto || ""), "pt-BR", {
            numeric: true,
            sensitivity: "base",
          })
        ),
    [estoqueProdutos, produtosPorId]
  );

  const clientesAtivos = clientesComerciais
    .filter((cliente) => cliente.ativo !== false)
    .sort((a, b) =>
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
        numeric: true,
        sensitivity: "base",
      })
    );

  const vendasPecas = vendas
    .filter(vendaEhPecas)
    .sort((a, b) => {
      const dataA = String(a.data || "");
      const dataB = String(b.data || "");

      if (dataA !== dataB) return dataB.localeCompare(dataA);

      return String(b.numeroPedido || b.id || "").localeCompare(
        String(a.numeroPedido || a.id || ""),
        "pt-BR",
        { numeric: true, sensitivity: "base" }
      );
    });

  const termoBusca = busca.trim().toLowerCase();
  const vendasFiltradas = termoBusca
    ? vendasPecas.filter((venda) => {
        const texto = [
          venda.numeroPedido,
          venda.clienteNome,
          venda.cliente,
          ...(Array.isArray(venda.itens)
            ? venda.itens.map((item) => item.produtoNome || item.produto)
            : []),
        ]
          .join(" ")
          .toLowerCase();

        return texto.includes(termoBusca);
      })
    : vendasPecas;

  const produtoSelecionado = produtosDisponiveis.find(
    (produto) => produto.produtoId === itemAtual.produtoId
  );

  const quantidadeJaNaVenda = itens.reduce((total, item) => {
    if (produtoSelecionado?.produtoId && item.produtoId === produtoSelecionado.produtoId) {
      return total + Number(item.quantidade || 0);
    }

    if (
      normalizarChaveProduto(textoProdutoSeguro(item.produto)) !==
      normalizarChaveProduto(produtoSelecionado?.produto)
    ) {
      return total;
    }

    return total + Number(item.quantidade || 0);
  }, 0);

  const saldoDisponivelItem = produtoSelecionado
    ? Number(produtoSelecionado.saldo || 0) - quantidadeJaNaVenda
    : 0;
  const quantidadeItem = Number(itemAtual.quantidade || 0);
  const valorUnitarioItem =
    itemAtual.valorUnitario === ""
      ? Number(produtoSelecionado?.precoAtual || 0)
      : Number(itemAtual.valorUnitario || 0);
  const descontoItem = Number(itemAtual.desconto || 0);
  const valorBrutoItem = quantidadeItem * valorUnitarioItem;
  const totalItem = valorBrutoItem - descontoItem;
  const custoUnitarioItem = Number(produtoSelecionado?.custoAtual || 0);
  const custoItem = quantidadeItem * custoUnitarioItem;
  const lucroItem = totalItem - custoItem;
  const margemItem = totalItem > 0 ? ((lucroItem / totalItem) * 100).toFixed(2) : "0.00";

  const valorBrutoVenda = itens.reduce(
    (total, item) => total + Number(item.valorBruto || 0),
    0
  );
  const descontoVenda = itens.reduce(
    (total, item) => total + Number(item.desconto || 0),
    0
  );
  const totalVenda = itens.reduce((total, item) => total + Number(item.total || 0), 0);
  const custoVenda = itens.reduce(
    (total, item) => total + Number(item.custoTotal || item.custo || 0),
    0
  );
  const lucroVenda = totalVenda - custoVenda;
  const margemVenda = totalVenda > 0 ? ((lucroVenda / totalVenda) * 100).toFixed(2) : "0.00";

  const gerarNumeroPedido = () => {
    const ultimoNumero = vendas.reduce((maior, venda) => {
      if (!venda.numeroPedido) return maior;

      const numero = extrairNumeroPedido(venda.numeroPedido);
      return numero > maior ? numero : maior;
    }, 0);

    return `PED-${String(ultimoNumero + 1).padStart(4, "0")}`;
  };

  const selecionarCliente = (clienteId) => {
    if (!clienteId) {
      setForm((atual) => ({
        ...atual,
        clienteId: "",
        clienteNome: CLIENTE_CONSUMIDOR_FINAL,
        clienteTelefone: "",
      }));
      return;
    }

    const cliente = clientesComerciais.find((item) => item.id === clienteId);

    if (!cliente) return;

    setForm((atual) => ({
      ...atual,
      clienteId: cliente.id,
      clienteNome: cliente.nome || CLIENTE_CONSUMIDOR_FINAL,
      clienteTelefone: cliente.telefone || "",
    }));
  };

  const atualizarStatusPagamento = (statusPagamento) => {
    setForm((atual) => ({
      ...atual,
      statusPagamento,
      dataPagamento:
        statusPagamento === "pago"
          ? atual.dataPagamento || dataHoje()
          : statusPagamento === "pendente"
          ? ""
          : atual.dataPagamento,
    }));
  };

  const limparFormulario = () => {
    setVendaEditandoId("");
    setForm({
      clienteId: "",
      clienteNome: CLIENTE_CONSUMIDOR_FINAL,
      clienteTelefone: "",
      data: dataHoje(),
      statusPagamento: "pendente",
      formaPagamento: "",
      dataPagamento: "",
      observacaoPagamento: "",
    });
    setItemAtual({
      produtoId: "",
      quantidade: "",
      valorUnitario: "",
      desconto: "",
    });
    setItens([]);
  };

  const adicionarItem = () => {
    if (!produtoSelecionado) {
      showToast("Selecione uma peça valida.", "warning");
      return;
    }

    if (quantidadeItem <= 0) {
      showToast("Informe uma quantidade maior que zero.", "warning");
      return;
    }

    if (valorUnitarioItem < 0) {
      showToast("O valor unitario nao pode ser negativo.", "warning");
      return;
    }

    if (descontoItem < 0) {
      showToast("O desconto nao pode ser negativo.", "warning");
      return;
    }

    if (descontoItem > valorBrutoItem) {
      showToast("O desconto nao pode ser maior que o valor bruto.", "warning");
      return;
    }

    if (quantidadeItem > saldoDisponivelItem) {
      showToast(
        `Estoque insuficiente. Saldo disponivel: ${numeroBR(saldoDisponivelItem, 2)}.`,
        "warning"
      );
      return;
    }

    const novoItem = {
      produtoId: produtoSelecionado.produtoId || "",
      codigoProduto: produtoSelecionado.codigo || "",
      produtoNome: produtoSelecionado.nome || produtoSelecionado.produto || "",
      produto: produtoSelecionado.produto,
      quantidade: quantidadeItem,
      valorUnitario: valorUnitarioItem,
      desconto: descontoItem,
      valorBruto: valorBrutoItem,
      total: totalItem,
      custo: custoItem,
      custoUnitario: custoUnitarioItem,
      custoTotal: custoItem,
      lucro: lucroItem,
      margem: margemItem,
    };

    setItens((atuais) => [...atuais, novoItem]);
    setItemAtual({
      produtoId: "",
      quantidade: "",
      valorUnitario: "",
      desconto: "",
    });
  };

  const removerItem = (index) => {
    setItens((atuais) => atuais.filter((_, itemIndex) => itemIndex !== index));
  };

  const validarEstoqueAtualizado = () => {
    const estoqueAtualizado = calcularEstoqueProdutos({
      produtos,
      producoes,
      vendas,
      perdasDoacoes,
      ordensServico,
      ignorarVendaId: vendaEditandoId,
    });
    const estoquePorProdutoId = new Map(
      estoqueAtualizado
        .filter((produto) => produto.produtoId)
        .map((produto) => [produto.produtoId, produto])
    );
    const quantidadesPorProduto = new Map();

    for (const item of itens) {
      const produtoId = String(item.produtoId || "").trim();
      const nomeProduto = textoProdutoSeguro(
        item.produtoNome || item.produto,
        "peça"
      );
      const quantidade = Number(item.quantidade || 0);

      if (!produtoId) {
        showToast(`Produto sem identificador valido: ${nomeProduto}.`, "warning");
        return false;
      }

      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        showToast(`Quantidade invalida para ${nomeProduto}.`, "warning");
        return false;
      }

      quantidadesPorProduto.set(produtoId, {
        nomeProduto,
        quantidade:
          Number(quantidadesPorProduto.get(produtoId)?.quantidade || 0) +
          quantidade,
      });
    }

    for (const [produtoId, item] of quantidadesPorProduto.entries()) {
      const produtoEstoque = estoquePorProdutoId.get(produtoId);
      const saldo = Number(produtoEstoque?.saldo);

      if (!produtoEstoque || !Number.isFinite(saldo) || saldo <= 0) {
        showToast(`Estoque insuficiente para ${item.nomeProduto}. Disponivel: 0.`, "warning");
        return false;
      }

      if (item.quantidade > saldo) {
        showToast(
          `Estoque insuficiente para ${item.nomeProduto}. Disponivel: ${numeroBR(saldo, 2)}.`,
          "warning"
        );
        return false;
      }
    }

    return true;
  };

  const salvarVenda = async () => {
    if (!form.data) {
      showToast("Informe a data da venda.", "warning");
      return;
    }

    if (itens.length === 0) {
      showToast("Adicione pelo menos uma peça.", "warning");
      return;
    }

    if (!validarEstoqueAtualizado()) return;

    const vendaAtual = vendaEditandoId
      ? vendas.find((venda) => venda.id === vendaEditandoId)
      : null;
    const vendaTratada = {
      tipoVenda: "pecas",
      numeroPedido: vendaAtual?.numeroPedido || gerarNumeroPedido(),
      cliente: form.clienteNome || CLIENTE_CONSUMIDOR_FINAL,
      clienteId: form.clienteId || "",
      clienteNome: form.clienteNome || CLIENTE_CONSUMIDOR_FINAL,
      clienteTelefone: form.clienteTelefone || "",
      data: form.data,
      itens,
      valorBruto: valorBrutoVenda,
      desconto: descontoVenda,
      total: totalVenda,
      custoTotal: custoVenda,
      lucro: lucroVenda,
      margem: margemVenda,
      statusPagamento: form.statusPagamento || "pendente",
      formaPagamento: form.formaPagamento || "",
      dataPagamento:
        form.statusPagamento === "pago"
          ? form.dataPagamento || dataHoje()
          : form.dataPagamento || null,
      observacaoPagamento: form.observacaoPagamento || "",
      statusExpedicao:
        form.statusPagamento === "cancelado" ? "cancelado" : "entregue",
    };

    if (vendaEditandoId) {
      await updateItem("vendas", vendaEditandoId, vendaTratada);
    } else {
      await addItem("vendas", vendaTratada);
    }

    limparFormulario();
  };

  const editarVenda = (venda) => {
    if (vendaFoiCancelada(venda)) return;

    setVendaEditandoId(venda.id || "");
    setForm({
      clienteId: venda.clienteId || "",
      clienteNome: venda.clienteNome || venda.cliente || CLIENTE_CONSUMIDOR_FINAL,
      clienteTelefone: venda.clienteTelefone || "",
      data: venda.data || dataHoje(),
      statusPagamento: venda.statusPagamento || "pendente",
      formaPagamento: venda.formaPagamento || "",
      dataPagamento: venda.dataPagamento || "",
      observacaoPagamento: venda.observacaoPagamento || "",
    });
    setItens(Array.isArray(venda.itens) ? venda.itens : []);
  };

  const cancelarVenda = async (venda) => {
    if (!venda?.id || vendaFoiCancelada(venda)) return;

    const confirmado = await confirmar("Deseja cancelar esta venda de peças?");
    if (!confirmado) return;

    await updateItem("vendas", venda.id, {
      statusPagamento: "cancelado",
      statusExpedicao: "cancelado",
    });

    if (vendaEditandoId === venda.id) {
      limparFormulario();
    }
  };

  const renderPagamento = (venda) => (
    <span className={vendaFoiCancelada(venda) ? "badge-danger" : venda.statusPagamento === "pago" ? "badge-success" : "badge-warning"}>
      {vendaFoiCancelada(venda)
        ? "Cancelado"
        : formatarStatusPagamento(venda.statusPagamento)}
    </span>
  );

  return (
    <div className="sales-page">
      <h1 className="page-title">Venda de Peças</h1>

      <div className="sales-summary-grid">
        <div className="sales-metric-card sales-metric-green">
          <p>Vendas de peças</p>
          <h2>{vendasPecas.length}</h2>
          <small>Registros da oficina</small>
        </div>

        <div className="sales-metric-card sales-metric-blue">
          <p>Total vendido</p>
          <h2>{moedaBR(vendasPecas.reduce((total, venda) => total + Number(venda.total || 0), 0))}</h2>
          <small>Inclui pendentes e pagas</small>
        </div>

        <div className="sales-metric-card sales-metric-purple">
          <p>Recebido</p>
          <h2>
            {moedaBR(
              vendasPecas
                .filter((venda) => venda.statusPagamento === "pago" && !vendaFoiCancelada(venda))
                .reduce((total, venda) => total + Number(venda.total || 0), 0)
            )}
          </h2>
          <small>Pagamentos confirmados</small>
        </div>
      </div>

      <div className="card sales-section-card">
        <h3>{vendaEditandoId ? "Editar Venda de Peças" : "Nova Venda de Peças"}</h3>

        <div className="sales-form-grid">
          <label>
            <span>Cliente cadastrado</span>
            <select value={form.clienteId} onChange={(e) => selecionarCliente(e.target.value)}>
              <option value="">Consumidor Final</option>
              {clientesAtivos.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nome}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Data da venda</span>
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />
          </label>

          <label>
            <span>Status do pagamento</span>
            <select
              value={form.statusPagamento}
              onChange={(e) => atualizarStatusPagamento(e.target.value)}
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
              value={form.formaPagamento}
              onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })}
            >
              <option value="">Forma de pagamento</option>
              {FORMAS_PAGAMENTO.map((forma) => (
                <option key={forma} value={forma}>
                  {formatarFormaPagamento(forma)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card sales-section-card">
        <h3>Adicionar Peça</h3>

        <div className="sales-item-grid">
          <label>
            <span>Peça</span>
            <select
              value={itemAtual.produtoId}
              onChange={(e) =>
                setItemAtual({
                  ...itemAtual,
                  produtoId: e.target.value,
                  valorUnitario: "",
                })
              }
            >
              <option value="">Selecione a peça</option>
              {produtosDisponiveis.map((produto) => (
                <option key={produto.produtoId} value={produto.produtoId}>
                  {produto.produto} - estoque: {numeroBR(produto.saldo, 2)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Quantidade</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={itemAtual.quantidade}
              onChange={(e) => setItemAtual({ ...itemAtual, quantidade: e.target.value })}
            />
          </label>

          <label>
            <span>Valor unitario</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={itemAtual.valorUnitario}
              placeholder={produtoSelecionado ? String(produtoSelecionado.precoAtual || 0) : ""}
              onChange={(e) => setItemAtual({ ...itemAtual, valorUnitario: e.target.value })}
            />
          </label>

          <label>
            <span>Desconto</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={itemAtual.desconto}
              onChange={(e) => setItemAtual({ ...itemAtual, desconto: e.target.value })}
            />
          </label>

          <button type="button" onClick={adicionarItem}>
            Adicionar
          </button>
        </div>

        {produtoSelecionado && (
          <div className="sales-preview-grid">
            <div className="sales-info-pill">
              <strong>{numeroBR(saldoDisponivelItem, 2)}</strong>
              <span>Saldo disponivel</span>
            </div>
            <div className="sales-info-pill">
              <strong>{moedaBR(valorUnitarioItem)}</strong>
              <span>Valor unitario</span>
            </div>
            <div className="sales-info-pill">
              <strong>{moedaBR(totalItem)}</strong>
              <span>Total do item</span>
            </div>
            <div className="sales-info-pill">
              <strong>{numeroBR(margemItem, 2)}%</strong>
              <span>Margem</span>
            </div>
          </div>
        )}
      </div>

      <div className="card sales-section-card">
        <h3>Peças da Venda</h3>

        <div className="sales-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Peça</th>
                <th>Qtd</th>
                <th>Unitario</th>
                <th>Bruto</th>
                <th>Desconto</th>
                <th>Total</th>
                <th>Custo</th>
                <th>Lucro</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, index) => (
                <tr key={`${item.produtoId || item.produto}-${index}`}>
                  <td>{textoProdutoSeguro(item.produto)}</td>
                  <td>{numeroBR(item.quantidade, 2)}</td>
                  <td>{moedaBR(item.valorUnitario)}</td>
                  <td>{moedaBR(item.valorBruto)}</td>
                  <td>{moedaBR(item.desconto)}</td>
                  <td>{moedaBR(item.total)}</td>
                  <td>{moedaBR(item.custoTotal || item.custo)}</td>
                  <td>{moedaBR(item.lucro)}</td>
                  <td>
                    <ActionMenu
                      label="Abrir acoes da peça"
                      items={[
                        {
                          label: "Remover peça",
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
                  <td colSpan="9">Nenhuma peça adicionada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card sales-section-card">
        <h3>Resumo</h3>

        <div className="resumo-grid">
          <div className="resumo-card">
            <span className="resumo-label">Bruto</span>
            <strong className="resumo-value">{moedaBR(valorBrutoVenda)}</strong>
          </div>
          <div className="resumo-card">
            <span className="resumo-label">Desconto</span>
            <strong className="resumo-value">{moedaBR(descontoVenda)}</strong>
          </div>
          <div className="resumo-card resumo-highlight">
            <span className="resumo-label">Total</span>
            <strong className="resumo-value">{moedaBR(totalVenda)}</strong>
          </div>
          <div className="resumo-card resumo-cost">
            <span className="resumo-label">Custo</span>
            <strong className="resumo-value">{moedaBR(custoVenda)}</strong>
          </div>
          <div className="resumo-card resumo-profit">
            <span className="resumo-label">Lucro</span>
            <strong className="resumo-value">{moedaBR(lucroVenda)}</strong>
          </div>
          <div className="resumo-card resumo-margin">
            <span className="resumo-label">Margem</span>
            <strong className="resumo-value">{numeroBR(margemVenda, 2)}%</strong>
          </div>
        </div>

        <div className="resumo-actions">
          <button className="resumo-primary-button" type="button" onClick={salvarVenda}>
            {vendaEditandoId ? "Atualizar Venda" : "Salvar Venda"}
          </button>
          {vendaEditandoId && (
            <button className="sales-button-secondary" type="button" onClick={limparFormulario}>
              Cancelar Edicao
            </button>
          )}
        </div>
      </div>

      <div className="card sales-section-card">
        <h3>Historico de Venda de Peças</h3>

        <input
          placeholder="Buscar por numero, cliente ou peça"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <div className="sales-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Numero</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Itens</th>
                <th>Total</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {vendasFiltradas.map((venda) => (
                <tr key={venda.id}>
                  <td>{venda.numeroPedido || "-"}</td>
                  <td>{dataBR(venda.data)}</td>
                  <td>{venda.clienteNome || venda.cliente || CLIENTE_CONSUMIDOR_FINAL}</td>
                  <td>
                    {Array.isArray(venda.itens) && venda.itens.length > 0
                      ? venda.itens.map((item, index) => (
                          <div key={`${item.produtoId || item.produto}-${index}`}>
                            {numeroBR(item.quantidade, 2)}x {textoProdutoSeguro(item.produto)}
                          </div>
                        ))
                      : "-"}
                  </td>
                  <td>{moedaBR(venda.total)}</td>
                  <td>{renderPagamento(venda)}</td>
                  <td>{vendaFoiCancelada(venda) ? "Cancelada" : "Entregue"}</td>
                  <td>
                    <ActionMenu
                      label="Abrir acoes da venda"
                      items={[
                        {
                          label: "Editar venda",
                          disabled: vendaFoiCancelada(venda),
                          onClick: () => editarVenda(venda),
                        },
                        {
                          label: "Cancelar venda",
                          danger: true,
                          disabled: vendaFoiCancelada(venda),
                          onClick: () => cancelarVenda(venda),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}

              {vendasFiltradas.length === 0 && (
                <tr>
                  <td colSpan="8">Nenhuma venda de peças encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
