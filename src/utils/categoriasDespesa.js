import { normalizarSegmentoEmpresa } from "../config/segmentosEmpresa.js";

export const podeGerenciarCategoriasDespesa = (
  segmento,
  { podeEscreverFinanceiro = false, podeEscreverParametros = false } = {},
) =>
  normalizarSegmentoEmpresa(segmento) === "clientes" &&
  Boolean(podeEscreverFinanceiro) &&
  Boolean(podeEscreverParametros);

export const filtrarCategoriasDespesaAtivas = (categorias = []) =>
  categorias.filter((categoria) => categoria?.ativo === true);

export const obterCategoriaHistoricaInativa = (categorias = [], nome = "") => {
  const nomeTratado = String(nome || "").trim();
  if (!nomeTratado) return "";

  const categoriaAtiva = categorias.some(
    (categoria) =>
      categoria?.ativo === true &&
      String(categoria?.nome || "").trim().toLocaleLowerCase("pt-BR") ===
        nomeTratado.toLocaleLowerCase("pt-BR"),
  );

  return categoriaAtiva ? "" : nomeTratado;
};
