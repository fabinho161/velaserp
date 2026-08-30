import { useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { usePlano } from "../hooks/usePlano";
import {
  SEGMENTOS_EMPRESA,
  SEGMENTO_EMPRESA_PADRAO,
  normalizarSegmentoEmpresa,
} from "../config/segmentosEmpresa.js";

const LABELS_SEGMENTO = {
  comercio: "Comércio",
  industria: "Indústria",
  oficina: "Oficina",
  clientes: "Prestação de Serviços",
};

export default function EmpresaSwitcher() {
  const { empresas, empresaId, trocarEmpresa, criarNovaEmpresa } = useERP();
  const { showToast } = useToast();
  const { podeCriarEmpresa } = usePlano();
  const [novaEmpresa, setNovaEmpresa] = useState("");
  const [segmento, setSegmento] = useState(SEGMENTO_EMPRESA_PADRAO);
  const [exibirNovaEmpresa, setExibirNovaEmpresa] = useState(false);
  const [criando, setCriando] = useState(false);
  const empresaAtual = empresas.find((empresa) => empresa.id === empresaId);
  const segmentoAtual = normalizarSegmentoEmpresa(empresaAtual?.segmento);
  const labelSegmentoAtual = LABELS_SEGMENTO[segmentoAtual] || LABELS_SEGMENTO.industria;

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
        setExibirNovaEmpresa(false);
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

      {empresaAtual && (
        <div className="empresa-segmento-atual">
          <span>Segmento atual</span>
          <strong>{labelSegmentoAtual}</strong>
        </div>
      )}

      {!exibirNovaEmpresa ? (
        <button
          type="button"
          className="empresa-nova-toggle"
          onClick={() => setExibirNovaEmpresa(true)}
          disabled={!podeCriarEmpresa}
        >
          + Nova empresa
        </button>
      ) : (
        <div className="empresa-nova">
          <label>Nome da nova empresa</label>
          <div className="empresa-nova-linha">
            <input
              placeholder="Nome da nova empresa"
              value={novaEmpresa}
              disabled={!podeCriarEmpresa || criando}
              onChange={(e) => setNovaEmpresa(e.target.value)}
            />

            <button type="button" onClick={criar} disabled={!podeCriarEmpresa || criando}>
              {criando ? "..." : "Criar"}
            </button>
          </div>

          <label>Tipo do negócio</label>
          <select
            value={segmento}
            disabled={!podeCriarEmpresa || criando}
            onChange={(e) => setSegmento(e.target.value)}
          >
            {Object.values(SEGMENTOS_EMPRESA).map((item) => (
              <option key={item.id} value={item.id}>
                {LABELS_SEGMENTO[item.id] || item.nome}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
