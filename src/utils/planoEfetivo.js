import {
  assinaturaGratisPadrao,
  normalizarLimiteUsuariosManual,
} from "../config/planos.js";

const PLANOS_CANONICOS = new Set(["gratis", "basico", "profissional", "premium"]);
const STATUS_CANONICOS = new Set(["active", "inactive", "blocked"]);

const assinaturaEmpresaIndisponivel = {
  ...assinaturaGratisPadrao,
  plano: "gratis",
  status: "inactive",
  limiteUsuariosManual: null,
};

const normalizarTexto = (valor) => String(valor || "").trim().toLowerCase();

const isObjetoPlano = (valor) =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor);

const normalizarAssinaturaPlano = (
  assinatura,
  fallback = assinaturaGratisPadrao
) => {
  const dados = isObjetoPlano(assinatura) ? assinatura : {};
  const planoInformado = normalizarTexto(dados.plano);
  const statusInformado = normalizarTexto(dados.status);
  const plano = PLANOS_CANONICOS.has(planoInformado)
    ? planoInformado
    : fallback.plano;
  const status = STATUS_CANONICOS.has(statusInformado)
    ? statusInformado
    : fallback.status;

  return {
    ...fallback,
    ...dados,
    plano,
    status,
    limiteUsuariosManual: normalizarLimiteUsuariosManual(
      dados.limiteUsuariosManual
    ),
  };
};

const usuarioEmpresaEstaAtivo = (usuarioEmpresa) =>
  normalizarTexto(usuarioEmpresa?.status) === "ativo";

export const resolverPlanoEfetivo = ({
  assinaturaUsuario,
  empresaAtual,
  usuarioConvidadoEmpresa = false,
  usuarioEmpresaAtual,
  perfilCarregando = false,
  usuariosEmpresaCarregando = false,
} = {}) => {
  if (
    usuarioConvidadoEmpresa &&
    (
      !usuarioEmpresaAtual ||
      !usuarioEmpresaEstaAtivo(usuarioEmpresaAtual)
    )
  ) {
    return {
      assinatura: assinaturaEmpresaIndisponivel,
      assinaturaCarregando: Boolean(
        perfilCarregando ||
          (usuariosEmpresaCarregando && !usuarioEmpresaAtual)
      ),
      fonte: usuarioEmpresaAtual ? "vinculoInativo" : "semVinculoAtivo",
    };
  }

  const planoEspelho = isObjetoPlano(empresaAtual?.planoEspelho)
    ? empresaAtual.planoEspelho
    : null;

  if (planoEspelho) {
    return {
      assinatura: normalizarAssinaturaPlano(
        planoEspelho,
        assinaturaEmpresaIndisponivel
      ),
      assinaturaCarregando: Boolean(perfilCarregando),
      fonte: "planoEspelho",
    };
  }

  if (usuarioConvidadoEmpresa) {
    const aguardandoVinculo = usuariosEmpresaCarregando && !usuarioEmpresaAtual;
    const aguardandoEmpresa = Boolean(usuarioEmpresaAtual && !empresaAtual);
    const vinculoAtivo = usuarioEmpresaEstaAtivo(usuarioEmpresaAtual);

    return {
      assinatura: assinaturaEmpresaIndisponivel,
      assinaturaCarregando: Boolean(
        perfilCarregando ||
          aguardandoVinculo ||
          (vinculoAtivo && aguardandoEmpresa)
      ),
      fonte: "empresaSemPlanoEspelho",
    };
  }

  return {
    assinatura: normalizarAssinaturaPlano(
      assinaturaUsuario,
      assinaturaGratisPadrao
    ),
    assinaturaCarregando: Boolean(perfilCarregando),
    fonte: "assinaturaOwner",
  };
};
