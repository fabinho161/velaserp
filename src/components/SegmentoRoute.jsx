import { Navigate } from "react-router-dom";
import { useERP } from "../context/useERP";
import { segmentoPossuiModulo } from "../config/segmentosEmpresa.js";

export default function SegmentoRoute({ modulo, children }) {
  const {
    empresaId,
    empresaOwnerUid,
    empresas = [],
    perfilCarregando,
    user,
    usuariosEmpresaCarregando,
  } = useERP();

  if (!modulo) return children;

  if (perfilCarregando || usuariosEmpresaCarregando || !empresaId) {
    return <div className="app-loading">Verificando segmento...</div>;
  }

  const empresaAtual = empresas.find((empresa) =>
    empresa.id === empresaId &&
    (empresa.ownerUid || user?.uid) === (empresaOwnerUid || user?.uid)
  ) || null;

  if (!segmentoPossuiModulo(empresaAtual?.segmento, modulo)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
