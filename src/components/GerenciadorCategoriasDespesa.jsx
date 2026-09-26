import { useMemo, useState } from "react";
import { Check, Edit3, Eye, EyeOff, Plus, Settings2, X } from "lucide-react";

export default function GerenciadorCategoriasDespesa({
  categorias = [],
  adicionarCategoria,
  editarCategoria,
  alterarAtividadeCategoria,
  fechar,
}) {
  const [novoNome, setNovoNome] = useState("");
  const [categoriaEditando, setCategoriaEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const categoriasOrdenadas = useMemo(
    () => [...categorias].sort((a, b) =>
      String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR")
    ),
    [categorias],
  );

  const executar = async (operacao) => {
    if (salvando) return;
    setSalvando(true);
    try {
      await operacao();
    } finally {
      setSalvando(false);
    }
  };

  const adicionar = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    await executar(async () => {
      await adicionarCategoria(nome);
      setNovoNome("");
    });
  };

  const salvarEdicao = async () => {
    const nome = categoriaEditando?.nome?.trim();
    if (!nome) return;
    await executar(async () => {
      await editarCategoria(categoriaEditando.id, nome, categoriaEditando.ativo);
      setCategoriaEditando(null);
    });
  };

  return (
    <div className="modal-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !salvando) fechar();
    }}>
      <div className="modal-card finance-categories-modal" role="dialog" aria-modal="true" aria-labelledby="finance-categories-title">
        <div className="finance-categories-header">
          <div>
            <span className="badge badge-info"><Settings2 size={14} /> Financeiro</span>
            <h3 id="finance-categories-title">Categorias de despesas</h3>
            <p>Gerencie as categorias disponíveis para novos lançamentos.</p>
          </div>
          <button type="button" className="finance-categories-close" onClick={fechar} disabled={salvando} aria-label="Fechar gerenciador de categorias" title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="finance-categories-new">
          <input type="text" value={novoNome} placeholder="Nova categoria" onChange={(event) => setNovoNome(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") adicionar();
          }} disabled={salvando} />
          <button type="button" onClick={adicionar} disabled={salvando || !novoNome.trim()}>
            <Plus size={16} /> Adicionar
          </button>
        </div>

        <div className="finance-categories-list">
          {categoriasOrdenadas.map((categoria) => {
            const editando = categoriaEditando?.id === categoria.id;
            return (
              <div className="finance-categories-item" key={categoria.id}>
                <div className="finance-categories-name">
                  {editando ? (
                    <input type="text" value={categoriaEditando.nome} onChange={(event) => setCategoriaEditando({ ...categoriaEditando, nome: event.target.value })} onKeyDown={(event) => {
                      if (event.key === "Enter") salvarEdicao();
                      if (event.key === "Escape") setCategoriaEditando(null);
                    }} disabled={salvando} autoFocus />
                  ) : <strong>{categoria.nome}</strong>}
                </div>
                <span className={`badge ${categoria.ativo ? "badge-success" : "badge-warning"}`}>
                  {categoria.ativo ? "Ativa" : "Inativa"}
                </span>
                <div className="finance-categories-actions">
                  {editando ? (
                    <>
                      <button type="button" onClick={salvarEdicao} disabled={salvando}><Check size={15} /> Salvar</button>
                      <button type="button" className="confirm-secondary" onClick={() => setCategoriaEditando(null)} disabled={salvando}><X size={15} /> Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setCategoriaEditando({ ...categoria })} disabled={salvando}><Edit3 size={15} /> Editar</button>
                      <button type="button" className={categoria.ativo ? "finance-categories-deactivate" : ""} onClick={() => executar(() => alterarAtividadeCategoria(categoria.id, !categoria.ativo))} disabled={salvando}>
                        {categoria.ativo ? <EyeOff size={15} /> : <Eye size={15} />}
                        {categoria.ativo ? "Inativar" : "Reativar"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {categoriasOrdenadas.length === 0 && <div className="empty-state">Nenhuma categoria cadastrada.</div>}
        </div>
      </div>
    </div>
  );
}
