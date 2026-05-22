import { useMemo, useState } from "react";
import ActionMenu from "../components/ActionMenu";
import { useConfirmacao } from "../context/useConfirmacao";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useTableSort } from "../hooks/useTableSort";
import {
  calcularEstoqueProdutos,
  normalizarChaveProduto,
} from "../utils/estoqueProdutos";
import { dataBR, moedaBR, numeroBR } from "../utils/formatters";

const FORM_INICIAL = {
  tipo: "perda",
  produto: "",
  quantidade: "",
  data: new Date().toISOString().split("T")[0],
  motivo: "",
  destinatario: "",
  observacoes: "",
};

const FILTRO_INICIAL = {
  tipo: "todos",
  produto: "",
  inicio: "",
  fim: "",
  status: "ativo",
  busca: "",
};

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

  const produtosPorDescricao = useMemo(() => {
    const mapa = new Map();

    produtos.forEach((produto) => {
      const descricao = descreverProduto(produto);
      const chave = normalizarChaveProduto(descricao);

      if (chave) mapa.set(chave, produto);
    });

    return mapa;
  }, [produtos]);

  const produtoSelecionadoEstoque = estoqueProdutos.find(
    (produto) => produto.produto === form.produto
  );
  const produtoSelecionadoCadastro = produtosPorDescricao.get(
    normalizarChaveProduto(form.produto)
  );
  const quantidade = Number(form.quantidade || 0);
  const saldoDisponivel = Number(produtoSelecionadoEstoque?.saldo || 0);
  const custoUnitarioSnapshot = Number(produtoSelecionadoEstoque?.custoMedio || 0);
  const custoTotalSnapshot = quantidade * custoUnitarioSnapshot;
  const unidadeProduto =
    produtoSelecionadoCadastro?.fiscal?.unidadeTributavel ||
    produtoSelecionadoCadastro?.unidade ||
    "unidades";

  const limparFormulario = () => {
    setForm(FORM_INICIAL);
  };

  const registrarPerdaDoacao = async () => {
    if (!form.produto || !form.data || quantidade <= 0) {
      showToast("Selecione produto, data e quantidade valida.", "warning");
      return;
    }

    if (!produtoSelecionadoEstoque) {
      showToast("Produto nao encontrado no estoque.", "warning");
      return;
    }

    if (quantidade > saldoDisponivel) {
      showToast(
        `Estoque insuficiente. Saldo disponivel: ${numeroBR(saldoDisponivel, 3)}.`,
        "warning"
      );
      return;
    }

    const agora = new Date();

    const registro = {
      tipo: form.tipo,
      produtoId: produtoSelecionadoCadastro?.id || "",
      produtoNome: form.produto,
      quantidade,
      unidade: unidadeProduto,
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
      form.tipo === "doacao"
        ? "Doacao registrada com sucesso."
        : "Perda registrada com sucesso.",
      "success"
    );
    limparFormulario();
  };

  const cancelarRegistro = async (registro) => {
    if (registro.status === "cancelado") return;

    const confirmado = await confirmar(
      `Deseja cancelar este registro de ${
        registro.tipo === "doacao" ? "doacao" : "perda"
      }?`
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
      if (filtros.tipo !== "todos" && registro.tipo !== filtros.tipo) return false;
      if (filtros.status !== "todos" && registro.status !== filtros.status) return false;
      if (filtros.inicio && registro.data < filtros.inicio) return false;
      if (filtros.fim && registro.data > filtros.fim) return false;
      if (
        produtoFiltro &&
        normalizarChaveProduto(registro.produtoNome) !== produtoFiltro
      ) {
        return false;
      }

      if (!busca) return true;

      return [
        registro.produtoNome,
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
        produto: registro.produtoNome || "",
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
            Tipo
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            >
              <option value="perda">Perda</option>
              <option value="doacao">Doacao</option>
            </select>
          </label>

          <label>
            Produto
            <select
              value={form.produto}
              onChange={(e) => setForm({ ...form, produto: e.target.value })}
            >
              <option value="">Selecione o produto</option>
              {estoqueProdutos.map((produto) => (
                <option key={produto.produto} value={produto.produto}>
                  {produto.produto} - saldo: {numeroBR(produto.saldo, 3)}
                </option>
              ))}
            </select>
          </label>

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

        {produtoSelecionadoEstoque && (
          <div className="product-type-help">
            Saldo disponivel: {numeroBR(saldoDisponivel, 3)} {unidadeProduto}. Custo
            estimado da baixa: {moedaBR(custoTotalSnapshot)}.
          </div>
        )}

        <div className="action-row">
          <button type="button" onClick={registrarPerdaDoacao}>
            Registrar {form.tipo === "doacao" ? "Doacao" : "Perda"}
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
            Tipo
            <select
              value={filtros.tipo}
              onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
            >
              <option value="todos">Todos</option>
              <option value="perda">Perda</option>
              <option value="doacao">Doacao</option>
            </select>
          </label>

          <label>
            Produto
            <select
              value={filtros.produto}
              onChange={(e) => setFiltros({ ...filtros, produto: e.target.value })}
            >
              <option value="">Todos</option>
              {estoqueProdutos.map((produto) => (
                <option key={produto.produto} value={produto.produto}>
                  {produto.produto}
                </option>
              ))}
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
              placeholder="Produto, motivo, destinatario ou observacao"
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
                <th>{renderCabecalhoOrdenavel("Tipo", "tipo")}</th>
                <th>{renderCabecalhoOrdenavel("Produto", "produto")}</th>
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
                    <span
                      className={`badge ${
                        registro.tipo === "doacao" ? "badge-info" : "badge-danger"
                      }`}
                    >
                      {registro.tipo === "doacao" ? "Doacao" : "Perda"}
                    </span>
                  </td>
                  <td>{registro.produtoNome}</td>
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
                  <td colSpan="9">Nenhuma perda ou doacao registrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
