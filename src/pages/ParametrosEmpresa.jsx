import { useMemo, useState } from "react";
import {
  Check,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useParametros } from "../hooks/useParametros";
import { useToast } from "../context/useToast";

const PARAM_GROUPS = {
  unidadesMedida: {
    title: "Unidades de Medida",
    subtitle: "Usadas em insumos, estoque e produção.",
    icon: SlidersHorizontal,
    badge: "Operação",
  },
  tiposProduto: {
    title: "Tipos de Produto",
    subtitle: "Usados no cadastro de produtos e ficha técnica.",
    icon: Tag,
    badge: "Produtos",
  },
  categoriasDespesa: {
    title: "Categorias de Despesa",
    subtitle: "Usadas nos lançamentos financeiros.",
    icon: Settings2,
    badge: "Financeiro",
  },
};

export default function ParametrosEmpresa() {
  const {
    unidadesMedida = [],
    tiposProduto = [],
    categoriasDespesa = [],
    adicionarParametro,
    editarParametro,
    desativarParametro,
    excluirParametro,
  } = useParametros();

  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState("unidadesMedida");
  const [searchTerm, setSearchTerm] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const currentItems = useMemo(
    () => {
      if (activeTab === "unidadesMedida") return unidadesMedida;
      if (activeTab === "tiposProduto") return tiposProduto;
      if (activeTab === "categoriasDespesa") return categoriasDespesa;
      return [];
    },
    [activeTab, categoriasDespesa, tiposProduto, unidadesMedida]
  );
  const lists = {
    unidadesMedida,
    tiposProduto,
    categoriasDespesa,
  };
  const currentGroup = PARAM_GROUPS[activeTab];
  const CurrentIcon = currentGroup.icon;

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return currentItems
      .filter((item) => item?.nome?.toLowerCase().includes(term))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [currentItems, searchTerm]);

  const activeCount = currentItems.filter((item) => item.ativo).length;
  const inactiveCount = currentItems.length - activeCount;

  async function handleAddItem() {
    const nome = newItemName.trim();

    if (!nome) {
      showToast("Informe o nome do parâmetro.", "warning");
      return;
    }

    await adicionarParametro(activeTab, nome);
    setNewItemName("");
  }

  async function handleSaveEdit() {
    const nome = editingItem?.nome?.trim();

    if (!nome) {
      showToast("Informe o nome do parâmetro.", "warning");
      return;
    }

    await editarParametro(activeTab, editingItem.id, nome, editingItem.ativo);
    setEditingItem(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;

    await excluirParametro(activeTab, deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div className="parametros-page">
      <div className="page-header parametros-header">
        <div>
          <span className="badge badge-info parametros-eyebrow">
            <Settings2 size={14} />
            Configurações operacionais
          </span>

          <h1 className="page-title">Parâmetros da Empresa</h1>

          <p className="page-subtitle">
            Personalize listas usadas no ERP sem interferir nas configurações de
            outras empresas. Cada empresa mantém suas próprias unidades, tipos e
            categorias.
          </p>
        </div>
      </div>

      <div className="summary-grid parametros-summary">
        <div className="card metric-card metric-blue">
          <p>Total de parâmetros</p>
          <h2>{currentItems.length}</h2>
          <small>{currentGroup.title}</small>
        </div>

        <div className="card metric-card metric-green">
          <p>Ativos</p>
          <h2>{activeCount}</h2>
          <small>Disponíveis nos cadastros</small>
        </div>

        <div className="card metric-card metric-amber">
          <p>Inativos</p>
          <h2>{inactiveCount}</h2>
          <small>Ocultos dos novos lançamentos</small>
        </div>
      </div>

      <div className="parametros-tabs card">
        {Object.entries(PARAM_GROUPS).map(([key, group]) => {
          const Icon = group.icon;
          const isActive = activeTab === key;
          const total = lists[key]?.length || 0;

          return (
            <button
              key={key}
              type="button"
              className={`parametros-tab ${isActive ? "active" : ""}`}
              onClick={() => {
                setActiveTab(key);
                setSearchTerm("");
                setNewItemName("");
                setEditingItem(null);
              }}
            >
              <span className="parametros-tab-icon">
                <Icon size={18} />
              </span>

              <span>
                <strong>{group.title}</strong>
                <small>{total} parâmetro(s)</small>
              </span>
            </button>
          );
        })}
      </div>

      <section className="card parametros-card">
        <div className="parametros-card-header">
          <div className="parametros-title-block">
            <span className="parametros-main-icon">
              <CurrentIcon size={22} />
            </span>

            <div>
              <span className="badge badge-purple">{currentGroup.badge}</span>
              <h3>{currentGroup.title}</h3>
              <p>{currentGroup.subtitle}</p>
            </div>
          </div>
        </div>

        <div className="parametros-toolbar">
          <label className="parametros-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Buscar parâmetro..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <div className="parametros-new">
            <input
              type="text"
              placeholder="Novo parâmetro..."
              value={newItemName}
              onChange={(event) => setNewItemName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAddItem();
              }}
            />

            <button type="button" onClick={handleAddItem}>
              <Plus size={16} />
              Adicionar
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="empty-state parametros-empty">
            {searchTerm
              ? "Nenhum parâmetro encontrado para essa busca."
              : "Nenhum parâmetro cadastrado neste grupo."}
          </div>
        ) : (
          <div className="parametros-list">
            {filteredItems.map((item) => {
              const isEditing = editingItem?.id === item.id;

              return (
                <article key={item.id} className="parametros-item">
                  <div className="parametros-item-main">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingItem.nome}
                        onChange={(event) =>
                          setEditingItem({
                            ...editingItem,
                            nome: event.target.value,
                          })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleSaveEdit();
                          if (event.key === "Escape") setEditingItem(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <>
                        <strong>{item.nome}</strong>
                        <small>ID: {item.id}</small>
                      </>
                    )}
                  </div>

                  <div className="parametros-status">
                    <span
                      className={`badge ${
                        item.ativo ? "badge-success" : "badge-warning"
                      }`}
                    >
                      {item.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  <div className="btn-action-group parametros-actions">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={handleSaveEdit}
                        >
                          <Check size={15} />
                          Salvar
                        </button>

                        <button
                          type="button"
                          className="btn-sm confirm-secondary"
                          onClick={() => setEditingItem(null)}
                        >
                          <X size={15} />
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => setEditingItem({ ...item })}
                        >
                          <Edit3 size={15} />
                          Editar
                        </button>

                        <button
                          type="button"
                          className={`btn-sm ${
                            item.ativo ? "parametros-btn-warning" : ""
                          }`}
                          onClick={() =>
                            desativarParametro(activeTab, item.id, !item.ativo)
                          }
                        >
                          {item.ativo ? <EyeOff size={15} /> : <Eye size={15} />}
                          {item.ativo ? "Desativar" : "Ativar"}
                        </button>

                        <button
                          type="button"
                          className="btn-sm parametros-btn-danger"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 size={15} />
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-card parametros-delete-modal">
            <span className="badge badge-danger">
              <Trash2 size={14} />
              Exclusão de parâmetro
            </span>

            <h3>Excluir parâmetro?</h3>

            <p>
              Você está prestes a excluir{" "}
              <strong>{deleteTarget.nome}</strong>. Use esta ação apenas se o
              parâmetro ainda não estiver vinculado a registros do sistema.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="confirm-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="parametros-btn-danger"
                onClick={handleConfirmDelete}
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
