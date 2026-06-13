import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import { useTableSort } from "../hooks/useTableSort";
import ActionMenu from "../components/ActionMenu";
import { moedaBR, numeroBR } from "../utils/formatters";
import { useParametros } from "../hooks/useParametros";

const FISCAL_PRODUTO_PADRAO = {
  ncm: "",
  cest: "",
  cfopPadrao: "",
  origem: "",
  unidadeTributavel: "",
  aliquotaIcms: "",
  aliquotaPis: "",
  aliquotaCofins: "",
  aliquotaIpi: "",
  observacoesFiscais: "",
};

const ORIGENS_PRODUTO = [
  { valor: "", label: "Nao informado" },
  { valor: "0", label: "0 - Nacional" },
  { valor: "1", label: "1 - Estrangeira - Importacao direta" },
  { valor: "2", label: "2 - Estrangeira - Adquirida no mercado interno" },
  { valor: "3", label: "3 - Nacional com conteudo de importacao superior a 40%" },
  { valor: "4", label: "4 - Nacional conforme processos produtivos basicos" },
  { valor: "5", label: "5 - Nacional com conteudo de importacao inferior ou igual a 40%" },
  { valor: "6", label: "6 - Estrangeira - Importacao direta sem similar nacional" },
  { valor: "7", label: "7 - Estrangeira - Mercado interno sem similar nacional" },
  { valor: "8", label: "8 - Nacional com conteudo de importacao superior a 70%" },
];

const CLASSE_INDUSTRIAL_PADRAO = "produto_acabado";
const ORIGEM_PRODUTO_PADRAO = "fabricado";

const ORIGENS_OPERACIONAIS_PRODUTO = [
  { valor: "fabricado", label: "Fabricado" },
  { valor: "revenda", label: "Revenda" },
];

const CLASSES_INDUSTRIAIS = [
  { valor: "produto_acabado", label: "Produto acabado" },
  { valor: "semiacabado", label: "Semiacabado" },
  { valor: "materia_prima", label: "Matéria-prima / Insumo operacional" },
  { valor: "embalagem", label: "Embalagem" },
  { valor: "servico", label: "Serviço" },
  { valor: "outro", label: "Outro" },
];

const normalizarClasseIndustrial = (valor) =>
  CLASSES_INDUSTRIAIS.some((classe) => classe.valor === valor)
    ? valor
    : CLASSE_INDUSTRIAL_PADRAO;

const getClasseIndustrialLabel = (valor) =>
  CLASSES_INDUSTRIAIS.find(
    (classe) => classe.valor === normalizarClasseIndustrial(valor)
  )?.label || "Produto acabado";

const normalizarOrigemProduto = (valor) =>
  ORIGENS_OPERACIONAIS_PRODUTO.some((origem) => origem.valor === valor)
    ? valor
    : ORIGEM_PRODUTO_PADRAO;

const getOrigemProdutoLabel = (valor) =>
  ORIGENS_OPERACIONAIS_PRODUTO.find(
    (origem) => origem.valor === normalizarOrigemProduto(valor)
  )?.label || "Fabricado";

const normalizarAliquotaFiscal = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return "";

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : "";
};

const normalizarFiscalProduto = (fiscal = {}) => ({
  ncm: fiscal.ncm || "",
  cest: fiscal.cest || "",
  cfopPadrao: fiscal.cfopPadrao || "",
  origem: fiscal.origem || "",
  unidadeTributavel: fiscal.unidadeTributavel || "",
  aliquotaIcms: normalizarAliquotaFiscal(fiscal.aliquotaIcms),
  aliquotaPis: normalizarAliquotaFiscal(fiscal.aliquotaPis),
  aliquotaCofins: normalizarAliquotaFiscal(fiscal.aliquotaCofins),
  aliquotaIpi: normalizarAliquotaFiscal(fiscal.aliquotaIpi),
  observacoesFiscais: fiscal.observacoesFiscais || "",
});

