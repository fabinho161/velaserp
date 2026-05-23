import { useMemo, useState } from "react";
import ActionMenu from "../components/ActionMenu";
import { useConfirmacao } from "../context/useConfirmacao";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useTableSort } from "../hooks/useTableSort";
import {
  calcularEstoqueInsumos,
  calcularEstoqueProdutos,
  normalizarChaveProduto,
} from "../utils/estoqueProdutos";
import { dataBR, moedaBR, numeroBR } from "../utils/formatters";

const FORM_INICIAL = {
  tipoItem: "produto",
  tipo: "perda",
  produtoId: "",
  produto: "",
  insumoId: "",
  insumo: "",
  quantidade: "",
  data: new Date().toISOString().split("T")[0],
  motivo: "",
  destinatario: "",
  observacoes: "",
};

const FILTRO_INICIAL = {
  tipoItem: "todos",
  tipo: "todos",
  produto: "",
  inicio: "",
  fim: "",
  status: "ativo",
  busca: "",
};

const TIPOS_MOVIMENTACAO = [
  { valor: "perda", label: "Perda" },
  { valor: "doacao", label: "Doacao" },
  { valor: "avaria", label: "Avaria" },
  { valor: "quebra", label: "Quebra" },
  { valor: "vencimento", label: "Vencimento" },
  { valor: "ajuste_operacional", label: "Ajuste operacional" },
];

const obterLabelTipo = (tipo) =>
  TIPOS_MOVIMENTACAO.find((item) => item.valor === tipo)?.label || "Perda";

