import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import { useTableSort } from "../hooks/useTableSort";
import ActionMenu from "../components/ActionMenu";
import { moedaBR, numeroBR, inteiroBR, dataBR } from "../utils/formatters";
import { extrairNumeroCodigo } from "../utils/sortUtils";
import {
  calcularEstoqueInsumos,
  calcularEstoqueProdutos,
} from "../utils/estoqueProdutos";

const normalizarClasseIndustrial = (valor) =>
  String(valor || "produto_acabado").trim();

const getClasseIndustrialLabel = (valor) => {
  const classes = {
    produto_acabado: "Produto acabado",
    semiacabado: "Semiacabado",
  };

  return classes[normalizarClasseIndustrial(valor)] || "Outro";
};

const getClasseIndustrialBadge = (valor) => {
  const classes = {
    produto_acabado: "badge-success",
    semiacabado: "badge-warning",
  };

  return classes[normalizarClasseIndustrial(valor)] || "badge-info";
};

export default function Producao() {
  // ================================
  // 🔹 CONTEXTO GLOBAL DO ERP
  // ================================
  const {
  produtos,
  insumos,
  producoes,
  vendas = [],
  perdasDoacoes = [],
  addItem,
  deleteItem,
} = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();
  const ordenacaoProducoes = useTableSort({
    chave: "data",
    direcao: "asc",
  });

  // ================================
  // 🔹 FORMULÁRIO DE PRODUÇÃO
  // ================================
  const [form, setForm] = useState({
    produtoIndex: "",
    quantidade: "",
    data: "",
  });

  // ================================
  // 🔹 CALCULAR CUSTO MÉDIO DOS INSUMOS
  // ================================
  const calcularCustoMedio = (compras = []) => {
    const qtdTotal = compras.reduce(
      (total, compra) => total + Number(compra.quantidade || 0),
      0
    );

    const valorTotal = compras.reduce(
      (total, compra) => total + Number(compra.valorTotal || 0),
      0
    );

    return qtdTotal > 0 ? valorTotal / qtdTotal : 0;
  };

  // ================================
  // 🔹 PRODUTO SELECIONADO
  // ================================
  const produtoSelecionado =
    form.produtoIndex !== "" ? produtos[form.produtoIndex] : null;
  const produtosPorId = new Map(produtos.map((produto) => [produto.id, produto]));
  const getProdutoDaProducao = (producao = {}) =>
    produtosPorId.get(producao.produtoId) ||
    produtos.find(
      (produto) =>
        produto.codigo === producao.codigo ||
        produto.nome === producao.nomeProduto
    ) ||
    null;

  const produtosOrdenadosPorCodigo = produtos
    .map((produto, index) => ({
      produto,
      index,
    }))
    .filter(({ produto }) => String(produto.origemProduto || "fabricado") !== "revenda")
    .sort((itemA, itemB) => {
      const numeroA = extrairNumeroCodigo(itemA.produto.codigo);
      const numeroB = extrairNumeroCodigo(itemB.produto.codigo);

      if (numeroA !== numeroB) return numeroA - numeroB;

      return String(itemA.produto.codigo || "").localeCompare(
        String(itemB.produto.codigo || ""),
        "pt-BR",
        {
          numeric: true,
          sensitivity: "base",
        }
      );
    });

  // ================================
  // 🔹 CALCULAR CONSUMO DOS INSUMOS
  // ================================
  const calcularConsumos = () => {
    if (!produtoSelecionado) return [];

    return insumos.map((insumo) => {
      const consumoUnitario = Number(
        produtoSelecionado.consumos?.[insumo.nome] || 0
      );

      const quantidadeTotal =
        consumoUnitario * Number(form.quantidade || 0);

      const custoMedio = calcularCustoMedio(insumo.compras || []);

      const custoTotal = quantidadeTotal * custoMedio;

      return {
        nome: insumo.nome,
        unidade: insumo.unidade,
        quantidadeTotal,
        custoMedio,
        custoTotal,
      };
    });
  };

  const consumosCalculados = calcularConsumos();
  const estoqueInsumos = calcularEstoqueInsumos({
    insumos,
    producoes,
    perdasDoacoes,
  });
  const estoqueProdutos = calcularEstoqueProdutos({
    produtos,
    producoes,
    vendas,
    perdasDoacoes,
  });
  const calcularComponentesProduto = () => {
    if (!produtoSelecionado) return [];

    return Object.values(produtoSelecionado.componentesProduto || {})
      .map((componente) => {
        const produtoComponente =
          produtosPorId.get(componente.produtoId) ||
          produtos.find((produto) => produto.codigo === componente.codigo);
        const quantidadeUnitario = Number(componente.quantidade || 0);
        const quantidadeTotal = quantidadeUnitario * Number(form.quantidade || 0);
        const custoUnitarioSnapshot = Number(
          componente.custoUnitarioSnapshot ||
            produtoComponente?.custoUnitario ||
            0
        );

        return {
          produtoId: componente.produtoId || produtoComponente?.id || "",
          codigo: componente.codigo || produtoComponente?.codigo || "",
          nome: componente.nome || produtoComponente?.nome || "",
          unidade: componente.unidade || produtoComponente?.unidade || "un",
          quantidadeUnitario,
          quantidadeTotal,
          custoUnitarioSnapshot,
          custoTotal: quantidadeTotal * custoUnitarioSnapshot,
        };
      })
      .filter((componente) => componente.quantidadeTotal > 0);
  };
  const componentesProdutoCalculados = calcularComponentesProduto();

  // ================================
  // 🔹 CUSTOS DA PRODUÇÃO
  // ================================
  const custoTotalInsumos = consumosCalculados.reduce(
    (total, item) => total + Number(item.custoTotal || 0),
    0
  );
  const custoTotalComponentesProduto = componentesProdutoCalculados.reduce(
    (total, item) => total + Number(item.custoTotal || 0),
    0
  );
  const custoTotalProducao = custoTotalInsumos + custoTotalComponentesProduto;

  const custoUnitario =
    Number(form.quantidade || 0) > 0
      ? custoTotalProducao / Number(form.quantidade)
      : 0;

  // ================================
  // 🔹 RESUMOS DA PÁGINA
  // ================================
  const totalProduzido = producoes.reduce(
    (total, producao) => total + Number(producao.quantidade || 0),
    0
  );

  const custoTotalHistorico = producoes.reduce(
    (total, producao) => total + Number(producao.custoTotal || 0),
    0
  );

  const custoMedioHistorico =
    totalProduzido > 0 ? custoTotalHistorico / totalProduzido : 0;

  const producoesOrdenadas = ordenacaoProducoes.ordenar(
    producoes.map((producao, index) => ({
      producao,
      index,
    })),
    ({ producao }, chave) => {
      const valores = {
        data: producao.data || "",
        produto: producao.produto || producao.nomeProduto || "",
        quantidade: Number(producao.quantidade || 0),
        custoTotal: Number(producao.custoTotal || 0),
        custoUnitario: Number(producao.custoUnitario || 0),
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
  // 🔹 VALIDAR ESTOQUE DE INSUMOS
  // ================================
  const validarEstoque = () => {
    for (let consumo of consumosCalculados) {
      const insumo = insumos.find((i) => i.nome === consumo.nome);
      const estoqueInsumo = estoqueInsumos.find(
        (item) => item.insumoId === insumo?.id || item.nome === consumo.nome
      );

      // Energia entra como custo, mas não bloqueia produção
      if (
        insumo &&
        insumo.nome !== "Energia" &&
        Number(estoqueInsumo?.saldo ?? insumo.estoque ?? 0) <
          Number(consumo.quantidadeTotal || 0)
      ) {
        showToast(`Estoque insuficiente para ${insumo.nome}`, "warning");
        return false;
      }
    }

    for (let componente of componentesProdutoCalculados) {
      const estoqueComponente = estoqueProdutos.find((item) =>
        componente.produtoId
          ? item.produtoId === componente.produtoId
          : item.codigo === componente.codigo
      );

      if (
        Number(estoqueComponente?.saldo || 0) <
        Number(componente.quantidadeTotal || 0)
      ) {
        showToast(
          `Estoque insuficiente do componente ${componente.codigo} - ${componente.nome}.`,
          "warning"
        );
        return false;
      }
    }

    return true;
  };

  // ================================
  // 🔹 REGISTRAR PRODUÇÃO
  // ================================
     const registrarProducao = async () => {
  if (!produtoSelecionado || !form.quantidade || !form.data) {
    showToast("Selecione o produto, informe a quantidade e a data.", "warning");
    return;
  }

  if (Number(form.quantidade) <= 0) {
    showToast("Informe uma quantidade válida.", "warning");
    return;
  }

  if (!validarEstoque()) return;

    const novaProducao = {
      produtoId: produtoSelecionado.id || "",
      produto: `${produtoSelecionado.codigo} - ${produtoSelecionado.nome} ${produtoSelecionado.tipo}`,
      codigo: produtoSelecionado.codigo,
      nomeProduto: produtoSelecionado.nome,
      tipo: produtoSelecionado.tipo,
      quantidade: Number(form.quantidade),
      data: form.data,
      consumos: consumosCalculados,
      componentesProduto: componentesProdutoCalculados,
      custoTotal: custoTotalProducao,
      custoUnitario,
    };

    await addItem("producoes", novaProducao);

    setForm({
      produtoIndex: "",
      quantidade: "",
      data: "",
    });
  };
  // ================================
  // 🔹 EXCLUIR PRODUÇÃO
  // ================================
    const excluirProducao = async (index) => {
    const confirmado = await confirmar("Deseja excluir esta produção?");
    if (!confirmado) return;

    const producao = producoes[index];

    await deleteItem("producoes", producao.id);
  };

  // ================================
  // 🔹 RENDERIZAÇÃO
  // ================================
  return (
    <div>
      <h1 className="page-title">Produção Inteligente</h1>

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
          <p style={{ color: "#64748b" }}>Total Produzido</p>
          <h2 style={{ color: "#2563eb" }}>{totalProduzido}</h2>
          <small>Unidades fabricadas</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #dc2626" }}>
          <p style={{ color: "#64748b" }}>Custo Total</p>
          <h2 style={{ color: "#dc2626" }}>{moedaBR(custoTotalHistorico)}</h2>
          <small>Custo acumulado</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #16a34a" }}>
          <p style={{ color: "#64748b" }}>Custo Médio</p>
          <h2 style={{ color: "#16a34a" }}>{moedaBR(custoMedioHistorico)}</h2>
          <small>Custo por unidade produzida</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #7c3aed" }}>
          <p style={{ color: "#64748b" }}>Registros</p>
          <h2 style={{ color: "#7c3aed" }}>{inteiroBR(producoes.length)}</h2>
          <small>Produções registradas</small>
        </div>
      </div>

      {/* ================================
          🔹 REGISTRAR PRODUÇÃO
      ================================= */}
      <div className="card">
        <h3>Registrar Produção</h3>

        <select
          value={form.produtoIndex}
          onChange={(e) =>
            setForm({ ...form, produtoIndex: e.target.value })
          }
        >
          <option value="">Selecione o produto</option>

          {produtosOrdenadosPorCodigo.map(({ produto, index }) => (
            <option key={index} value={index}>
              {produto.codigo} - {produto.nome} {produto.tipo}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Quantidade produzida"
          value={form.quantidade}
          onChange={(e) =>
            setForm({ ...form, quantidade: e.target.value })
          }
        />

        <input
          type="date"
          value={form.data}
          onChange={(e) => setForm({ ...form, data: e.target.value })}
        />


        <button onClick={registrarProducao}>Registrar Produção</button>
      </div>

      <br />

      {/* ================================
          🔹 PRÉVIA DA PRODUÇÃO
      ================================= */}
      {produtoSelecionado && (
        <div className="card">
          <h3>Prévia da Produção</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "15px",
              marginBottom: "20px",
            }}
          >
            <div>
              <small>Produto</small>
              <h4>
                {produtoSelecionado.codigo} - {produtoSelecionado.nome}{" "}
                {produtoSelecionado.tipo}
              </h4>
            </div>

            <div>
              <small>Quantidade</small>
              <h4>{form.quantidade || 0} unidades</h4>
            </div>

            <div>
              <small>Custo Total</small>
              <h4 style={{ color: "#dc2626" }}>
                {moedaBR(custoTotalProducao)}
              </h4>
            </div>

            <div>
              <small>Custo Unitário</small>
              <h4>{moedaBR(custoUnitario)}</h4>
            </div>

          </div>

          <h3>Consumo de Insumos</h3>

          <table>
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Qtd Consumida</th>
                <th>Estoque Atual</th>
                <th>Custo Médio</th>
                <th>Custo Total</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {consumosCalculados.map((item, index) => {
                const insumo = insumos.find((i) => i.nome === item.nome);
                const estoqueInsumo = estoqueInsumos.find(
                  (estoque) =>
                    estoque.insumoId === insumo?.id || estoque.nome === item.nome
                );
                const estoqueAtual = Number(
                  estoqueInsumo?.saldo ?? insumo?.estoque ?? 0
                );

                const faltaEstoque =
                  item.nome !== "Energia" &&
                  estoqueAtual < Number(item.quantidadeTotal || 0);

                return (
                  <tr key={item.nome || index}>
                    <td>{item.nome}</td>

                    <td>
                      {numeroBR(item.quantidadeTotal,3)} {item.unidade}
                    </td>

                    <td>
                      {numeroBR(estoqueAtual,3)} {item.unidade}
                    </td>

                    <td>{moedaBR(item.custoMedio)}</td>

                    <td>{moedaBR(item.custoTotal)}</td>

                    <td>
                      <span
                        style={{
                          padding: "5px 10px",
                          borderRadius: "20px",
                          background: faltaEstoque ? "#fee2e2" : "#dcfce7",
                          color: faltaEstoque ? "#991b1b" : "#166534",
                        }}
                      >
                        {item.nome === "Energia"
                          ? "Custo"
                          : faltaEstoque
                          ? "Insuficiente"
                          : "OK"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {componentesProdutoCalculados.length > 0 && (
            <>
              <br />
              <h3>Componentes de Produto/Semiacabado</h3>

              <table>
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>Qtd Consumida</th>
                    <th>Estoque Atual</th>
                    <th>Custo Unit.</th>
                    <th>Custo Total</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {componentesProdutoCalculados.map((item, index) => {
                    const estoqueComponente = estoqueProdutos.find((estoque) =>
                      item.produtoId
                        ? estoque.produtoId === item.produtoId
                        : estoque.codigo === item.codigo
                    );
                    const estoqueAtual = Number(estoqueComponente?.saldo || 0);
                    const faltaEstoque =
                      estoqueAtual < Number(item.quantidadeTotal || 0);

                    return (
                      <tr key={item.produtoId || item.codigo || index}>
                        <td>
                          {item.codigo} - {item.nome}
                        </td>
                        <td>
                          {numeroBR(item.quantidadeTotal, 3)} {item.unidade}
                        </td>
                        <td>
                          {numeroBR(estoqueAtual, 3)} {item.unidade}
                        </td>
                        <td>{moedaBR(item.custoUnitarioSnapshot)}</td>
                        <td>{moedaBR(item.custoTotal)}</td>
                        <td>
                          <span
                            style={{
                              padding: "5px 10px",
                              borderRadius: "20px",
                              background: faltaEstoque ? "#fee2e2" : "#dcfce7",
                              color: faltaEstoque ? "#991b1b" : "#166534",
                            }}
                          >
                            {faltaEstoque ? "Insuficiente" : "OK"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <br />

      {/* ================================
          🔹 HISTÓRICO DE PRODUÇÃO
      ================================= */}
      <div className="card">
        <h3>Histórico de Produção</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Data", "data", ordenacaoProducoes)}</th>
              <th>{renderCabecalhoOrdenavel("Produto", "produto", ordenacaoProducoes)}</th>
              <th>Classe</th>
              <th>{renderCabecalhoOrdenavel("Qtd", "quantidade", ordenacaoProducoes)}</th>
              <th>{renderCabecalhoOrdenavel("Custo Total", "custoTotal", ordenacaoProducoes)}</th>
              <th>{renderCabecalhoOrdenavel("Custo Unit.", "custoUnitario", ordenacaoProducoes)}</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {producoesOrdenadas.map(({ producao: p, index }) => {
              const produtoCadastro = getProdutoDaProducao(p);
              const classeIndustrial = normalizarClasseIndustrial(
                produtoCadastro?.classeIndustrial
              );

              return (
              <tr key={p.id || index}>
                <td>{dataBR(p.data)}</td>
                <td>{p.produto}</td>
                <td>
                  <span className={`badge ${getClasseIndustrialBadge(classeIndustrial)}`}>
                    {getClasseIndustrialLabel(classeIndustrial)}
                  </span>
                </td>
                <td>{inteiroBR(p.quantidade)}</td>
                <td>{moedaBR(p.custoTotal)}</td>
                <td>{moedaBR(p.custoUnitario)}</td>

                <td>
                  <ActionMenu
                    label="Abrir ações da produção"
                    items={[
                      {
                        label: "Excluir produção",
                        danger: true,
                        onClick: () => excluirProducao(index),
                      },
                    ]}
                  />
                </td>
              </tr>
              );
            })}

            {producoes.length === 0 && (
              <tr>
                <td colSpan="7">Nenhuma produção registrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
