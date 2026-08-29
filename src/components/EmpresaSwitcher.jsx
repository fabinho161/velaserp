import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { usePlano } from "../hooks/usePlano";
import { SEGMENTOS_EMPRESA, SEGMENTO_EMPRESA_PADRAO } from "../config/segmentosEmpresa.js";

export default function EmpresaSwitcher() {
  const { empresas, empresaId, trocarEmpresa, criarNovaEmpresa } = useERP();
  const { showToast } = useToast();
  const { podeCriarEmpresa } = usePlano();
  const [novaEmpresa, setNovaEmpresa] = useState("");
  const [segmento, setSegmento] = useState(SEGMENTO_EMPRESA_PADRAO);
  const [criando, setCriando] = useState(false);

  const criar = async () => {
    if (criando) return;

    if (!novaEmpresa.trim()) {
      showToast("Digite o nome da empresa.", "warning");
      return;
    }

    if (!podeCriarEmpresa) {
      showToast("Limite de empresas atingido no seu plano.", "warning");
      return;
    }

    setCriando(true);

    try {
      const criada = await criarNovaEmpresa(novaEmpresa.trim(), segmento);

      if (criada) {
        setNovaEmpresa("");
        setSegmento(SEGMENTO_EMPRESA_PADRAO);
      }
    } finally {
      setCriando(false);
    }
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
          disabled={!podeCriarEmpresa || criando}
          onChange={(e) => setNovaEmpresa(e.target.value)}
        />

        <select
          value={segmento}
          disabled={!podeCriarEmpresa || criando}
          onChange={(e) => setSegmento(e.target.value)}
        >
          {Object.values(SEGMENTOS_EMPRESA).map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>

        <button onClick={criar} disabled={!podeCriarEmpresa || criando}>
          {criando ? "..." : "+"}
        </button>
      </div>
    </div>
  );
}
