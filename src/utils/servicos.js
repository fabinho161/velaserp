const texto = (valor) => String(valor ?? "").trim();

export const montarDadosOperacionaisServico = (form = {}) => {
  const tempo = texto(form.tempoEstimadoMinutos);

  return {
    nome: texto(form.nome),
    descricao: texto(form.descricao),
    valor: Number(form.valor),
    tempoEstimadoMinutos: tempo ? Number(tempo) : "",
    status: String(form.status || "ativo").trim().toLowerCase() === "inativo"
      ? "inativo"
      : "ativo",
  };
};
