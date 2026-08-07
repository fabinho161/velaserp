import { useMemo } from "react";
import { useERP } from "../context/useERP";
import {
  assinaturaGratisPadrao,
  getLimiteUsuariosEfetivo,
  getPlanoConfig,
  getPlanoNivel,
  normalizarLimiteUsuariosManual,
} from "../config/planos";

const PLANOS_CANONICOS = new Set(["gratis", "basico", "profissional", "premium"]);
const STATUS_CANONICOS = new Set(["active", "inactive", "blocked"]);
const assinaturaConvidadoFallback = {
  ...assinaturaGratisPadrao,
  plano: "gratis",
  status: "inactive",
  limiteUsuariosManual: null,
};

const normalizarTexto = (valor) => String(valor || "").trim().toLowerCase();

const resolverAssinaturaNormalizada = (assinatura, fallback) => {
  const dados = assinatura && typeof assinatura === "object" && !Array.isArray(assinatura)
    ? assinatura
    : {};
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

export function usePlano() {
  const {
    assinaturaUsuario,
    perfilCarregando,
    isAdminMaster,
    user,
    empresaId,
    empresaOwnerUid,
    usuarioEmpresaAtual,
    empresas = [],
  } = useERP() || {};

  return useMemo(() => {
    const empresaAtual = empresas.find((empresa) =>
      empresa.id === empresaId &&
      (empresa.ownerUid || user?.uid) === (empresaOwnerUid || user?.uid)
    ) || null;
    const usuarioConvidadoEmpresa = Boolean(
      user?.uid &&
      empresaOwnerUid &&
      empresaOwnerUid !== user.uid &&
      usuarioEmpresaAtual?.uidAuth === user.uid
    );
    const planoEspelhoCarregando = Boolean(
      usuarioConvidadoEmpresa &&
      !empresaAtual
    );
    const assinatura = usuarioConvidadoEmpresa
      ? resolverAssinaturaNormalizada(
          empresaAtual?.planoEspelho,
          assinaturaConvidadoFallback
        )
      : resolverAssinaturaNormalizada(
          assinaturaUsuario,
          assinaturaGratisPadrao
        );

    const planoAtual = assinatura.plano;
    const status = assinatura.status;
    const limites = getPlanoConfig(planoAtual);
    const planoNivel = getPlanoNivel(planoAtual);
    const assinaturaAtiva = status === "active";

    const limiteEmpresas = limites.empresas;
    const limiteUsuariosPlano = limites.usuarios;
    const limiteUsuariosManual = normalizarLimiteUsuariosManual(
      assinatura.limiteUsuariosManual
    );
    const limiteUsuariosEfetivo = getLimiteUsuariosEfetivo(
      planoAtual,
      limiteUsuariosManual
    );
    const limiteVendasMes = limites.vendasMes;

    const podeCriarEmpresa =
      isAdminMaster ||
      !usuarioConvidadoEmpresa &&
      assinaturaAtiva &&
      (limiteEmpresas === null || empresas.length < limiteEmpresas);

    return {
      assinatura,
      planoAtual,
      planoNivel,
      status,
      limites,
      assinaturaCarregando: Boolean(perfilCarregando || planoEspelhoCarregando),
      isGratis: planoAtual === "gratis",
      isBasico: planoAtual === "basico",
      isProfissional: planoAtual === "profissional",
      isPremium: planoAtual === "premium",
      podeCriarEmpresa,
      podeCriarUsuarioEmpresa: isAdminMaster || assinaturaAtiva,
      podeUsarVendas:
        isAdminMaster || assinaturaAtiva && Boolean(limites.vendas),
      podeUsarDRE:
        isAdminMaster || assinaturaAtiva && Boolean(limites.dre),
      podeGerarPDF:
        isAdminMaster || assinaturaAtiva && Boolean(limites.pdfProfissional),
      podePersonalizarSistema:
        isAdminMaster || assinaturaAtiva && Boolean(limites.personalizacao),
      podeUsarRelatoriosAvancados:
        isAdminMaster || assinaturaAtiva && Boolean(limites.relatoriosAvancados),
      podeUsarCRMComercial:
        isAdminMaster || assinaturaAtiva && Boolean(limites.crmComercial),
      podeUsarCRMBasico:
        isAdminMaster || assinaturaAtiva && Boolean(limites.crmBasico),
      podeUsarCRMInteligente:
        isAdminMaster || assinaturaAtiva && Boolean(limites.crmInteligente),
      podeUsarCRMWhatsapp:
        isAdminMaster || assinaturaAtiva && Boolean(limites.crmWhatsapp),
      podeUsarCRMFollowUp:
        isAdminMaster || assinaturaAtiva && Boolean(limites.crmFollowUp),
      limiteEmpresas: isAdminMaster ? null : limiteEmpresas,
      limiteUsuarios: isAdminMaster ? null : limiteUsuariosEfetivo,
      limiteUsuariosPlano,
      limiteUsuariosManual,
      limiteUsuariosEfetivo,
      limiteVendasMes: isAdminMaster ? null : limiteVendasMes,
    };
  }, [
    assinaturaUsuario,
    empresaId,
    empresaOwnerUid,
    empresas,
    isAdminMaster,
    perfilCarregando,
    user,
    usuarioEmpresaAtual,
  ]);
}
