import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { usePlano } from "../hooks/usePlano";

export default function EmpresaSwitcher() {
  const { empresas, empresaId, trocarEmpresa, criarNovaEmpresa } = useERP();
  const { showToast } = useToast();
  const { podeCriarEmpresa } = usePlano();
  const [novaEmpresa, setNovaEmpresa] = useState("");

  const criar = async () => {
    if (!novaEmpresa.trim()) {
      showToast("Digite o nome da empresa.", "warning");
      return;
    }

    if (!podeCriarEmpresa) {
      showToast("Limite de empresas atingido no seu plano.", "warning");
      return;
    }

    await criarNovaEmpresa(novaEmpresa.trim());
    setNovaEmpresa("");
  };

  return (
    <div className="empresa-switcher">
      <label>Empresa</label>

      <select
        value={empresaId || ""}
        onChange={(e) => trocarEmpresa(e.target.value)}
      >
        {empresas.map((empresa) => (
          <option key={empresa.id} value={empresa.id}>
            {empresa.nome}
          </option>
        ))}
      </select>

      <div className="empresa-nova">
        <input
          placeholder="Nova empresa"
          value={novaEmpresa}
          disabled={!podeCriarEmpresa}
          onChange={(e) => setNovaEmpresa(e.target.value)}
        />

        <button onClick={criar} disabled={!podeCriarEmpresa}>+</button>
      </div>
    </div>
  );
}
