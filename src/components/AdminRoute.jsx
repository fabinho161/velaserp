import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";

export default function AdminRoute({ children }) {
  const { perfilCarregando, isAdminMaster } = useERP();
  const { showToast } = useToast();

  // ================================
  // 🔹 PROTEÇÃO DE ACESSO ADMIN
  // ================================
  useEffect(() => {
    if (!perfilCarregando && !isAdminMaster) {
      showToast("Acesso restrito ao administrador.", "warning");
    }
  }, [isAdminMaster, perfilCarregando, showToast]);

  if (perfilCarregando) {
    return <div className="app-loading">Verificando permissões...</div>;
  }

  if (!isAdminMaster) {
    return <Navigate to="/" replace />;
  }

  return children;
}
