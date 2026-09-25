const texto = (valor) => String(valor || "").trim();

const obterDadosVisiveisCliente = (form = {}) => ({
  nome: texto(form.nome),
  telefone: texto(form.telefone),
  email: texto(form.email),
  documento: texto(form.documento),
  cidade: texto(form.cidade),
  uf: texto(form.uf).toUpperCase(),
  endereco: texto(form.endereco),
  observacoes: form.observacoes || "",
});

export const montarDadosClientePersistencia = ({
  form = {},
  fiscalCliente = null,
  isPrestacaoServicos = false,
  clienteExistente = null,
  empresaId = "",
  userId = "",
  atualizadoEm = new Date(),
} = {}) => {
  const dadosVisiveis = obterDadosVisiveisCliente(form);
  const metadados = {
    empresaId,
    userId,
    updatedAt: atualizadoEm,
  };

  if (isPrestacaoServicos && clienteExistente) {
    return { ...dadosVisiveis, ...metadados };
  }

  const clienteAtivo = form.ativo !== false;
  let statusRelacionamento = form.statusRelacionamento;

  if (!clienteAtivo) {
    statusRelacionamento = "Inativo";
  } else if (statusRelacionamento === "Inativo") {
    statusRelacionamento = "Ativo";
  }

  return {
    ...form,
    ...dadosVisiveis,
    fiscal: fiscalCliente,
    ...metadados,
    ativo: clienteAtivo,
    statusRelacionamento,
  };
};

export const montarAlteracaoStatusCliente = (ativo, atualizadoEm = new Date()) => ({
  ativo: Boolean(ativo),
  statusRelacionamento: ativo ? "Ativo" : "Inativo",
  updatedAt: atualizadoEm,
});
