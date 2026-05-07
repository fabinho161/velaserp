import React, { useMemo, useState } from "react";
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

const grupos = {
  unidadesMedida: {
    titulo: "Unidades de Medida",
    descricao: "Defina as unidades usadas em insumos, estoque e produção.",
    icone: SlidersHorizontal,
  },
  tiposProduto: {
    titulo: "Tipos de Produto",
    descricao: "Organize os tipos usados no cadastro de produtos e ficha técnica.",
    icone: Tag,
  },
  categoriasDespesa: {
    titulo: "Categorias de Despesa",
    descricao: "Padronize as categorias utilizadas no financeiro.",
    icone: Settings2,
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

  const listas = {
    unidadesMedida,
    tiposProduto,
    categoriasDespesa,
  };

  const itensAtuais = listas[activeTab] || [];
  const grupoAtual = grupos[activeTab];
  const IconeGrupo = grupoAtual.icone;

  const itensFiltrados = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();

    return itensAtuais
      .filter((item) => item?.nome?.toLowerCase().includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [itensAtuais, searchTerm]);

  const totalAtivos = itensAtuais.filter((item) => item.ativo).length;
  const totalInativos = itensAtuais.length - totalAtivos;

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
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <Settings2 size={14} />
                Configurações operacionais
              </div>

              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                Parâmetros da Empresa
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Personalize listas utilizadas no ERP por empresa. Cada empresa
                mantém suas próprias unidades, tipos de produto e categorias.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-80">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xl font-bold text-slate-900">{itensAtuais.length}</p>
                <p className="text-xs text-slate-500">Total</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xl font-bold text-emerald-700">{totalAtivos}</p>
                <p className="text-xs text-emerald-700">Ativos</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xl font-bold text-slate-600">{totalInativos}</p>
                <p className="text-xs text-slate-500">Inativos</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(grupos).map(([key, grupo]) => {
            const Icone = grupo.icone;
            const ativo = activeTab === key;
            const total = listas[key]?.length || 0;

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveTab(key);
                  setSearchTerm("");
                  setNewItemName("");
                  setEditingItem(null);
                }}
                className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                  ativo
                    ? "border-blue-600 bg-blue-600 text-white shadow-blue-100"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-xl p-2 ${
                        ativo ? "bg-white/15" : "bg-slate-100"
                      }`}
                    >
                      <Icone size={20} />
                    </span>
                    <div>
                      <p className="font-semibold">{grupo.titulo}</p>
                      <p
                        className={`text-xs ${
                          ativo ? "text-blue-100" : "text-slate-500"
                        }`}
                      >
                        {total} parâmetro(s)
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <main className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                  <IconeGrupo size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {grupoAtual.titulo}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {grupoAtual.descricao}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    placeholder="Buscar parâmetro..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-64"
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Novo parâmetro..."
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddItem();
                    }}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-56"
                  />

                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    <Plus size={16} />
                    <span className="hidden sm:inline">Adicionar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {itensFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                  <Search size={22} />
                </div>
                <h3 className="text-base font-semibold text-slate-800">
                  Nenhum parâmetro encontrado
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {searchTerm
                    ? "Tente buscar por outro nome."
                    : "Comece adicionando o primeiro parâmetro deste grupo."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {itensFiltrados.map((item) => {
                  const editando = editingItem?.id === item.id;

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          {editando ? (
                            <input
                              type="text"
                              value={editingItem.nome}
                              onChange={(e) =>
                                setEditingItem({
                                  ...editingItem,
                                  nome: e.target.value,
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveEdit();
                                if (e.key === "Escape") setEditingItem(null);
                              }}
                              className="h-11 w-full rounded-xl border border-blue-300 bg-blue-50/40 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                              autoFocus
                            />
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-slate-900">
                                {item.nome}
                              </h3>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  item.ativo
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                    : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                                }`}
                              >
                                {item.ativo ? "Ativo" : "Inativo"}
                              </span>
                            </div>
                          )}

                          <p className="mt-1 text-xs text-slate-400">
                            ID: {item.id}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {editando ? (
                            <>
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                              >
                                <Check size={16} />
                                Salvar
                              </button>

                              <button
                                type="button"
                                onClick={() => setEditingItem(null)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                              >
                                <X size={16} />
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingItem({ ...item })}
                                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                              >
                                <Edit3 size={16} />
                                Editar
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  desativarParametro(activeTab, item.id, !item.ativo)
                                }
                                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                                  item.ativo
                                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                {item.ativo ? <EyeOff size={16} /> : <Eye size={16} />}
                                {item.ativo ? "Desativar" : "Ativar"}
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeleteTarget(item)}
                                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                              >
                                <Trash2 size={16} />
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 size={22} />
            </div>

            <h3 className="text-lg font-bold text-slate-900">
              Excluir parâmetro?
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Você está prestes a excluir{" "}
              <strong className="text-slate-800">{deleteTarget.nome}</strong>.
              Essa ação não deve ser usada se o parâmetro já estiver vinculado a
              registros antigos.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
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