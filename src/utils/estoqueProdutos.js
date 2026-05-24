const normalizarTextoProduto = (valor = "") =>
  String(valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

export const normalizarChaveProduto = (valor = "") => normalizarTextoProduto(valor);

export const textoProdutoSeguro = (valor, fallback = "-") => {
  if (valor === null || valor === undefined || valor === "") return fallback;

  if (typeof valor === "object") {
    const partes = [
      valor.codigo,
      valor.nome || valor.nomeProduto || valor.produtoNome,
      valor.tipo,
    ].filter(Boolean);

    return partes.length > 0 ? partes.join(" ") : fallback;
  }

  return String(valor);
};

const extrairCodigoTexto = (valor = "") => {
  const texto = textoProdutoSeguro(valor, "").trim();
  const match = texto.match(/^([A-Za-z]{1,10}\d{1,10})\b/);

  return match?.[1] || "";
};

const montarDescricaoProduto = (registro = {}) => {
  if (typeof registro.produto === "string" && registro.produto.trim()) {
    return registro.produto.trim();
  }

  const codigo =
    registro.codigo ||
    registro.codigoProduto ||
    extrairCodigoTexto(registro.produto || registro.produtoNome || "");
  const nome = registro.nome || registro.nomeProduto || registro.produtoNome || "";
  const tipo = registro.tipo || "";
  const descricao = [
    codigo ? `${codigo} -` : "",
    nome,
    tipo,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return descricao || textoProdutoSeguro(registro.produto || registro.nome || registro.nomeProduto);
};

const obterAliasesProduto = (registro = {}) => {
  const codigo =
    registro.codigo ||
    registro.codigoProduto ||
    extrairCodigoTexto(registro.produto || registro.produtoNome || "");
  const nome = registro.nome || registro.nomeProduto || registro.produtoNome || "";
  const tipo = registro.tipo || "";

  return [
    registro.produto,
    montarDescricaoProduto(registro),
    nome,
    nome && tipo ? `${nome} ${tipo}` : "",
    codigo && nome ? `${codigo} - ${nome}${tipo ? ` ${tipo}` : ""}` : "",
    codigo,
  ]
    .map((alias) => normalizarTextoProduto(textoProdutoSeguro(alias, "")))
    .filter(Boolean);
};

const obterAliasesItemVenda = (item = {}, venda = {}) => [
  item.produto,
  item.nomeProduto,
  item.produtoNome,
  item.codigo,
  item.codigoProduto,
  extrairCodigoTexto(item.produto),
  item.codigo && item.nomeProduto
    ? `${item.codigo} - ${item.nomeProduto}${item.tipo ? ` ${item.tipo}` : ""}`
    : "",
  venda.produto,
  venda.codigo,
  venda.codigoProduto,
  extrairCodigoTexto(venda.produto),
]
  .map((alias) => normalizarTextoProduto(textoProdutoSeguro(alias, "")))
  .filter(Boolean);

const obterAliasesBaixaEstoque = (baixa = {}) => [
  baixa.produtoNome,
  baixa.produto,
  baixa.nomeProduto,
  baixa.codigo,
  baixa.codigoProduto,
  extrairCodigoTexto(baixa.produtoNome || baixa.produto),
  baixa.codigoProduto && baixa.produtoNome
    ? `${baixa.codigoProduto} - ${baixa.produtoNome}${baixa.tipo ? ` ${baixa.tipo}` : ""}`
    : "",
]
  .map((alias) => normalizarTextoProduto(textoProdutoSeguro(alias, "")))
  .filter(Boolean);

const vendaMovimentaEstoque = (venda = {}) => {
  const expedicao = String(venda.statusExpedicao || "").toLowerCase();
  const pagamento = String(venda.statusPagamento || "").toLowerCase();

  return expedicao !== "cancelado" && pagamento !== "cancelado";
};

export const calcularEstoqueProdutos = ({
  produtos = [],
  producoes = [],
  vendas = [],
  perdasDoacoes = [],
  ignorarVendaIndex = null,
  ignorarVendaId = "",
} = {}) => {
  const mapa = new Map();
  const aliases = new Map();

  const registrarAliases = (chave, registro = {}) => {
    obterAliasesProduto(registro).forEach((alias) => aliases.set(alias, chave));
  };

  const resolverChavePorAliases = (aliasesRegistro = []) => {
    const alias = aliasesRegistro.find((item) => aliases.has(item));
    return alias ? aliases.get(alias) : null;
  };

  const garantirItem = (registro = {}) => {
    const descricao = montarDescricaoProduto(registro);
    const produtoId = registro.produtoId || "";
    const aliasesRegistro = obterAliasesProduto(registro);
    const chave =
      (produtoId ? `produto:${produtoId}` : "") ||
      resolverChavePorAliases(aliasesRegistro) ||
      `legado:${normalizarTextoProduto(descricao)}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        produtoId,
        legado: !produtoId,
        produto: descricao,
        codigo: registro.codigo || registro.codigoProduto || extrairCodigoTexto(descricao),
        nome: registro.nome || registro.nomeProduto || registro.produtoNome || "",
        tipo: registro.tipo || "",
        tipoProduto: registro.tipoProduto || "",
        classeIndustrial: registro.classeIndustrial || "produto_acabado",
        vendavel: registro.vendavel !== false,
        consumivelEmProducao: Boolean(registro.consumivelEmProducao),
        produzido: 0,
        vendido: 0,
        baixado: 0,
        custoTotal: 0,
        estoqueMinimo: Number(registro.estoqueMinimo || 0),
      });
    } else if (produtoId) {
      const itemExistente = mapa.get(chave);

      mapa.set(chave, {
        ...itemExistente,
        produtoId,
        legado: false,
        produto: descricao || itemExistente.produto,
        codigo: registro.codigo || itemExistente.codigo,
        nome: registro.nome || registro.nomeProduto || registro.produtoNome || itemExistente.nome,
        tipo: registro.tipo || itemExistente.tipo,
        tipoProduto: registro.tipoProduto || itemExistente.tipoProduto,
        classeIndustrial: registro.classeIndustrial || itemExistente.classeIndustrial || "produto_acabado",
        vendavel:
          registro.vendavel === undefined
            ? itemExistente.vendavel !== false
            : registro.vendavel !== false,
        consumivelEmProducao:
          Boolean(registro.consumivelEmProducao) ||
          Boolean(itemExistente.consumivelEmProducao),
        estoqueMinimo: Number(registro.estoqueMinimo || itemExistente.estoqueMinimo || 0),
      });
    }

    registrarAliases(chave, registro);
    return mapa.get(chave);
  };

  (produtos || []).forEach((produto) => {
    garantirItem({
      ...produto,
      produtoId: produto.id || produto.produtoId || "",
    });
  });

  (producoes || []).forEach((producao) => {
    const chavePorId = producao.produtoId ? `produto:${producao.produtoId}` : "";
    const item = chavePorId && mapa.has(chavePorId)
      ? mapa.get(chavePorId)
      : garantirItem(producao);
    item.produzido += Number(producao.quantidade || 0);
    item.custoTotal += Number(producao.custoTotal || 0);
  });

  (vendas || []).forEach((venda, vendaIndex) => {
    if (ignorarVendaIndex !== null && ignorarVendaIndex === vendaIndex) return;
    if (ignorarVendaId && venda.id === ignorarVendaId) return;
    if (!vendaMovimentaEstoque(venda)) return;

    const itensVenda = Array.isArray(venda.itens) && venda.itens.length > 0
      ? venda.itens
      : [{ produto: venda.produto, quantidade: venda.quantidade }];

    itensVenda.forEach((itemVenda) => {
      const produtoId = itemVenda?.produtoId || venda.produtoId || "";
      const aliasesVenda = obterAliasesItemVenda(itemVenda, venda);
      const chave = produtoId && mapa.has(`produto:${produtoId}`)
        ? `produto:${produtoId}`
        : resolverChavePorAliases(aliasesVenda);
      const item = chave
        ? mapa.get(chave)
        : garantirItem({ produto: itemVenda?.produto || venda.produto });

      item.vendido += Number(itemVenda?.quantidade || 0);
    });
  });

  (perdasDoacoes || []).forEach((baixa) => {
    if (String(baixa.status || "ativo").toLowerCase() === "cancelado") return;
    if (String(baixa.tipoItem || "produto").toLowerCase() !== "produto") return;

    const produtoId = baixa.produtoId || "";
    const aliasesBaixa = obterAliasesBaixaEstoque(baixa);
    const chave = produtoId && mapa.has(`produto:${produtoId}`)
      ? `produto:${produtoId}`
      : resolverChavePorAliases(aliasesBaixa);
    const item = chave
      ? mapa.get(chave)
      : garantirItem({ produto: baixa.produtoNome || baixa.produto });

    item.baixado += Number(baixa.quantidade || 0);
  });

  return Array.from(mapa.values()).map((item) => {
    const saldoReal = item.produzido - item.vendido - item.baixado;
    const saldo = Math.max(0, saldoReal);
    const custoMedio = item.produzido > 0 ? item.custoTotal / item.produzido : 0;

    return {
      ...item,
      saldo,
      saldoReal,
      custoMedio,
      valorEstoque: saldo * custoMedio,
    };
  });
};

const normalizarStatusBaixa = (status) =>
  String(status || "ativo").trim().toLowerCase();

const registroBaixaAtivo = (registro = {}) =>
  normalizarStatusBaixa(registro.status) !== "cancelado";

const registroBaixaInsumo = (registro = {}) =>
  String(registro.tipoItem || "produto").trim().toLowerCase() === "insumo";

const normalizarChaveInsumo = (valor = "") => normalizarTextoProduto(valor);

const calcularTotalCompradoInsumo = (compras = []) =>
  (compras || []).reduce(
    (total, compra) => total + Number(compra.quantidade || 0),
    0
  );

const calcularCustoMedioInsumo = (compras = []) => {
  const quantidade = calcularTotalCompradoInsumo(compras);
  const valor = (compras || []).reduce(
    (total, compra) => total + Number(compra.valorTotal || 0),
    0
  );

  return quantidade > 0 ? valor / quantidade : 0;
};

export const calcularEstoqueInsumos = ({
  insumos = [],
  producoes = [],
  perdasDoacoes = [],
} = {}) => {
  const mapa = new Map();
  const aliases = new Map();

  const registrarAlias = (chave, valor) => {
    const alias = normalizarChaveInsumo(valor);
    if (alias) aliases.set(alias, chave);
  };

  const garantirItem = (insumo = {}) => {
    const insumoId = insumo.insumoId || insumo.id || "";
    const nome = insumo.nome || insumo.insumoNome || "";
    const chave =
      (insumoId ? `insumo:${insumoId}` : "") ||
      aliases.get(normalizarChaveInsumo(nome)) ||
      `legado:${normalizarChaveInsumo(nome)}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        insumoId,
        legado: !insumoId,
        nome,
        unidade: insumo.unidade || "",
        comprado: calcularTotalCompradoInsumo(insumo.compras || []),
        consumido: 0,
        baixado: 0,
        custoMedio: calcularCustoMedioInsumo(insumo.compras || []),
      });
    }

    registrarAlias(chave, nome);
    return mapa.get(chave);
  };

  (insumos || []).forEach((insumo) => garantirItem(insumo));

  (producoes || []).forEach((producao) => {
    (producao.consumos || []).forEach((consumo) => {
      const chavePorId = consumo.insumoId ? `insumo:${consumo.insumoId}` : "";
      const chavePorNome = aliases.get(normalizarChaveInsumo(consumo.nome));
      const item = chavePorId && mapa.has(chavePorId)
        ? mapa.get(chavePorId)
        : chavePorNome
        ? mapa.get(chavePorNome)
        : garantirItem({
            insumoId: consumo.insumoId || "",
            nome: consumo.nome,
            unidade: consumo.unidade,
          });

      item.consumido += Number(consumo.quantidadeTotal || 0);
    });
  });

  (perdasDoacoes || [])
    .filter((registro) => registroBaixaAtivo(registro) && registroBaixaInsumo(registro))
    .forEach((registro) => {
      const chavePorId = registro.insumoId ? `insumo:${registro.insumoId}` : "";
      const chavePorNome = aliases.get(normalizarChaveInsumo(registro.insumoNome));
      const item = chavePorId && mapa.has(chavePorId)
        ? mapa.get(chavePorId)
        : chavePorNome
        ? mapa.get(chavePorNome)
        : garantirItem({
            insumoId: registro.insumoId || "",
            nome: registro.insumoNome,
            unidade: registro.unidade,
          });

      item.baixado += Number(registro.quantidade || 0);
    });

  return Array.from(mapa.values()).map((item) => {
    const saldoReal = item.comprado - item.consumido - item.baixado;
    const saldo = Math.max(0, saldoReal);

    return {
      ...item,
      saldo,
      saldoReal,
      valorEstoque: saldo * item.custoMedio,
    };
  });
};
