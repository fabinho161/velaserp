import { useMemo } from "react";
import { useERP } from "../context/useERP";
import {
  assinaturaGratisPadrao,
  getLimiteUsuariosEfetivo,
  getPlanoConfig,
  getPlanoNivel,
  normalizarLimiteUsuariosManual,
} from "../config/planos";

export function usePlano() {
  const {
    assinaturaUsuario,
    perfilCarregando,
    isAdminMaster,
    user,
    empresaOwnerUid,
    usuarioEmpresaAtual,
    empresas = [],
  } = useERP() || {};

  return useMemo(() => {
    const usuarioConvidadoEmpresa = Boolean(
      user?.uid &&
      empresaOwnerUid &&
      empresaOwnerUid !== user.uid &&
      usuarioEmpresaAtual?.uidAuth === user.uid
    );
    const assinatura = {
      ...assinaturaGratisPadrao,
      ...(assinaturaUsuario || {}),
    };

    const planoAtual = assinatura.plano || "gratis";
    const status = assinatura.status || "active";
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
      assinaturaAtiva &&
      (limiteEmpresas === null || empresas.length < limiteEmpresas);

    return {
      assinatura,
      planoAtual,
      planoNivel,
      status,
      limites,
      assinaturaCarregando: Boolean(perfilCarregando),
      isGratis: planoAtual === "gratis",
      isBasico: planoAtual === "basico",
      isProfissional: planoAtual === "profissional",
      isPremium: planoAtual === "premium",
      podeCriarEmpresa,
      podeCriarUsuarioEmpresa: isAdminMaster || assinaturaAtiva,
      podeUsarVendas:
        isAdminMaster || usuarioConvidadoEmpresa || assinaturaAtiva && Boolean(limites.vendas),
      podeUsarDRE:
        isAdminMaster || usuarioConvidadoEmpresa || assinaturaAtiva && Boolean(limites.dre),
      podeGerarPDF:
        isAdminMaster ||
        usuarioConvidadoEmpresa ||
        assinaturaAtiva && Boolean(limites.pdfProfissional),
      podePersonalizarSistema:
        isAdminMaster ||
        usuarioConvidadoEmpresa ||
        assinaturaAtiva && Boolean(limites.personalizacao),
      podeUsarRelatoriosAvancados:
        isAdminMaster ||
        usuarioConvidadoEmpresa ||
        assinaturaAtiva && Boolean(limites.relatoriosAvancados),
      podeUsarCRMComercial:
        isAdminMaster ||
        usuarioConvidadoEmpresa ||
        assinaturaAtiva && Boolean(limites.crmComercial),
      podeUsarCRMBasico:
        isAdminMaster || usuarioConvidadoEmpresa || assinaturaAtiva && Boolean(limites.crmBasico),
      podeUsarCRMInteligente:
        isAdminMaster ||
        usuarioConvidadoEmpresa ||
        assinaturaAtiva && Boolean(limites.crmInteligente),
      podeUsarCRMWhatsapp:
        isAdminMaster ||
        usuarioConvidadoEmpresa ||
        assinaturaAtiva && Boolean(limites.crmWhatsapp),
      podeUsarCRMFollowUp:
        isAdminMaster ||
        usuarioConvidadoEmpresa ||
        assinaturaAtiva && Boolean(limites.crmFollowUp),
      limiteEmpresas: isAdminMaster ? null : limiteEmpresas,
      limiteUsuarios: isAdminMaster ? null : limiteUsuariosEfetivo,
      limiteUsuariosPlano,
      limiteUsuariosManual,
      limiteUsuariosEfetivo,
      limiteVendasMes: isAdminMaster ? null : limiteVendasMes,
    };
  }, [
    assinaturaUsuario,
    empresaOwnerUid,
    empresas,
    isAdminMaster,
    perfilCarregando,
    user,
    usuarioEmpresaAtual,
  ]);
}
