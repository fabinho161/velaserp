import { useMemo } from "react";
import { useERP } from "../context/useERP";
import {
  getLimiteUsuariosEfetivo,
  getPlanoConfig,
  getPlanoNivel,
  normalizarLimiteUsuariosManual,
} from "../config/planos";
import { resolverPlanoEfetivo } from "../utils/planoEfetivo.js";

export function usePlano() {
  const {
    assinaturaUsuario,
    perfilCarregando,
    isAdminMaster,
    user,
    empresaId,
    empresaOwnerUid,
    usuarioEmpresaAtual,
    usuariosEmpresaCarregando,
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
      empresaOwnerUid !== user.uid
    );
    const planoEfetivo = resolverPlanoEfetivo({
      assinaturaUsuario,
      empresaAtual,
      usuarioConvidadoEmpresa,
      usuarioEmpresaAtual,
      perfilCarregando,
      usuariosEmpresaCarregando,
    });
    const assinatura = planoEfetivo.assinatura;

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
      assinaturaCarregando: planoEfetivo.assinaturaCarregando,
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
    usuariosEmpresaCarregando,
  ]);
}
