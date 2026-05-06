import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import { useTableSort } from "../hooks/useTableSort";
import ActionMenu from "../components/ActionMenu";
import { moedaBR, numeroBR } from "../utils/formatters";

export default function Produtos() {
  // ================================
  // 🔹 CONTEXTO GLOBAL DO ERP
  // ================================
  const { insumos, produtos, addItem, updateItem, deleteItem } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();

  // ================================
  // 🔹 FORMULÁRIO DO PRODUTO
  // ================================
  const [form, setForm] = useState({
    codigo: "",
    nome: "",
    tipoProduto: "unitario",
    tipo: "Geral",
    pesoUnidade: "",
    conteudoPorProduto: "",
    qtdPorMaco: "",
    qtdProducao: "",
    precoVenda: "",
    dataCadastro: "",
    consumos: {},
  });

  // ================================
  // 🔹 CONTROLE DE EDIÇÃO
  // ================================
  const [editIndex, setEditIndex] = useState(null);
  const ordenacaoProdutos = useTableSort({
    chave: "codigo",
    direcao: "asc",
  });

  // ================================
  // 🔹 FORMATAR DATA PT-BR
  // ================================
  const formatarDataBR = (data) => {
    if (!data) return "-";

    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
    
  };

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
  // 🔹 CALCULAR CUSTO UNITÁRIO DO PRODUTO
  // ================================
  const calcularCustoUnitario = () => {
    return insumos.reduce((total, insumo) => {
      const quantidadeConsumida = Number(form.consumos?.[insumo.nome] || 0);
      const custoMedio = calcularCustoMedio(insumo.compras || []);

      return total + quantidadeConsumida * custoMedio;
    }, 0);
  };

  // ================================
  // 🔹 RESULTADOS CALCULADOS
  // ================================
  const custoUnitario = calcularCustoUnitario();

  const tipoProduto = form.tipoProduto || "unitario";
  const produtoSimples = tipoProduto === "simples";
  const conteudoPorProduto = Number(
    form.conteudoPorProduto || form.qtdPorMaco || 0
  );
  const qtdProducao = Number(form.qtdProducao || 0);
  const precoVenda = Number(form.precoVenda || 0);

  const custoProducao = produtoSimples
    ? custoUnitario
    : custoUnitario * qtdProducao;

  const lucro = precoVenda - custoProducao;

  const margem =
    precoVenda > 0 ? (lucro / precoVenda) * 100 : 0;

  const valorUnitario = produtoSimples
    ? precoVenda
    : qtdProducao > 0
    ? precoVenda / qtdProducao
    : 0;

  const qtdMaco =
    !produtoSimples && Number(form.qtdPorMaco || 0) > 0
      ? qtdProducao / Number(form.qtdPorMaco)
      : 0;

  // ================================
  // 🔹 RESUMOS DA PÁGINA
  // ================================
  const totalProdutos = produtos.length;

  const margemMedia =
    produtos.length > 0
      ? produtos.reduce((total, produto) => total + Number(produto.margem || 0), 0) /
        produtos.length
      : 0;

  const produtoMaiorMargem = [...produtos].sort(
    (a, b) => Number(b.margem || 0) - Number(a.margem || 0)
  )[0];

  const produtoMenorMargem = [...produtos].sort(
    (a, b) => Number(a.margem || 0) - Number(b.margem || 0)
  )[0];

  const produtosOrdenados = ordenacaoProdutos.ordenar(
    produtos.map((produto, index) => ({
      produto,
      index,
    })),
    ({ produto }, chave) => {
      const valores = {
        dataCadastro: produto.dataCadastro || "",
        codigo: produto.codigo || "",
        nome: produto.nome || "",
        tipoProduto:
          produto.tipoProduto === "simples" ? "Caixa / Kit / Pacote" : "Unitário",
        tipo: produto.tipo || "",
        conteudoPorProduto: Number(
          produto.conteudoPorProduto || produto.qtdPorMaco || 1
        ),
        custoUnitario: Number(produto.custoUnitario || 0),
        custoProducao: Number(produto.custoProducao || 0),
        precoVenda: Number(produto.precoVenda || 0),
        lucro: Number(produto.lucro || 0),
        margem: Number(produto.margem || 0),
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
      codigo: "",
      nome: "",
      tipoProduto: "unitario",
      tipo: "Geral",
      pesoUnidade: "",
      conteudoPorProduto: "",
      qtdPorMaco: "",
      qtdProducao: "",
      precoVenda: "",
      dataCadastro: "",
      consumos: {},
    });

    setEditIndex(null);
  };

  // ================================
  // 🔹 SALVAR / ATUALIZAR PRODUTO
  // ================================
  const salvarProduto = async () => {
  if (!form.codigo || !form.nome || !form.precoVenda || !form.qtdProducao) {
    showToast(
      produtoSimples
        ? "Preencha código, nome, quantidade de produtos finais e preço de venda."
        : "Preencha código, nome, quantidade produzida e preço de venda.",
      "warning"
    );
    return;
  }

  const consumosNormalizados = Object.entries(form.consumos || {}).reduce(
    (acc, [insumo, quantidade]) => ({
      ...acc,
      [insumo]: Number(quantidade || 0),
    }),
    {}
  );

  const produtoCalculado = {
    ...form,
    tipoProduto,
    pesoUnidade: Number(form.pesoUnidade || 0),
    qtdPorMaco: Number(form.qtdPorMaco || 0),
    conteudoPorProduto: conteudoPorProduto || 1,
    qtdProducao,
    precoVenda,
    consumos: consumosNormalizados,
    dataCadastro: form.dataCadastro || new Date().toISOString().split("T")[0],
    custoUnitario,
    custoProducao,
    lucro,
    margem,
    valorUnitario,
    qtdMaco,
  };

  if (editIndex !== null) {
    const produto = produtos[editIndex];

    await updateItem("produtos", produto.id, produtoCalculado);
  } else {
    await addItem("produtos", produtoCalculado);
  }

    limparFormulario();
  };

  // ================================
  // 🔹 EDITAR PRODUTO
  // ================================
  const editarProduto = (index) => {
    const produto = produtos[index];

    setForm({
      codigo: produto.codigo || "",
      nome: produto.nome || "",
      tipoProduto: produto.tipoProduto || "unitario",
      tipo: produto.tipo || "Geral",
      pesoUnidade: produto.pesoUnidade || "",
      conteudoPorProduto:
        produto.conteudoPorProduto || produto.qtdPorMaco || "",
      qtdPorMaco: produto.qtdPorMaco || "",
      qtdProducao: produto.qtdProducao || "",
      precoVenda: produto.precoVenda || "",
      dataCadastro: produto.dataCadastro || "",
      consumos: produto.consumos || {},
    });

    setEditIndex(index);
  };

  // ================================
  // 🔹 EXCLUIR PRODUTO
  // ================================
    const excluirProduto = async (index) => {
      const confirmado = await confirmar("Deseja realmente excluir este produto?");
      if (!confirmado) return;

      const produto = produtos[index];

      await deleteItem("produtos", produto.id);

      if (editIndex === index) {
        limparFormulario();
      }
    };

  // ================================
  // 🔹 RENDERIZAÇÃO
  // ================================
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Produtos / Ficha Técnica</h1>
          <p className="page-subtitle">
            Cadastre produtos, defina consumo de insumos e acompanhe custos,
            margem e preço de venda por ficha técnica.
          </p>
        </div>
      </div>

      {/* ================================
          🔹 CARDS RESUMO
      ================================= */}
      <div className="summary-grid">
        <div className="card metric-card" style={{ "--metric-color": "#2563eb" }}>
          <p>Produtos cadastrados</p>
          <h2>{totalProdutos}</h2>
          <small>Itens com ficha técnica</small>
        </div>

        <div className="card metric-card" style={{ "--metric-color": "#16a34a" }}>
          <p>Margem média</p>
          <h2>{numeroBR(margemMedia, 2)}%</h2>
          <small>Média dos produtos</small>
        </div>

        <div className="card metric-card" style={{ "--metric-color": "#7c3aed" }}>
          <p>Maior margem</p>
          <h2>
            {produtoMaiorMargem ? `${numeroBR(produtoMaiorMargem.margem, 2)}%` : "0.00%"}
          </h2>
          <small>{produtoMaiorMargem ? produtoMaiorMargem.nome : "Sem produto"}</small>
        </div>

        <div className="card metric-card" style={{ "--metric-color": "#dc2626" }}>
          <p>Menor margem</p>
          <h2>
            {produtoMenorMargem ? `${numeroBR(produtoMenorMargem.margem, 2)}%` : "0.00%"}
          </h2>
          <small>{produtoMenorMargem ? produtoMenorMargem.nome : "Sem produto"}</small>
        </div>
      </div>

      {/* ================================
          🔹 DADOS DO PRODUTO
      ================================= */}
      <div className="card section-card">
        <h3>{editIndex !== null ? "Editar Produto" : "Novo Produto"}</h3>

        <div className="form-grid">
          <label>
            Código
            <input
              placeholder="Código"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            />
          </label>

          <label>
            Nome do produto
            <input
              placeholder="Ex: Caixa de vela"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </label>

          <label>
            Tipo de produto
            <select
              value={tipoProduto}
              onChange={(e) =>
                setForm({
                  ...form,
                  tipoProduto: e.target.value,
                  qtdPorMaco: e.target.value === "simples" ? "" : form.qtdPorMaco,
                })
              }
            >
              <option value="unitario">Unitário</option>
              <option value="simples">Caixa / Kit / Pacote</option>
            </select>
          </label>

          <label>
            Categoria ou tipo do produto
            <input
              placeholder="Ex: Vela, kit, pacote"
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            />
          </label>

          <label>
            Data de cadastro
            <input
              type="date"
              value={form.dataCadastro}
              onChange={(e) => setForm({ ...form, dataCadastro: e.target.value })}
            />
          </label>

          <label>
            Peso/volume por unidade
            <input
              type="number"
              step="0.001"
              placeholder="Ex: 0,250"
              value={form.pesoUnidade}
              onChange={(e) => setForm({ ...form, pesoUnidade: e.target.value })}
            />
          </label>

          <label>
            {produtoSimples ? "Conteúdo por produto" : "Quantidade por embalagem"}
            <input
              type="number"
              placeholder={produtoSimples ? "Ex: 56 unidades" : "Ex: 12 unidades"}
              value={produtoSimples ? form.conteudoPorProduto : form.qtdPorMaco}
              onChange={(e) =>
                setForm(
                  produtoSimples
                    ? { ...form, conteudoPorProduto: e.target.value }
                    : {
                        ...form,
                        qtdPorMaco: e.target.value,
                        conteudoPorProduto: e.target.value,
                      }
                )
              }
            />
          </label>

          <label>
            {produtoSimples ? "Quantidade de produtos finais" : "Quantidade produzida"}
            <input
              type="number"
              placeholder={produtoSimples ? "Ex: 1 caixa" : "Ex: 56 unidades"}
              value={form.qtdProducao}
              onChange={(e) => setForm({ ...form, qtdProducao: e.target.value })}
            />
          </label>

          <label>
            Preço de venda
            <input
              type="number"
              step="0.01"
              placeholder="Preço de venda"
              value={form.precoVenda}
              onChange={(e) => setForm({ ...form, precoVenda: e.target.value })}
            />
          </label>
        </div>

        <div className="product-type-help">
          {produtoSimples
            ? "Use este tipo quando a ficha técnica representa o consumo total de 1 produto final, como uma caixa, kit ou pacote."
            : "Use este tipo quando a ficha técnica representa o consumo de 1 unidade."}
        </div>

        {editIndex !== null && (
          <div className="edit-alert">Você está editando um produto existente.</div>
        )}
      </div>

      <br />

      {/* ================================
          🔹 CONSUMO DE INSUMOS
      ================================= */}
      <div className="card section-card">
        <h3>
          {produtoSimples
            ? "Consumo de Insumos por Produto Final"
            : "Consumo de Insumos por Unidade"}
        </h3>

        {insumos.map((insumo, index) => {
          const custoMedio = calcularCustoMedio(insumo.compras || []);
          const consumo = Number(form.consumos?.[insumo.nome] || 0);
          const custoParcial = consumo * custoMedio;

          return (
           <div key={insumo.id || index} className="product-consumption-row">
              <div>
                <strong>{insumo.nome}</strong>
                <br />
                <small>
                  Custo médio: R$ {numeroBR(custoMedio, 2)} / {insumo.unidade}
                </small>
              </div>

              <input
                type="number"
                step="0.001"
                placeholder={`Consumo em ${insumo.unidade}`}
                value={form.consumos?.[insumo.nome] || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    consumos: {
                      ...form.consumos,
                      [insumo.nome]: e.target.value,
                    },
                  })
                }
              />

              <div>
                <small>Custo parcial</small>
                <br />
                <strong>R$ {numeroBR(custoParcial, 2)}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <br />

      {/* ================================
          🔹 RESULTADO DA FICHA TÉCNICA
      ================================= */}
      <div className="card section-card">
        <h3>Resultado da Ficha Técnica</h3>

        <div className="info-grid">
          <div className="info-tile">
            <strong>
              {produtoSimples
                ? "Custo unitário/produto final:"
                : "Custo unitário:"}
            </strong>
            <br />
            <span>{moedaBR(custoUnitario.toFixed(2))}</span>
          </div>

          <div className="info-tile">
            <strong>
              {produtoSimples ? "Custo do produto final:" : "Custo produção:"}
            </strong>
            <br />
            <span>{moedaBR(custoProducao.toFixed(2))}</span>
          </div>

          <div className="info-tile">
            <strong>Preço venda:</strong>
            <br />
            <span>{moedaBR(precoVenda.toFixed(2))}</span>
          </div>

          <div className="info-tile">
            <strong>Lucro:</strong>
            <br />
            <span>{moedaBR(lucro.toFixed(2))}</span>
          </div>

          <div className="info-tile">
            <strong>Margem:</strong>
            <br />
            <span className={Number(margem) >= 20 ? "text-green" : "text-red"}>
              {numeroBR(margem, 2)}%
            </span>
          </div>

          <div className="info-tile">
            <strong>
              {produtoSimples ? "Valor do produto final:" : "Valor unitário:"}
            </strong>
            <br />
            <span>{moedaBR(valorUnitario.toFixed(2))}</span>
          </div>
        </div>

        {produtoSimples && (
          <div className="product-package-summary product-package-summary-simple">
            <strong>Produto vendido como unidade final.</strong>
            <span>
              {conteudoPorProduto > 0
                ? ` Conteúdo por produto: ${numeroBR(conteudoPorProduto, 0)} unidades.`
                : " Conteúdo por produto opcional."}
            </span>
          </div>
        )}

        <div className="action-row">
          <button onClick={salvarProduto}>
            {editIndex !== null ? "Atualizar Produto" : "Salvar Produto"}
          </button>

          {editIndex !== null && (
            <button onClick={limparFormulario}>Cancelar Edição</button>
          )}
        </div>
      </div>

      <br />

      {/* ================================
          🔹 PRODUTOS CADASTRADOS
      ================================= */}
      <div className="card section-card">
        <h3>Produtos Cadastrados</h3>

        <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Data", "dataCadastro", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Código", "codigo", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Produto", "nome", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Tipo produto", "tipoProduto", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Categoria", "tipo", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Conteúdo", "conteudoPorProduto", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Custo Unit.", "custoUnitario", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Custo Produção", "custoProducao", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Venda", "precoVenda", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Lucro", "lucro", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Margem", "margem", ordenacaoProdutos)}</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {produtosOrdenados.map(({ produto, index }) => (
              <tr key={produto.id || index}>
                <td>{formatarDataBR(produto.dataCadastro)}</td>
                <td>{produto.codigo}</td>
                <td>{produto.nome}</td>
                <td>
                  {produto.tipoProduto === "simples"
                    ? "Caixa / Kit / Pacote"
                    : "Unitário"}
                </td>
                <td>{produto.tipo}</td>
                <td>
                  {numeroBR(
                    produto.conteudoPorProduto || produto.qtdPorMaco || 1,
                    0
                  )}
                </td>
                <td>R$ {numeroBR(produto.custoUnitario || 0, 2)}</td>
                <td>R$ {numeroBR(produto.custoProducao || 0, 2)}</td>
                <td>R$ {numeroBR(produto.precoVenda || 0, 2)}</td>
                <td>R$ {numeroBR(produto.lucro || 0, 2)}</td>

                <td>
                  <span
                    className={
                      Number(produto.margem || 0) >= 20
                        ? "badge badge-success"
                        : "badge badge-danger"
                    }
                  >
                    {numeroBR(produto.margem || 0, 2)}%
                  </span>
                </td>

                <td>
                  <ActionMenu
                    label="Abrir ações do produto"
                    items={[
                      {
                        label: "Editar produto",
                        onClick: () => editarProduto(index),
                      },
                      {
                        label: "Excluir produto",
                        danger: true,
                        onClick: () => excluirProduto(index),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}

            {produtos.length === 0 && (
              <tr>
                <td colSpan="12">Nenhum produto cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
