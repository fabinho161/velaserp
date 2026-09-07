const GRUPOS_CONVERSAO = new Set(["massa", "volume", "comprimento", "unidade"]);

export const UNIDADES_CONVERSAO_CANONICAS = Object.freeze({
  g: Object.freeze({ grupoConversao: "massa", fatorBase: 1 }),
  kg: Object.freeze({ grupoConversao: "massa", fatorBase: 1000 }),
  ml: Object.freeze({ grupoConversao: "volume", fatorBase: 1 }),
  lt: Object.freeze({ grupoConversao: "volume", fatorBase: 1000 }),
  mm: Object.freeze({ grupoConversao: "comprimento", fatorBase: 1 }),
  cm: Object.freeze({ grupoConversao: "comprimento", fatorBase: 10 }),
  m: Object.freeze({ grupoConversao: "comprimento", fatorBase: 1000 }),
  un: Object.freeze({ grupoConversao: "unidade", fatorBase: 1 }),
});

const temListaUnidades = (unidades) => Array.isArray(unidades) && unidades.length > 0;

const buscarUnidade = (unidadeId, unidades = []) =>
  Array.isArray(unidades)
    ? unidades.find((unidade) => normalizarUnidade(unidade?.id) === unidadeId) || null
    : null;

export const normalizarUnidade = (id) => String(id || "").trim().toLowerCase();

export const fatorBaseValido = (fatorBase) =>
  Number.isFinite(Number(fatorBase)) && Number(fatorBase) > 0;

export const obterMetadadosUnidade = (unidadeId, unidades = []) => {
  const id = normalizarUnidade(unidadeId);

  if (!id) {
    return {
      id,
      unidade: null,
      encontrada: false,
      conversivel: false,
      grupoConversao: null,
      fatorBase: null,
      motivo: "unidade_invalida",
    };
  }

  const unidadeEncontrada = buscarUnidade(id, unidades);
  const usarCanonica = !temListaUnidades(unidades);
  const metadadosCanonicos = UNIDADES_CONVERSAO_CANONICAS[id] || null;
  const origem = unidadeEncontrada
    ? { ...metadadosCanonicos, ...unidadeEncontrada }
    : usarCanonica
    ? metadadosCanonicos
    : null;

  if (!origem) {
    return {
      id,
      unidade: null,
      encontrada: false,
      conversivel: false,
      grupoConversao: null,
      fatorBase: null,
      motivo: "unidade_desconhecida",
    };
  }

  const grupoConversao = origem.grupoConversao || null;
  const fatorBase = Number(origem.fatorBase);

  if (!GRUPOS_CONVERSAO.has(grupoConversao)) {
    return {
      id,
      unidade: unidadeEncontrada,
      encontrada: true,
      conversivel: false,
      grupoConversao,
      fatorBase: null,
      motivo: "grupo_conversao_invalido",
    };
  }

  if (!fatorBaseValido(fatorBase)) {
    return {
      id,
      unidade: unidadeEncontrada,
      encontrada: true,
      conversivel: false,
      grupoConversao,
      fatorBase: null,
      motivo: "fator_base_invalido",
    };
  }

  return {
    id,
    unidade: unidadeEncontrada,
    encontrada: true,
    conversivel: true,
    grupoConversao,
    fatorBase,
    motivo: "",
  };
};

export const unidadesCompativeis = (unidadeOrigem, unidadeDestino, unidades = []) => {
  const origem = normalizarUnidade(unidadeOrigem);
  const destino = normalizarUnidade(unidadeDestino);

  if (!origem || !destino) return false;
  if (origem === destino) return true;

  const metadadosOrigem = obterMetadadosUnidade(origem, unidades);
  const metadadosDestino = obterMetadadosUnidade(destino, unidades);

  return Boolean(
    metadadosOrigem.conversivel &&
      metadadosDestino.conversivel &&
      metadadosOrigem.grupoConversao === metadadosDestino.grupoConversao
  );
};

export const converterQuantidade = ({
  quantidade,
  unidadeOrigem,
  unidadeDestino,
  unidades = [],
} = {}) => {
  const valor = Number(quantidade);
  const origem = normalizarUnidade(unidadeOrigem);
  const destino = normalizarUnidade(unidadeDestino);

  if (!Number.isFinite(valor)) {
    return {
      ok: false,
      quantidade: null,
      motivo: "quantidade_invalida",
      unidadeOrigem: origem,
      unidadeDestino: destino,
    };
  }

  if (valor < 0) {
    return {
      ok: false,
      quantidade: null,
      motivo: "quantidade_negativa",
      unidadeOrigem: origem,
      unidadeDestino: destino,
    };
  }

  if (!origem || !destino) {
    return {
      ok: false,
      quantidade: null,
      motivo: "unidade_invalida",
      unidadeOrigem: origem,
      unidadeDestino: destino,
    };
  }

  if (origem === destino) {
    return {
      ok: true,
      quantidade: valor,
      convertido: false,
      motivo: "",
      unidadeOrigem: origem,
      unidadeDestino: destino,
    };
  }

  const metadadosOrigem = obterMetadadosUnidade(origem, unidades);
  const metadadosDestino = obterMetadadosUnidade(destino, unidades);

  if (!metadadosOrigem.conversivel) {
    return {
      ok: false,
      quantidade: null,
      motivo: metadadosOrigem.motivo,
      unidadeOrigem: origem,
      unidadeDestino: destino,
    };
  }

  if (!metadadosDestino.conversivel) {
    return {
      ok: false,
      quantidade: null,
      motivo: metadadosDestino.motivo,
      unidadeOrigem: origem,
      unidadeDestino: destino,
    };
  }

  if (metadadosOrigem.grupoConversao !== metadadosDestino.grupoConversao) {
    return {
      ok: false,
      quantidade: null,
      motivo: "unidades_incompativeis",
      unidadeOrigem: origem,
      unidadeDestino: destino,
    };
  }

  return {
    ok: true,
    quantidade: valor * metadadosOrigem.fatorBase / metadadosDestino.fatorBase,
    convertido: true,
    motivo: "",
    unidadeOrigem: origem,
    unidadeDestino: destino,
  };
};
