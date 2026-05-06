import { useMemo } from "react";
import { useERP } from "../context/useERP";
import { assinaturaGratisPadrao, getPlanoConfig, getPlanoNivel } from "../config/planos";

export function usePlano() {
  const {
    assinaturaUsuario,
    perfilCarregando,
    isAdminMaster,
    empresas = [],
  } = useERP() || {};

  return useMemo(() => {
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
      podeUsarVendas:
        isAdminMaster || assinaturaAtiva && Boolean(limites.vendas),
      podeUsarDRE: isAdminMaster || assinaturaAtiva && Boolean(limites.dre),
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
      limiteVendasMes: isAdminMaster ? null : limiteVendasMes,
    };
  }, [assinaturaUsuario, empresas, isAdminMaster, perfilCarregando]);
}
