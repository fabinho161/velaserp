import { ShieldX } from "lucide-react";
import { useERP } from "../context/useERP";

export default function EmpresaPermissionRoute({
  permissao,
  titulo = "Voce nao tem permissao para acessar este modulo.",
  descricao = "Solicite ao Administrador da Empresa a liberacao do acesso.",
  children,
}) {
  const {
    empresaId,
    perfilCarregando,
    usuariosEmpresaCarregando,
    usuarioEmpresaInativo,
    temPermissaoEmpresaAtual,
  } = useERP();

  if (perfilCarregando || usuariosEmpresaCarregando || !empresaId) {
    return <div className="app-loading">Verificando permissoes...</div>;
  }

  if (usuarioEmpresaInativo) {
    return (
      <div className="module-locked-page">
        <div className="card plan-locked-card module-locked-card">
          <div className="module-locked-icon">
            <ShieldX size={24} />
          </div>
          <span className="module-locked-badge">Usuario inativo</span>
          <h2>Acesso bloqueado nesta empresa</h2>
          <p>Seu usuario esta inativo para a empresa selecionada.</p>
        </div>
      </div>
    );
  }

  if (permissao && !temPermissaoEmpresaAtual?.(permissao)) {
    return (
      <div className="module-locked-page">
        <div className="card plan-locked-card module-locked-card">
          <div className="module-locked-icon">
            <ShieldX size={24} />
          </div>
          <span className="module-locked-badge">Permissao restrita</span>
          <h2>{titulo}</h2>
          <p>{descricao}</p>
        </div>
      </div>
    );
  }

  return children;
}
