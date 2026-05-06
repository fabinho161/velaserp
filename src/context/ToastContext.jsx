import { useCallback, useMemo, useState } from "react";
import Toast from "../components/Toast";
import { ToastContext } from "./ToastContextBase";

const normalizarTipoToast = (type = "success") => {
  const aliases = {
    sucesso: "success",
    successo: "success",
    erro: "error",
    aviso: "warning",
    alerta: "warning",
  };

  return aliases[type] || type;
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  // ================================
  // 🔹 NOTIFICAÇÕES GLOBAIS
  // ================================
  const showToast = useCallback((message, type = "success") => {
    setToast({
      id: Date.now(),
      message,
      type: normalizarTipoToast(type),
    });
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </ToastContext.Provider>
  );
}
