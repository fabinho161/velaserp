import { useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { usePlano } from "../hooks/usePlano";

export default function PlanoRoute({
  permitido,
  titulo,
  descricao,
  planoMinimo,
  children,
}) {
  const navigate = useNavigate();
  const { assinaturaCarregando } = usePlano();

  if (assinaturaCarregando) {
    return <div className="app-loading">Verificando plano...</div>;
  }

  if (permitido) {
    return children;
  }

  return (
    <div className="module-locked-page">
      <div className="card plan-locked-card module-locked-card">
        <div className="module-locked-icon">
          <LockKeyhole size={24} />
        </div>
        <span className="module-locked-badge">{planoMinimo}</span>
        <h2>{titulo}</h2>
        <p>{descricao}</p>
        <button type="button" onClick={() => navigate("/planos")}>
          Fazer upgrade
        </button>
      </div>
    </div>
  );
}
