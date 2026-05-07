import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ActionMenu from "../components/ActionMenu";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import { usePlano } from "../hooks/usePlano";
import { useTableSort } from "../hooks/useTableSort";
import { moedaBR, inteiroBR, dataBR, numeroBR } from "../utils/formatters";
import { useParametros } from "../hooks/useParametros";

const obterStatusFinanceiroVenda = (statusPagamento) => {
  const status = String(statusPagamento || "pendente").trim().toLowerCase();

  const statusFinanceiro = {
    pago: "Recebido",
    recebido: "Recebido",
    pendente: "Pendente",
    parcial: "Parcial",
    cancelado: "Cancelado",
  };

  return statusFinanceiro[status] || "Pendente";
};

export default function Financeiro() {
  const navigate = useNavigate();
  // ================================
  // 🔹 CONTEXTO GLOBAL
  // ================================
  const { vendas, despesas, addItem, updateItem, deleteItem } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();
  const { podeUsarDRE } = usePlano();
  const { categoriasDespesa = [] } = useParametros();

  const categoriasDespesaAtivas = categoriasDespesa.filter(
    (categoria) => categoria.ativo
  );
  const ordenacaoFluxo = useTableSort({
    chave: "data",
    direcao: "desc",
  });
  const ordenacaoDespesas = useTableSort({
    chave: "data",
    direcao: "desc",
  });
  

  // ================================
  // 🔹 FORMULÁRIO DE DESPESA
  // ================================
  const [form, setForm] = useState({
    descricao: "",
    categoria: "",
    valor: "",
    data: "",
    status: "Pago",
  });

  // ================================
  // 🔹 CONTROLE DE EDIÇÃO
  // ================================
  const [editIndex, setEditIndex] = useState(null);

  // ================================
  // 🔹 FILTROS
  // ================================
  const [filtro, setFiltro] = useState({
    inicio: "",
    fim: "",
  });

  // ================================
  // 🔹 ENTRADAS AUTOMÁTICAS DAS VENDAS
  // ================================
  const entradas = (vendas || []).map((venda) => ({
    tipo: "Entrada",
    descricao: `${venda.numeroPedido || "Pedido"} - ${
      venda.cliente || "Cliente não informado"
    }`,
    categoria: "Venda",
    valor: Number(venda.total ?? 0),
    data: venda.dataPagamento || venda.data || "",
    status: obterStatusFinanceiroVenda(venda.statusPagamento),
  }));

  // ================================
  // 🔹 SAÍDAS CADASTRADAS
  // ================================
  const saidas = (despesas || []).map((despesa) => ({
    tipo: "Saída",
    descricao: despesa.descricao || "Despesa sem descrição",
    categoria: despesa.categoria || "Outros",
    valor: Number(despesa.valor ?? 0),
    data: despesa.data || "",
    status: despesa.status || "Pago",
  }));

  // ================================
  // 🔹 MOVIMENTAÇÕES GERAIS COM FILTRO
  // ================================
  const movimentacoes = [...entradas, ...saidas]
    .filter((item) => {
      if (filtro.inicio && item.data < filtro.inicio) return false;
      if (filtro.fim && item.data > filtro.fim) return false;
      return true;
    })
    .sort((a, b) => new Date(b.data) - new Date(a.data));

  const movimentacoesOrdenadas = ordenacaoFluxo.ordenar(
    movimentacoes,
    (item, chave) => {
      const valores = {
        data: item.data || "",
        tipo: item.tipo || "",
        categoria: item.categoria || "",
        descricao: item.descricao || "",
        status: item.status || "",
        valor: Number(item.valor || 0),
      };

      return valores[chave] ?? "";
    }
  );

  // ================================
  // 🔹 TOTAIS
  // ================================
  const totalEntradas = movimentacoes
    .filter((m) => m.tipo === "Entrada" && m.status === "Recebido")
    .reduce((total, item) => total + Number(item.valor ?? 0), 0);

  const totalAReceber = movimentacoes
    .filter((m) => m.tipo === "Entrada" && m.status === "Pendente")
    .reduce((total, item) => total + Number(item.valor ?? 0), 0);

  const totalSaidas = movimentacoes
    .filter((m) => m.tipo === "Saída")
    .reduce((total, item) => total + Number(item.valor ?? 0), 0);

  const saldo = totalEntradas - totalSaidas;
  const totalVendas = (vendas || []).length;

  const ticketMedio =
    totalVendas > 0
      ? (vendas || []).reduce(
          (total, venda) => total + Number(venda.total ?? 0),
          0
        ) / totalVendas
      : 0;

  const despesasPendentes = (despesas || []).filter(
    (despesa) => despesa.status === "Pendente"
  ).length;

  const totalDespesasPendentes = (despesas || [])
    .filter((despesa) => despesa.status === "Pendente")
    .reduce((total, despesa) => total + Number(despesa.valor ?? 0), 0);

  const temDespesasPendentes = despesasPendentes > 0;
  const saudeFinanceira =
    saldo > 0
      ? {
          classe: "finance-health-ok",
          badge: "Saudável",
          mensagem: "Caixa positivo no período selecionado.",
          Icone: CheckCircle2,
        }
      : saldo < 0
      ? {
          classe: "finance-health-alert",
          badge: "Atenção",
          mensagem: "Caixa negativo no período selecionado.",
          Icone: AlertTriangle,
        }
      : {
          classe: "finance-health-neutral",
          badge: "Neutro",
          mensagem: "Sem movimentação relevante no período selecionado.",
          Icone: Info,
        };
  const IconeSaudeFinanceira = saudeFinanceira.Icone;


// ================================
// 🔹 DRE - DEMONSTRATIVO DE RESULTADO
// ================================
const vendasFiltradas = (vendas || []).filter((venda) => {
  const dataVenda = venda.data || "";

  if (filtro.inicio && dataVenda < filtro.inicio) return false;
  if (filtro.fim && dataVenda > filtro.fim) return false;

  return true;
});

const despesasFiltradas = (despesas || []).filter((despesa) => {
  const dataDespesa = despesa.data || "";

  if (filtro.inicio && dataDespesa < filtro.inicio) return false;
  if (filtro.fim && dataDespesa > filtro.fim) return false;

  return true;
});

const receitaBruta = vendasFiltradas.reduce(
  (total, venda) => total + Number(venda.valorBruto ?? venda.total ?? 0),
  0
);

const descontosVendas = vendasFiltradas.reduce(
  (total, venda) => total + Number(venda.desconto ?? 0),
  0
);

const receitaLiquida = receitaBruta - descontosVendas;

const custoProdutosVendidos = vendasFiltradas.reduce(
  (total, venda) => total + Number(venda.custoTotal ?? 0),
  0
);

const lucroBruto = receitaLiquida - custoProdutosVendidos;

const despesasOperacionais = despesasFiltradas.reduce(
  (total, despesa) => total + Number(despesa.valor ?? 0),
  0
);

const resultadoLiquido = lucroBruto - despesasOperacionais;

const margemBruta =
  receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;

const margemLiquida =
  receitaLiquida > 0 ? (resultadoLiquido / receitaLiquida) * 100 : 0;


  // ================================
  // 🔹 DESPESAS POR CATEGORIA (DRE)
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

  const despesasOrdenadas = ordenacaoDespesas.ordenar(
    (despesas || []).map((despesa, index) => ({
      despesa,
      index,
    })),
    ({ despesa }, chave) => {
      const valores = {
        data: despesa.data || "",
        categoria: despesa.categoria || "",
        descricao: despesa.descricao || "",
        status: despesa.status || "",
        valor: Number(despesa.valor || 0),
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
  // 🔹 LIMPAR FORMULÁRIO
  // ================================
  const limparFormulario = () => {
    setForm({
      descricao: "",
      categoria: "",
      valor: "",
      data: "",
      status: "Pago",
    });

    setEditIndex(null);
  };

  // ================================
  // 🔹 SALVAR / ATUALIZAR DESPESA
  // ================================
  const salvarDespesa = async () => {
    if (
      !form.descricao ||
      !form.categoria ||
      !form.data ||
      Number(form.valor) <= 0
    ) {
      showToast("Preencha descrição, categoria, data e um valor maior que zero.", "warning");
      return;
    }

    const despesaTratada = {
      descricao: form.descricao,
      categoria: form.categoria,
      valor: Number(form.valor),
      data: form.data,
      status: form.status,
    };

    if (editIndex !== null) {
      const despesa = despesas[editIndex];

      if (!despesa?.id) {
        showToast("Não foi possível encontrar o ID da despesa para atualizar.", "error");
        return;
      }

      await updateItem("despesas", despesa.id, despesaTratada);
    } else {
      await addItem("despesas", despesaTratada);
    }

    limparFormulario();
  };

  // ================================
  // 🔹 EDITAR DESPESA
  // ================================
  const editarDespesa = (index) => {
    const despesa = despesas[index];

    setForm({
      descricao: despesa.descricao || "",
      categoria: despesa.categoria || "",
      valor: despesa.valor || "",
      data: despesa.data || "",
      status: despesa.status || "Pago",
    });

    setEditIndex(index);
  };

  // ================================
  // 🔹 EXCLUIR DESPESA
  // ================================
  const excluirDespesa = async (index) => {
    const confirmado = await confirmar("Deseja excluir esta despesa?");
    if (!confirmado) return;

    const despesa = despesas[index];

    if (!despesa?.id) {
      showToast("Não foi possível encontrar o ID da despesa para excluir.", "error");
      return;
    }

    await deleteItem("despesas", despesa.id);

    if (editIndex === index) {
      limparFormulario();
    }
  };

  const renderMenuDespesa = (index) => (
    <ActionMenu
      label="Abrir acoes da despesa"
      items={[
        {
          label: "Editar despesa",
          onClick: () => editarDespesa(index),
        },
        {
          label: "Excluir despesa",
          danger: true,
          onClick: () => excluirDespesa(index),
        },
      ]}
    />
  );

  // ================================
  // 🔹 ESTILO AUXILIAR DOS CARDS
  // ================================
  const cardNumberStyle = {
    fontSize: "28px",
    margin: "8px 0",
  };

  // ================================
  // 🔹 RENDERIZAÇÃO
  // ================================
  return (
    <div>
      <h1 className="page-title">Financeiro</h1>

      {/* ================================
          🔹 CARDS DE RESUMO
      ================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "18px",
          marginBottom: "25px",
        }}
      >
        <div className="card" style={{ borderLeft: "5px solid #16a34a" }}>
          <p style={{ color: "#64748b" }}>Entradas Recebidas</p>
          <h2 style={{ ...cardNumberStyle, color: "#16a34a" }}>
            {moedaBR(totalEntradas)}
          </h2>
          <small>Vendas pagas filtradas</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #f59e0b" }}>
          <p style={{ color: "#64748b" }}>A Receber</p>
          <h2 style={{ ...cardNumberStyle, color: "#f59e0b" }}>
            {moedaBR(totalAReceber)}
          </h2>
          <small>Vendas pendentes filtradas</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #dc2626" }}>
          <p style={{ color: "#64748b" }}>Saídas</p>
          <h2 style={{ ...cardNumberStyle, color: "#dc2626" }}>
            {moedaBR(totalSaidas)}
          </h2>
          <small>Despesas filtradas</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #2563eb" }}>
          <p style={{ color: "#64748b" }}>Saldo</p>
          <h2
            style={{
              ...cardNumberStyle,
              color: saldo >= 0 ? "#2563eb" : "#dc2626",
            }}
          >
            {moedaBR(saldo)}
          </h2>
          <small>Entradas - saídas</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #f59e0b" }}>
          <p style={{ color: "#64748b" }}>Ticket Médio</p>
          <h2 style={{ ...cardNumberStyle, color: "#f59e0b" }}>
            {moedaBR(ticketMedio)}
          </h2>
          <small>Média por pedido</small>
        </div>
      </div>

      {/* ================================
          🔹 ALERTAS FINANCEIROS
      ================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px",
          marginBottom: "25px",
        }}
      >
        <div className={`card finance-health-card ${saudeFinanceira.classe}`}>
          <div className="finance-health-header">
            <div className="finance-health-title">
              <IconeSaudeFinanceira size={20} aria-hidden="true" />
              <h3>Saúde Financeira</h3>
            </div>

            <span className="finance-health-badge">
              {saudeFinanceira.badge}
            </span>
          </div>

          <strong className="finance-health-value">{moedaBR(saldo)}</strong>
          <p className="finance-health-message">{saudeFinanceira.mensagem}</p>
        </div>

        <div
          className={`card pending-card ${
            temDespesasPendentes ? "pending-card-alert" : "pending-card-ok"
          }`}
        >
          <div className="pending-card-header">
            <div className="pending-card-title">
              {temDespesasPendentes ? (
                <AlertTriangle size={20} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={20} aria-hidden="true" />
              )}
              <h3>Despesas Pendentes</h3>
            </div>

            <span className="pending-badge">
              {temDespesasPendentes ? "Atenção" : "Em dia"}
            </span>
          </div>

          {temDespesasPendentes ? (
            <div className="pending-card-content">
              <div>
                <small>Quantidade</small>
                <strong className="pending-value">
                  {inteiroBR(despesasPendentes)}
                </strong>
              </div>

              <div>
                <small>Total pendente</small>
                <strong className="pending-value">
                  {moedaBR(totalDespesasPendentes)}
                </strong>
              </div>
            </div>
          ) : (
            <p className="pending-card-message">
              Nenhuma despesa pendente no período.
            </p>
          )}
        </div>
      </div>

      {/* ================================
          🔹 FILTROS
      ================================= */}
      <div className="card">
        <h3>Filtros por Período</h3>

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

      <br />

      {/* ================================
          🔹 CADASTRO DE DESPESAS
      ================================= */}
      <div className="card">
        <h3>{editIndex !== null ? "Editar Despesa" : "Nova Despesa"}</h3>

        <input
          placeholder="Descrição"
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
        />

        <select
          value={form.categoria}
          onChange={(e) => setForm({ ...form, categoria: e.target.value })}
        >
          <option value="">Selecione uma categoria</option>

          {categoriasDespesaAtivas.length > 0 ? (
            categoriasDespesaAtivas.map((categoria) => (
              <option key={categoria.id} value={categoria.nome}>
                {categoria.nome}
              </option>
            ))
          ) : (
            <option value="" disabled>
              Nenhuma categoria ativa
            </option>
          )}
        </select>

        <input
          type="number"
          step="0.01"
          placeholder="Valor"
          value={form.valor}
          onChange={(e) => setForm({ ...form, valor: e.target.value })}
        />

        <input
          type="date"
          value={form.data}
          onChange={(e) => setForm({ ...form, data: e.target.value })}
        />

        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
        >
          <option>Pago</option>
          <option>Pendente</option>
        </select>

        <button onClick={salvarDespesa}>
          {editIndex !== null ? "Atualizar Despesa" : "Salvar Despesa"}
        </button>

        {editIndex !== null && (
          <button onClick={limparFormulario}>Cancelar</button>
        )}
      </div>

      <br />

    {/* ================================
        🔹 DRE PROFISSIONAL
    ================================ */}
        {podeUsarDRE ? (
        <div className="card">
          <h3>DRE - Demonstrativo de Resultado</h3>

          <table>
            <tbody>
              <tr>
                <td><strong>Receita Bruta</strong></td>
                <td style={{ color: "#16a34a", fontWeight: "700" }}>
                  {moedaBR(receitaBruta)}
                </td>
              </tr>

              <tr>
                <td>(-) Descontos concedidos</td>
                <td style={{ color: "#dc2626" }}>
                  {moedaBR(descontosVendas)}
                </td>
              </tr>

              <tr>
                <td><strong>= Receita Líquida</strong></td>
                <td style={{ fontWeight: "700" }}>
                  {moedaBR(receitaLiquida)}
                </td>
              </tr>

              <tr>
                <td>(-) Custo dos Produtos Vendidos</td>
                <td style={{ color: "#dc2626" }}>
                  {moedaBR(custoProdutosVendidos)}
                </td>
              </tr>

              <tr>
                <td><strong>= Lucro Bruto</strong></td>
                <td
                  style={{
                    color: lucroBruto >= 0 ? "#16a34a" : "#dc2626",
                    fontWeight: "700",
                  }}
                >
                  {moedaBR(lucroBruto)}
                </td>
              </tr>

              <tr>
              <td><strong>(-) Despesas Operacionais</strong></td>
              <td style={{ color: "#dc2626", fontWeight: "700" }}>
                {moedaBR(despesasOperacionais)}
              </td>
            </tr>

            {Object.entries(despesasPorCategoria).map(([categoria, valor]) => (
              <tr key={categoria}>
                <td style={{ paddingLeft: "20px", color: "#64748b" }}>
                  • {categoria}
                </td>
                <td style={{ color: "#dc2626" }}>
                  {moedaBR(valor)}
                </td>
              </tr>
            ))}

              <tr>
                <td><strong>= Resultado Líquido</strong></td>
                <td
                  style={{
                    color: resultadoLiquido >= 0 ? "#16a34a" : "#dc2626",
                    fontWeight: "800",
                    fontSize: "18px",
                  }}
                >
                  {moedaBR(resultadoLiquido)}
                </td>
              </tr>
            </tbody>
          </table>

          <br />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "18px",
            }}
          >
            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: "#f1f5f9",
              }}
            >
              <strong>Margem Bruta</strong>
              <h2>{numeroBR(margemBruta, 2)}%</h2>
            </div>

            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: resultadoLiquido >= 0 ? "#dcfce7" : "#fee2e2",
                color: resultadoLiquido >= 0 ? "#166534" : "#991b1b",
              }}
            >
              <strong>Margem Líquida</strong>
              <h2>{numeroBR(margemLiquida, 2)}%</h2>
            </div>
          </div>
        </div>
        ) : (
          <div className="card plan-locked-card">
            <h3>DRE - Demonstrativo de Resultado</h3>
            <p>Recurso disponível no plano Profissional.</p>
            <button
              type="button"
              onClick={() => {
                showToast("Recurso disponível no plano Profissional.", "warning");
                navigate("/planos");
              }}
            >
              Ver planos
            </button>
          </div>
        )}

        <br />

      {/* ================================
          🔹 FLUXO DE CAIXA
      ================================= */}
      <div className="card">
        <h3>Fluxo de Caixa</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Data", "data", ordenacaoFluxo)}</th>
              <th>{renderCabecalhoOrdenavel("Tipo", "tipo", ordenacaoFluxo)}</th>
              <th>{renderCabecalhoOrdenavel("Categoria", "categoria", ordenacaoFluxo)}</th>
              <th>{renderCabecalhoOrdenavel("Descrição", "descricao", ordenacaoFluxo)}</th>
              <th>{renderCabecalhoOrdenavel("Status", "status", ordenacaoFluxo)}</th>
              <th>{renderCabecalhoOrdenavel("Valor", "valor", ordenacaoFluxo)}</th>
            </tr>
          </thead>

          <tbody>
            {movimentacoesOrdenadas.map((item, index) => (
              <tr key={`${item.descricao}-${item.data}-${index}`}>
                <td>{dataBR(item.data)}</td>

                <td>
                  <span
                    style={{
                      padding: "5px 10px",
                      borderRadius: "20px",
                      background:
                        item.tipo === "Entrada" ? "#dcfce7" : "#fee2e2",
                      color: item.tipo === "Entrada" ? "#166534" : "#991b1b",
                    }}
                  >
                    {item.tipo}
                  </span>
                </td>

                <td>{item.categoria}</td>
                <td>{item.descricao}</td>

                <td>
                  <span
                    style={{
                      padding: "5px 10px",
                      borderRadius: "20px",
                      background:
                        item.status === "Pago" || item.status === "Recebido"
                          ? "#dcfce7"
                          : item.status === "Cancelado"
                          ? "#fee2e2"
                          : item.status === "Parcial"
                          ? "#dbeafe"
                          : "#fef3c7",
                      color:
                        item.status === "Pago" || item.status === "Recebido"
                          ? "#166534"
                          : item.status === "Cancelado"
                          ? "#991b1b"
                          : item.status === "Parcial"
                          ? "#1d4ed8"
                          : "#92400e",
                    }}
                  >
                    {item.status}
                  </span>
                </td>

                <td
                  style={{
                    color: item.tipo === "Entrada" ? "#16a34a" : "#dc2626",
                    fontWeight: "600",
                  }}
                >
                  {item.tipo === "Entrada" ? "+" : "-"}{" "}
                  {moedaBR(item.valor || 0)}
                </td>
              </tr>
            ))}

            {movimentacoesOrdenadas.length === 0 && (
              <tr>
                <td colSpan="6">Nenhuma movimentação encontrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <br />

      {/* ================================
          🔹 DESPESAS CADASTRADAS
      ================================= */}
      <div className="card">
        <h3>Despesas Cadastradas</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Data", "data", ordenacaoDespesas)}</th>
              <th>{renderCabecalhoOrdenavel("Categoria", "categoria", ordenacaoDespesas)}</th>
              <th>{renderCabecalhoOrdenavel("Descrição", "descricao", ordenacaoDespesas)}</th>
              <th>{renderCabecalhoOrdenavel("Status", "status", ordenacaoDespesas)}</th>
              <th>{renderCabecalhoOrdenavel("Valor", "valor", ordenacaoDespesas)}</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {despesasOrdenadas.map(({ despesa, index }) => (
              <tr key={despesa.id || index}>
                <td>{dataBR(despesa.data)}</td>
                <td>{despesa.categoria}</td>
                <td>{despesa.descricao}</td>

                <td>
                  <span
                    style={{
                      padding: "5px 10px",
                      borderRadius: "20px",
                      background:
                        despesa.status === "Pago" ? "#dcfce7" : "#fef3c7",
                      color: despesa.status === "Pago" ? "#166534" : "#92400e",
                    }}
                  >
                    {despesa.status}
                  </span>
                </td>

                <td>{moedaBR(despesa.valor || 0)}</td>

                <td>{renderMenuDespesa(index)}</td>
              </tr>
            ))}

            {(!despesas || despesas.length === 0) && (
              <tr>
                <td colSpan="6">Nenhuma despesa cadastrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
