import { useCallback, useMemo, useState } from "react";
import { ConfirmContext } from "./ConfirmContextBase";

export function ConfirmProvider({ children }) {
  const [confirmacao, setConfirmacao] = useState(null);

  // ================================
  // 🔹 CONFIRMAÇÃO GLOBAL
  // ================================
  const confirmar = useCallback((message) => {
    return new Promise((resolve) => {
      setConfirmacao({
        message,
        resolve,
      });
    });
  }, []);

  const responder = (resultado) => {
    if (confirmacao?.resolve) {
      confirmacao.resolve(resultado);
    }

    setConfirmacao(null);
  };

  const value = useMemo(() => ({ confirmar }), [confirmar]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}

      {confirmacao && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <h3>Confirmar ação</h3>
            <p>{confirmacao.message}</p>

            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-secondary"
                onClick={() => responder(false)}
              >
                Cancelar
              </button>

              <button type="button" onClick={() => responder(true)}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
