const SEGMENTO_EMPRESA_PADRAO = "industria";
const SEGMENTOS_EMPRESA_VALIDOS = new Set([
  "comercio",
  "industria",
  "oficina",
  "clientes",
]);
const ALIASES_SEGMENTO_EMPRESA = {
  servicos: "clientes",
};

const canonicalizarSegmentoEmpresa = (segmento) => {
  if (typeof segmento !== "string") return null;

  const segmentoTratado = segmento.trim().toLowerCase();
  const segmentoCanonico = ALIASES_SEGMENTO_EMPRESA[segmentoTratado] || segmentoTratado;
  return SEGMENTOS_EMPRESA_VALIDOS.has(segmentoCanonico) ? segmentoCanonico : null;
};

const normalizarSegmentoEmpresa = (segmento) =>
  canonicalizarSegmentoEmpresa(segmento) || SEGMENTO_EMPRESA_PADRAO;

const empresaPertenceAoSegmento = (segmentoEmpresa, segmentoEsperado) =>
  canonicalizarSegmentoEmpresa(segmentoEmpresa) === segmentoEsperado;

module.exports = {
  SEGMENTO_EMPRESA_PADRAO,
  SEGMENTOS_EMPRESA_VALIDOS,
  canonicalizarSegmentoEmpresa,
  empresaPertenceAoSegmento,
  normalizarSegmentoEmpresa,
};