export default function Produtos() {
  // ================================
  // 🔹 CONTEXTO GLOBAL DO ERP
  // ================================
  const { insumos, produtos, addItem, updateItem, deleteItem } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();
  const { tiposProduto = [] } = useParametros();

  const tiposProdutoAtivos = tiposProduto.filter(
    (tipo) => tipo.ativo
  );

  // ================================
  // 🔹 FORMULÁRIO DO PRODUTO
  // ================================
  const [form, setForm] = useState({
    codigo: "",
    nome: "",
    tipoProduto: tiposProdutoAtivos[0]?.id || "",
    tipo: "Geral",
    pesoUnidade: "",
    conteudoPorProduto: "",
    qtdPorMaco: "",
    qtdProducao: "",
    precoVenda: "",
    custoUnitario: "",
    origemProduto: ORIGEM_PRODUTO_PADRAO,
    dataCadastro: "",
    consumos: {},
    componentesProduto: {},
    fiscal: FISCAL_PRODUTO_PADRAO,
    classeIndustrial: CLASSE_INDUSTRIAL_PADRAO,
    vendavel: true,
    consumivelEmProducao: false,
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
    if (normalizarOrigemProduto(form.origemProduto) === "revenda") {
      return Number(form.custoUnitario || 0);
    }

    const custoInsumos = insumos.reduce((total, insumo) => {
      const quantidadeConsumida = Number(form.consumos?.[insumo.nome] || 0);
      const custoMedio = calcularCustoMedio(insumo.compras || []);

      return total + quantidadeConsumida * custoMedio;
    }, 0);

    const custoComponentes = produtos.reduce((total, produto) => {
      const quantidadeConsumida = Number(
        form.componentesProduto?.[produto.id]?.quantidade || 0
      );
      const custoUnitarioComponente = Number(produto.custoUnitario || 0);

      return total + quantidadeConsumida * custoUnitarioComponente;
    }, 0);

    return custoInsumos + custoComponentes;
  };

  // ================================
  // 🔹 RESULTADOS CALCULADOS
  // ================================
  const custoUnitario = calcularCustoUnitario();
  const produtoRevenda = normalizarOrigemProduto(form.origemProduto) === "revenda";

  const tipoProduto = form.tipoProduto || tiposProdutoAtivos[0]?.id || "";

  const produtoSelecionado = tiposProduto.find(
    (tipo) => tipo.id === tipoProduto
  );

  const nomeTipoProduto = produtoSelecionado?.nome || "Unitário";

  const produtoSimples = nomeTipoProduto !== "Unitário";

  const conteudoPorProduto = Number(
    form.conteudoPorProduto || form.qtdPorMaco || 0
  );

  const qtdProducao = Number(form.qtdProducao || 0);
  const precoVenda = Number(form.precoVenda || 0);

  const custoProducao = produtoRevenda
    ? custoUnitario
    : produtoSimples
    ? custoUnitario
    : custoUnitario * qtdProducao;

  const lucro = precoVenda - custoProducao;

  const margem = precoVenda > 0 ? (lucro / precoVenda) * 100 : 0;

  const valorUnitario = produtoRevenda
    ? precoVenda
    : produtoSimples
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
        classeIndustrial: getClasseIndustrialLabel(produto.classeIndustrial),
        origemProduto: getOrigemProdutoLabel(produto.origemProduto),
      };

      return valores[chave] ?? "";
    }
  );
  const produtoEditadoId = editIndex !== null ? produtos[editIndex]?.id : "";
  const componentesProdutoDisponiveis = produtos.filter(
    (produto) => produto.consumivelEmProducao === true && produto.id !== produtoEditadoId
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

  const atualizarFiscalProduto = (campo, valor) => {
    setForm((atual) => ({
      ...atual,
      fiscal: {
        ...FISCAL_PRODUTO_PADRAO,
        ...(atual.fiscal || {}),
        [campo]: valor,
      },
    }));
  };

  // ================================
  // 🔹 LIMPAR FORMULÁRIO
  // ================================
  const limparFormulario = () => {
    setForm({
      codigo: "",
      nome: "",
      tipoProduto: tiposProdutoAtivos[0]?.id || "",
      tipo: "Geral",
      pesoUnidade: "",
      conteudoPorProduto: "",
      qtdPorMaco: "",
      qtdProducao: "",
      precoVenda: "",
      custoUnitario: "",
      origemProduto: ORIGEM_PRODUTO_PADRAO,
      dataCadastro: "",
      consumos: {},
      componentesProduto: {},
      fiscal: FISCAL_PRODUTO_PADRAO,
      classeIndustrial: CLASSE_INDUSTRIAL_PADRAO,
      vendavel: true,
      consumivelEmProducao: false,
    });

    setEditIndex(null);
  };

  // ================================
  // 🔹 SALVAR / ATUALIZAR PRODUTO
  // ================================
  const salvarProduto = async () => {
  if (
    !form.codigo ||
    !form.nome ||
    !form.precoVenda ||
    (!produtoRevenda && !form.qtdProducao)
  ) {
    showToast(
      produtoRevenda
        ? "Preencha código, nome e preço de venda."
        : produtoSimples
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
  const componentesProdutoNormalizados = Object.entries(
    form.componentesProduto || {}
  ).reduce((acc, [produtoId, componente]) => {
    const quantidade = Number(componente?.quantidade || 0);
    const produtoComponente = produtos.find((produto) => produto.id === produtoId);

    if (!produtoComponente || quantidade <= 0) return acc;

    return {
      ...acc,
      [produtoId]: {
        produtoId,
        codigo: produtoComponente.codigo || "",
        nome: produtoComponente.nome || "",
        quantidade,
        unidade: produtoComponente.unidade || "un",
        custoUnitarioSnapshot: Number(produtoComponente.custoUnitario || 0),
      },
    };
  }, {});

  const produtoCalculado = {
    ...form,
    tipoProduto,
    pesoUnidade: Number(form.pesoUnidade || 0),
    qtdPorMaco: Number(form.qtdPorMaco || 0),
    conteudoPorProduto: conteudoPorProduto || 1,
    qtdProducao,
    precoVenda,
    origemProduto: normalizarOrigemProduto(form.origemProduto),
    consumos: produtoRevenda ? {} : consumosNormalizados,
    componentesProduto: produtoRevenda ? {} : componentesProdutoNormalizados,
    dataCadastro: form.dataCadastro || new Date().toISOString().split("T")[0],
    custoUnitario,
    custoProducao,
    lucro,
    margem,
    valorUnitario,
    qtdMaco,
    fiscal: normalizarFiscalProduto(form.fiscal),
    classeIndustrial: normalizarClasseIndustrial(form.classeIndustrial),
    vendavel: Boolean(form.vendavel),
    consumivelEmProducao: Boolean(form.consumivelEmProducao),
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
      custoUnitario: produto.custoUnitario || "",
      origemProduto: normalizarOrigemProduto(produto.origemProduto),
      dataCadastro: produto.dataCadastro || "",
      consumos: produto.consumos || {},
      componentesProduto: produto.componentesProduto || {},
      fiscal: normalizarFiscalProduto(produto.fiscal),
      classeIndustrial: normalizarClasseIndustrial(produto.classeIndustrial),
      vendavel: produto.vendavel !== false,
      consumivelEmProducao: Boolean(produto.consumivelEmProducao),
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
              value={form.tipoProduto}
              onChange={(e) =>
                setForm({
                  ...form,
                  tipoProduto: e.target.value,
                })
              }
            >
              {tiposProdutoAtivos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nome}
                </option>
              ))}
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
            Origem do produto
            <select
              value={form.origemProduto}
              onChange={(e) =>
                setForm({
                  ...form,
                  origemProduto: normalizarOrigemProduto(e.target.value),
                })
              }
            >
              {ORIGENS_OPERACIONAIS_PRODUTO.map((origem) => (
                <option key={origem.valor} value={origem.valor}>
                  {origem.label}
                </option>
              ))}
            </select>
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
            {produtoRevenda
              ? "Quantidade inicial em estoque"
              : produtoSimples
              ? "Quantidade de produtos finais"
              : "Quantidade produzida"}
            <input
              type="number"
              placeholder={
                produtoRevenda
                  ? "Ex: 10 unidades"
                  : produtoSimples
                  ? "Ex: 1 caixa"
                  : "Ex: 56 unidades"
              }
              value={form.qtdProducao}
              onChange={(e) => setForm({ ...form, qtdProducao: e.target.value })}
            />
          </label>

          {produtoRevenda && (
            <label>
              Custo de compra unitário
              <input
                type="number"
                step="0.01"
                placeholder="Custo de compra"
                value={form.custoUnitario}
                onChange={(e) =>
                  setForm({ ...form, custoUnitario: e.target.value })
                }
              />
            </label>
          )}

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
          {produtoRevenda
            ? "Use Revenda para produtos comprados prontos. Eles não exigem ficha técnica nem produção industrial."
            : produtoSimples
            ? "Use este tipo quando a ficha técnica representa o consumo total de 1 produto final, como uma caixa, kit ou pacote."
            : "Use este tipo quando a ficha técnica representa o consumo de 1 unidade."}
        </div>

        {editIndex !== null && (
          <div className="edit-alert">Você está editando um produto existente.</div>
        )}
      </div>

      <br />

      <div className="card section-card product-industrial-card">
        <h3>Classificação Industrial</h3>
        <p className="section-description">
          Defina se este item é vendido, usado internamente na produção ou
          representa uma etapa intermediaria.
        </p>

        <div className="form-grid product-industrial-grid">
          <label className="industrial-select-field">
            Classe industrial
            <select
              value={form.classeIndustrial}
              onChange={(e) =>
                setForm({
                  ...form,
                  classeIndustrial: e.target.value,
                })
              }
            >
              {CLASSES_INDUSTRIAIS.map((classe) => (
                <option key={classe.valor} value={classe.valor}>
                  {classe.label}
                </option>
              ))}
            </select>
          </label>

          <label className="industrial-toggle-card">
            <input
              type="checkbox"
              checked={Boolean(form.vendavel)}
              onChange={(e) =>
                setForm({
                  ...form,
                  vendavel: e.target.checked,
                })
              }
            />
            <span className="industrial-toggle-copy">
              <strong>Pode ser vendido?</strong>
              <small>Item disponível para uso comercial</small>
            </span>
          </label>

          <label className="industrial-toggle-card">
            <input
              type="checkbox"
              checked={Boolean(form.consumivelEmProducao)}
              onChange={(e) =>
                setForm({
                  ...form,
                  consumivelEmProducao: e.target.checked,
                })
              }
            />
            <span className="industrial-toggle-copy">
              <strong>Pode ser consumido em produção?</strong>
              <small>Preparado para composição industrial futura</small>
            </span>
          </label>
        </div>
      </div>

      <br />

      <div className="card section-card">
        <h3>Dados Fiscais do Produto</h3>
        <p className="section-description">
          Campos opcionais para preparar o produto para relatorios tributarios futuros.
        </p>

        <div className="form-grid">
          <label>
            NCM
            <input
              placeholder="Ex: 3406.00.00"
              value={form.fiscal?.ncm || ""}
              onChange={(e) => atualizarFiscalProduto("ncm", e.target.value)}
            />
          </label>

          <label>
            CEST
            <input
              placeholder="Ex: 28.064.00"
              value={form.fiscal?.cest || ""}
              onChange={(e) => atualizarFiscalProduto("cest", e.target.value)}
            />
          </label>

          <label>
            CFOP padrao
            <input
              placeholder="Ex: 5102"
              value={form.fiscal?.cfopPadrao || ""}
              onChange={(e) => atualizarFiscalProduto("cfopPadrao", e.target.value)}
            />
          </label>

          <label>
            Origem
            <select
              value={form.fiscal?.origem || ""}
              onChange={(e) => atualizarFiscalProduto("origem", e.target.value)}
            >
              {ORIGENS_PRODUTO.map((origem) => (
                <option key={origem.valor} value={origem.valor}>
                  {origem.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Unidade tributavel
            <input
              placeholder="Ex: UN, KG, CX"
              value={form.fiscal?.unidadeTributavel || ""}
              onChange={(e) =>
                atualizarFiscalProduto("unidadeTributavel", e.target.value)
              }
            />
          </label>

          <label>
            Aliquota ICMS (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 18"
              value={form.fiscal?.aliquotaIcms || ""}
              onChange={(e) => atualizarFiscalProduto("aliquotaIcms", e.target.value)}
            />
          </label>

          <label>
            Aliquota PIS (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 0.65"
              value={form.fiscal?.aliquotaPis || ""}
              onChange={(e) => atualizarFiscalProduto("aliquotaPis", e.target.value)}
            />
          </label>

          <label>
            Aliquota COFINS (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 3"
              value={form.fiscal?.aliquotaCofins || ""}
              onChange={(e) => atualizarFiscalProduto("aliquotaCofins", e.target.value)}
            />
          </label>

          <label>
            Aliquota IPI (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 5"
              value={form.fiscal?.aliquotaIpi || ""}
              onChange={(e) => atualizarFiscalProduto("aliquotaIpi", e.target.value)}
            />
          </label>

          <label className="form-field-full">
            Observacoes fiscais
            <textarea
              rows="4"
              placeholder="Informacoes fiscais opcionais para uso futuro em relatorios tributarios."
              value={form.fiscal?.observacoesFiscais || ""}
              onChange={(e) =>
                atualizarFiscalProduto("observacoesFiscais", e.target.value)
              }
            />
          </label>
        </div>
      </div>

      <br />

      {/* ================================
          🔹 CONSUMO DE INSUMOS
      ================================= */}
      {!produtoRevenda && (
        <>
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

      <div className="card section-card">
        <h3>Componentes de Produto/Semiacabado</h3>
        <p className="section-description">
          Use esta seção para consumir produtos internos ou semiacabados
          produzidos anteriormente.
        </p>

        {componentesProdutoDisponiveis.length === 0 ? (
          <p className="empty-state">
            Nenhum produto marcado como consumível em produção.
          </p>
        ) : (
          componentesProdutoDisponiveis.map((produto) => {
            const componente = form.componentesProduto?.[produto.id] || {};
            const quantidade = Number(componente.quantidade || 0);
            const custoUnitarioComponente = Number(produto.custoUnitario || 0);
            const custoParcial = quantidade * custoUnitarioComponente;

            return (
              <div key={produto.id} className="product-consumption-row">
                <div>
                  <strong>
                    {produto.codigo} - {produto.nome}
                  </strong>
                  <br />
                  <small>
                    Custo unitário: R$ {numeroBR(custoUnitarioComponente, 2)}
                    {" "} / {produto.unidade || "un"}
                  </small>
                </div>

                <input
                  type="number"
                  step="0.001"
                  placeholder="Qtd por produto final"
                  value={componente.quantidade || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      componentesProduto: {
                        ...form.componentesProduto,
                        [produto.id]: {
                          ...(form.componentesProduto?.[produto.id] || {}),
                          quantidade: e.target.value,
                        },
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
          })
        )}
      </div>

      <br />
        </>
      )}

      {/* ================================
          🔹 RESULTADO DA FICHA TÉCNICA
      ================================= */}
      <div className="card section-card">
        <h3>{produtoRevenda ? "Resultado do Produto de Revenda" : "Resultado da Ficha Técnica"}</h3>

        <div className="info-grid">
          <div className="info-tile">
            <strong>
              {produtoRevenda
                ? "Custo de compra unitário:"
                : produtoSimples
                ? "Custo unitário/produto final:"
                : "Custo unitário:"}
            </strong>
            <br />
            <span>{moedaBR(custoUnitario.toFixed(2))}</span>
          </div>

          <div className="info-tile">
            <strong>
              {produtoRevenda
                ? "Custo do produto:"
                : produtoSimples
                ? "Custo do produto final:"
                : "Custo produção:"}
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
              {produtoRevenda
                ? "Valor unitário de venda:"
                : produtoSimples
                ? "Valor do produto final:"
                : "Valor unitário:"}
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
              <th>{renderCabecalhoOrdenavel("Origem", "origemProduto", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Classe", "classeIndustrial", ordenacaoProdutos)}</th>
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
                  <span
                    className={
                      normalizarOrigemProduto(produto.origemProduto) === "revenda"
                        ? "badge badge-warning"
                        : "badge badge-info"
                    }
                  >
                    {getOrigemProdutoLabel(produto.origemProduto)}
                  </span>
                </td>
                <td>
                  <span className="badge badge-info">
                    {getClasseIndustrialLabel(produto.classeIndustrial)}
                  </span>
                </td>
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
                <td colSpan="14">Nenhum produto cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