const descreverProduto = (produto = {}) => {
  const codigo = produto.codigo ? `${produto.codigo} -` : "";
  return [codigo, produto.nome, produto.tipo]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

const obterTimestamp = (valor) => {
  if (!valor) return 0;
  if (typeof valor?.toMillis === "function") return valor.toMillis();

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
};

export default function PerdasDoacoes() {
  const {
    user,
    insumos = [],
    produtos = [],
    producoes = [],
    vendas = [],
    perdasDoacoes = [],
    addItem,
    updateItem,
  } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();
  const ordenacaoRegistros = useTableSort({
    chave: "data",
    direcao: "desc",
  });

  const [form, setForm] = useState(FORM_INICIAL);
  const [filtros, setFiltros] = useState(FILTRO_INICIAL);

  const estoqueProdutos = useMemo(
    () =>
      calcularEstoqueProdutos({
        produtos,
        producoes,
        vendas,
        perdasDoacoes,
      }),
    [perdasDoacoes, producoes, produtos, vendas]
  );
  const estoqueInsumos = useMemo(
    () =>
      calcularEstoqueInsumos({
        insumos,
        producoes,
        perdasDoacoes,
      }),
    [insumos, perdasDoacoes, producoes]
  );

  const produtosPorDescricao = useMemo(() => {
    const mapa = new Map();

    produtos.forEach((produto) => {
      const descricao = descreverProduto(produto);
      const chave = normalizarChaveProduto(descricao);

      if (chave) mapa.set(chave, produto);
    });

    return mapa;
  }, [produtos]);

  const produtoSelecionadoEstoque = estoqueProdutos.find((produto) =>
    form.produtoId
      ? produto.produtoId === form.produtoId
      : produto.produto === form.produto
  );
  const produtoSelecionadoCadastro =
    produtos.find((produto) => produto.id === form.produtoId) ||
    produtosPorDescricao.get(normalizarChaveProduto(form.produto));
  const insumoSelecionadoEstoque = estoqueInsumos.find((insumo) =>
    form.insumoId
      ? insumo.insumoId === form.insumoId
      : insumo.nome === form.insumo
  );
  const insumoSelecionadoCadastro =
    insumos.find((insumo) => insumo.id === form.insumoId) ||
    insumos.find(
      (insumo) =>
        normalizarChaveProduto(insumo.nome) === normalizarChaveProduto(form.insumo)
    );
  const itemSelecionadoEstoque =
    form.tipoItem === "insumo" ? insumoSelecionadoEstoque : produtoSelecionadoEstoque;
  const quantidade = Number(form.quantidade || 0);
  const saldoDisponivel = Number(itemSelecionadoEstoque?.saldo || 0);
  const custoUnitarioSnapshot = Number(itemSelecionadoEstoque?.custoMedio || 0);
  const custoTotalSnapshot = quantidade * custoUnitarioSnapshot;
  const unidadeProduto =
    produtoSelecionadoCadastro?.fiscal?.unidadeTributavel ||
    produtoSelecionadoCadastro?.unidade ||
    "unidades";
  const unidadeInsumo = insumoSelecionadoCadastro?.unidade || insumoSelecionadoEstoque?.unidade || "";
  const unidadeItem = form.tipoItem === "insumo" ? unidadeInsumo : unidadeProduto;

  const limparFormulario = () => {
    setForm(FORM_INICIAL);
  };

  const registrarPerdaDoacao = async () => {
    const itemSelecionado =
      form.tipoItem === "insumo" ? form.insumo || form.insumoId : form.produto || form.produtoId;

    if (!itemSelecionado || !form.data || quantidade <= 0) {
      showToast("Selecione item, data e quantidade valida.", "warning");
      return;
    }

    if (!itemSelecionadoEstoque) {
      showToast("Item nao encontrado no estoque.", "warning");
      return;
    }

    if (quantidade > saldoDisponivel) {
      showToast("Nao e possivel registrar perda/doacao maior que o saldo disponivel.", "warning");
      return;
    }

    const agora = new Date();

    const registro = {
      tipoItem: form.tipoItem,
      tipo: form.tipo,
      produtoId:
        form.tipoItem === "produto"
          ? produtoSelecionadoEstoque?.produtoId || produtoSelecionadoCadastro?.id || ""
          : "",
      produtoNome:
        form.tipoItem === "produto" ? produtoSelecionadoEstoque?.produto || form.produto : "",
      codigoProduto:
        form.tipoItem === "produto"
          ? produtoSelecionadoEstoque?.codigo || produtoSelecionadoCadastro?.codigo || ""
          : "",
      insumoId:
        form.tipoItem === "insumo"
          ? insumoSelecionadoEstoque?.insumoId || insumoSelecionadoCadastro?.id || ""
          : "",
      insumoNome:
        form.tipoItem === "insumo" ? insumoSelecionadoEstoque?.nome || form.insumo : "",
      quantidade,
      unidade: unidadeItem,
      data: form.data,
      motivo: form.motivo || "",
      destinatario: form.tipo === "doacao" ? form.destinatario || "" : "",
      observacoes: form.observacoes || "",
      responsavelUid: user?.uid || "",
      responsavelNome: user?.displayName || user?.email || "",
      custoUnitarioSnapshot,
      custoTotalSnapshot,
      criadoEm: agora,
      atualizadoEm: agora,
      status: "ativo",
    };

    await addItem("perdasDoacoes", registro);
    showToast(
      "Baixa registrada com sucesso.",
      "success"
    );
    limparFormulario();
  };

  const cancelarRegistro = async (registro) => {
    if (registro.status === "cancelado") return;

    const confirmado = await confirmar(
      `Deseja cancelar este registro de ${obterLabelTipo(registro.tipo).toLowerCase()}?`
    );

    if (!confirmado) return;

    await updateItem("perdasDoacoes", registro.id, {
      status: "cancelado",
      atualizadoEm: new Date(),
    });

    showToast("Registro cancelado com sucesso.", "success");
  };

  const registrosFiltrados = useMemo(() => {
    const busca = normalizarChaveProduto(filtros.busca);
    const produtoFiltro = normalizarChaveProduto(filtros.produto);

    return (perdasDoacoes || []).filter((registro) => {
      const tipoItemRegistro = registro.tipoItem || "produto";

      if (filtros.tipoItem !== "todos" && tipoItemRegistro !== filtros.tipoItem) return false;
      if (filtros.tipo !== "todos" && registro.tipo !== filtros.tipo) return false;
      if (filtros.status !== "todos" && registro.status !== filtros.status) return false;
      if (filtros.inicio && registro.data < filtros.inicio) return false;
      if (filtros.fim && registro.data > filtros.fim) return false;
      if (
        produtoFiltro &&
        normalizarChaveProduto(registro.produtoNome || registro.insumoNome) !== produtoFiltro
      ) {
        return false;
      }

      if (!busca) return true;

      return [
        registro.produtoNome,
        registro.insumoNome,
        registro.motivo,
        registro.destinatario,
        registro.observacoes,
      ].some((valor) => normalizarChaveProduto(valor).includes(busca));
    });
  }, [filtros, perdasDoacoes]);

  const registrosOrdenados = ordenacaoRegistros.ordenar(
    registrosFiltrados.map((registro, index) => ({ registro, index })),
    ({ registro }, chave) => {
      const valores = {
        data: registro.data || "",
        tipo: registro.tipo || "",
        produto: registro.produtoNome || registro.insumoNome || "",
        quantidade: Number(registro.quantidade || 0),
        custoTotal: Number(registro.custoTotalSnapshot || 0),
        status: registro.status || "",
        criadoEm: obterTimestamp(registro.criadoEm),
      };

      return valores[chave] ?? "";
    }
  );

  const registrosAtivos = registrosFiltrados.filter(
    (registro) => registro.status !== "cancelado"
  );
  const totalPerdas = registrosAtivos.filter((registro) => registro.tipo === "perda");
  const totalDoacoes = registrosAtivos.filter((registro) => registro.tipo === "doacao");
  const quantidadeTotalBaixada = registrosAtivos.reduce(
    (total, registro) => total + Number(registro.quantidade || 0),
    0
  );
  const custoEstimadoTotal = registrosAtivos.reduce(
    (total, registro) => total + Number(registro.custoTotalSnapshot || 0),
    0
  );

  const renderCabecalhoOrdenavel = (label, chave) => {
    const ativo = ordenacaoRegistros.ativo(chave);

    return (
      <button
        type="button"
        className={ativo ? "table-sort-button active" : "table-sort-button"}
        onClick={() => ordenacaoRegistros.ordenarPor(chave)}
      >
        <span>{label}</span>
        {ativo && <span aria-hidden="true">{ordenacaoRegistros.indicador(chave)}</span>}
      </button>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Perdas e Doacoes</h1>
          <p className="page-subtitle">
            Registre baixas de estoque sem gerar venda, receita ou faturamento.
          </p>
        </div>
      </div>

      <div className="summary-grid">
        <div className="card metric-card" style={{ "--metric-color": "#dc2626" }}>
          <p>Total de perdas</p>
          <h2>{totalPerdas.length}</h2>
          <small>Registros ativos no filtro</small>
        </div>

        <div className="card metric-card" style={{ "--metric-color": "#2563eb" }}>
          <p>Total de doacoes</p>
          <h2>{totalDoacoes.length}</h2>
          <small>Registros ativos no filtro</small>
        </div>

        <div className="card metric-card" style={{ "--metric-color": "#7c3aed" }}>
          <p>Quantidade baixada</p>
          <h2>{numeroBR(quantidadeTotalBaixada, 3)}</h2>
          <small>Perdas e doacoes ativas</small>
        </div>

        <div className="card metric-card" style={{ "--metric-color": "#f59e0b" }}>
          <p>Custo estimado</p>
          <h2>{moedaBR(custoEstimadoTotal)}</h2>
          <small>Com custo snapshot</small>
        </div>
      </div>

      <div className="card section-card">
        <h3>Registrar Baixa</h3>

        <div className="form-grid">
          <label>
            Tipo do item
            <select
              value={form.tipoItem}
              onChange={(e) =>
                setForm({
                  ...form,
                  tipoItem: e.target.value,
                  produtoId: "",
                  produto: "",
                  insumoId: "",
                  insumo: "",
                })
              }
            >
              <option value="produto">Produto acabado</option>
              <option value="insumo">Insumo / Materia-prima</option>
            </select>
          </label>

          <label>
            Tipo da movimentacao
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            >
              {TIPOS_MOVIMENTACAO.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </label>

          {form.tipoItem === "produto" ? (
            <label>
              Produto
              <select
                value={form.produtoId || form.produto}
                onChange={(e) => {
                  const selecionado = estoqueProdutos.find(
                    (produto) => (produto.produtoId || produto.produto) === e.target.value
                  );

                  setForm({
                    ...form,
                    produtoId: selecionado?.produtoId || "",
                    produto: selecionado?.produto || "",
                  });
                }}
              >
                <option value="">Selecione o produto</option>
                {estoqueProdutos.map((produto) => (
                  <option
                    key={produto.produtoId || produto.produto}
                    value={produto.produtoId || produto.produto}
                  >
                    {produto.produto} - saldo: {numeroBR(produto.saldo, 3)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Insumo / Materia-prima
              <select
                value={form.insumoId || form.insumo}
                onChange={(e) => {
                  const selecionado = estoqueInsumos.find(
                    (insumo) => (insumo.insumoId || insumo.nome) === e.target.value
                  );

                  setForm({
                    ...form,
                    insumoId: selecionado?.insumoId || "",
                    insumo: selecionado?.nome || "",
                  });
                }}
              >
                <option value="">Selecione o insumo</option>
                {estoqueInsumos.map((insumo) => (
                  <option
                    key={insumo.insumoId || insumo.nome}
                    value={insumo.insumoId || insumo.nome}
                  >
                    {insumo.nome} - saldo: {numeroBR(insumo.saldo, 3)} {insumo.unidade}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Quantidade
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.quantidade}
              onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
              placeholder="Ex: 10"
            />
          </label>

          <label>
            Data
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />
          </label>

          <label>
            Motivo
            <input
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Ex: avaria, validade, campanha social"
            />
          </label>

          <label>
            Destinatario
            <input
              value={form.destinatario}
              disabled={form.tipo !== "doacao"}
              onChange={(e) => setForm({ ...form, destinatario: e.target.value })}
              placeholder="Obrigatorio apenas para doacoes"
            />
          </label>

          <label className="form-field-full">
            Observacoes
            <textarea
              rows="3"
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Detalhes adicionais sobre a baixa."
            />
          </label>
        </div>

        {itemSelecionadoEstoque && (
          <div className="product-type-help">
            Saldo disponivel: {numeroBR(saldoDisponivel, 3)} {unidadeItem}. Custo
            estimado da baixa: {moedaBR(custoTotalSnapshot)}.
          </div>
        )}

        <div className="action-row">
          <button type="button" onClick={registrarPerdaDoacao}>
            Registrar {obterLabelTipo(form.tipo)}
          </button>
          <button type="button" onClick={limparFormulario}>
            Limpar
          </button>
        </div>
      </div>

      <div className="card section-card">
        <h3>Filtros</h3>

        <div className="form-grid">
          <label>
            Tipo do item
            <select
              value={filtros.tipoItem}
              onChange={(e) => setFiltros({ ...filtros, tipoItem: e.target.value })}
            >
              <option value="todos">Todos</option>
              <option value="produto">Produto acabado</option>
              <option value="insumo">Insumo / Materia-prima</option>
            </select>
          </label>

          <label>
            Tipo da movimentacao
            <select
              value={filtros.tipo}
              onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
            >
              <option value="todos">Todos</option>
              {TIPOS_MOVIMENTACAO.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Item
            <select
              value={filtros.produto}
              onChange={(e) => setFiltros({ ...filtros, produto: e.target.value })}
            >
              <option value="">Todos</option>
              {[
                ...(filtros.tipoItem !== "insumo"
                  ? estoqueProdutos.map((produto) => ({
                      chave: produto.produtoId || produto.produto,
                      nome: produto.produto,
                    }))
                  : []),
                ...(filtros.tipoItem !== "produto"
                  ? estoqueInsumos.map((insumo) => ({
                      chave: insumo.insumoId || insumo.nome,
                      nome: insumo.nome,
                    }))
                  : []),
              ].map((item) => {
                const nome = item.nome;

                return (
                  <option key={item.chave || nome} value={nome}>
                    {nome}
                  </option>
                );
              })}
            </select>
          </label>

          <label>
            Inicio
            <input
              type="date"
              value={filtros.inicio}
              onChange={(e) => setFiltros({ ...filtros, inicio: e.target.value })}
            />
          </label>

          <label>
            Fim
            <input
              type="date"
              value={filtros.fim}
              onChange={(e) => setFiltros({ ...filtros, fim: e.target.value })}
            />
          </label>

          <label>
            Status
            <select
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
            >
              <option value="todos">Todos</option>
              <option value="ativo">Ativo</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </label>

          <label>
            Busca
            <input
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              placeholder="Item, motivo, destinatario ou observacao"
            />
          </label>
        </div>
      </div>

      <div className="card section-card">
        <h3>Historico</h3>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>{renderCabecalhoOrdenavel("Data", "data")}</th>
                <th>Item</th>
                <th>{renderCabecalhoOrdenavel("Tipo", "tipo")}</th>
                <th>{renderCabecalhoOrdenavel("Nome", "produto")}</th>
                <th>{renderCabecalhoOrdenavel("Quantidade", "quantidade")}</th>
                <th>{renderCabecalhoOrdenavel("Custo", "custoTotal")}</th>
                <th>Motivo</th>
                <th>Destinatario</th>
                <th>{renderCabecalhoOrdenavel("Status", "status")}</th>
                <th>Acoes</th>
              </tr>
            </thead>

            <tbody>
              {registrosOrdenados.map(({ registro }) => (
                <tr key={registro.id}>
                  <td>{dataBR(registro.data)}</td>
                  <td>
                    <span className="badge badge-purple">
                      {(registro.tipoItem || "produto") === "insumo"
                        ? "Insumo"
                        : "Produto"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        registro.tipo === "doacao" ? "badge-info" : "badge-danger"
                      }`}
                    >
                      {obterLabelTipo(registro.tipo)}
                    </span>
                  </td>
                  <td>{registro.produtoNome || registro.insumoNome}</td>
                  <td>
                    {numeroBR(registro.quantidade, 3)} {registro.unidade || ""}
                  </td>
                  <td>{moedaBR(registro.custoTotalSnapshot || 0)}</td>
                  <td>{registro.motivo || "-"}</td>
                  <td>{registro.destinatario || "-"}</td>
                  <td>
                    <span
                      className={`badge ${
                        registro.status === "cancelado"
                          ? "badge-warning"
                          : "badge-success"
                      }`}
                    >
                      {registro.status === "cancelado" ? "Cancelado" : "Ativo"}
                    </span>
                  </td>
                  <td>
                    <ActionMenu
                      label="Abrir acoes da baixa"
                      items={[
                        {
                          label: "Cancelar registro",
                          danger: true,
                          disabled: registro.status === "cancelado",
                          onClick: () => cancelarRegistro(registro),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}

              {registrosOrdenados.length === 0 && (
                <tr>
                  <td colSpan="10">Nenhuma perda ou doacao registrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
