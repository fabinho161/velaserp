import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

export default function ActionMenu({ label = "Abrir ações", items = [] }) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;

    const fecharAoClicarFora = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setAberto(false);
        setPosicao(null);
      }
    };

    const fecharAoRolar = () => {
      setAberto(false);
      setPosicao(null);
    };

    document.addEventListener("mousedown", fecharAoClicarFora);
    window.addEventListener("resize", fecharAoRolar);
    window.addEventListener("scroll", fecharAoRolar, true);

    return () => {
      document.removeEventListener("mousedown", fecharAoClicarFora);
      window.removeEventListener("resize", fecharAoRolar);
      window.removeEventListener("scroll", fecharAoRolar, true);
    };
  }, [aberto]);

  const calcularPosicao = (botao) => {
    const rect = botao.getBoundingClientRect();
    const larguraMenu = Math.min(220, window.innerWidth - 24);
    const alturaEstimada = Math.min(260, 18 + items.length * 42);
    const espacoAbaixo = window.innerHeight - rect.bottom;
    const abrirParaCima =
      espacoAbaixo < alturaEstimada && rect.top > alturaEstimada;
    const left = Math.max(
      12,
      Math.min(rect.right - larguraMenu, window.innerWidth - larguraMenu - 12)
    );

    return {
      top: abrirParaCima ? "auto" : rect.bottom + 6,
      bottom: abrirParaCima ? window.innerHeight - rect.top + 6 : "auto",
      left,
      width: larguraMenu,
    };
  };

  const alternarMenu = (event) => {
    event.stopPropagation();

    if (aberto) {
      setAberto(false);
      setPosicao(null);
      return;
    }

    setPosicao(calcularPosicao(event.currentTarget));
    setAberto(true);
  };

  const executarAcao = (item) => {
    if (item.disabled) return;

    setAberto(false);
    setPosicao(null);
    item.onClick?.();
  };

  return (
    <div className="action-menu" ref={menuRef}>
      <button
        type="button"
        className="action-menu-button"
        aria-label={label}
        aria-expanded={aberto}
        onClick={alternarMenu}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>

      {aberto && (
        <div className="action-menu-dropdown" style={posicao || {}}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.danger ? "danger" : undefined}
              disabled={item.disabled}
              onClick={() => executarAcao(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
