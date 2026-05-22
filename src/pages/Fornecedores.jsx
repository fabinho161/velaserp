import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Building2, Filter, Plus, Search, Truck, Users } from "lucide-react";
import ActionMenu from "../components/ActionMenu";
import { useConfirmacao } from "../context/useConfirmacao";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { db } from "../firebase";

const fornecedorInicial = {
  nomeFantasia: "",
  razaoSocial: "",
  documento: "",
  telefone: "",
  email: "",
  cidade: "",
  estado: "",
  endereco: "",
  tipoFornecedor: "",
  observacoes: "",
  status: "ativo",
};

const tiposFornecedor = [
  "Materia-prima",
  "Embalagens",
  "Insumos operacionais",
  "Servicos",
  "Outros",
];

const normalizarTexto = (valor) => String(valor || "").trim();
const normalizarBusca = (valor) => normalizarTexto(valor).toLowerCase();
const normalizarStatus = (status = "ativo") =>
  String(status || "ativo").trim().toLowerCase();

const formatarDataSistema = (valor) => {
  if (!valor) return "-";
  if (valor?.toDate) return valor.toDate().toLocaleDateString("pt-BR");
  if (valor instanceof Date) return valor.toLocaleDateString("pt-BR");

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "-" : data.toLocaleDateString("pt-BR");
};

const getStatusBadgeClass = (status) =>
  normalizarStatus(status) === "ativo" ? "badge-success" : "badge-danger";

const getStatusLabel = (status) =>
  normalizarStatus(status) === "ativo" ? "Ativo" : "Inativo";

export default function Fornecedores() {
  const { user, empresaId, empresaOwnerUid } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();

  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [fornecedorEditando, setFornecedorEditando] = useState(null);
  const [form, setForm] = useState(fornecedorInicial);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const ownerUid = empresaOwnerUid || user?.uid || null;

  const fornecedoresRef = useMemo(() => {
    if (!user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "fornecedores");
  }, [empresaId, ownerUid, user]);

  useEffect(() => {
    if (!fornecedoresRef) {
      return undefined;
    }

    const unsubscribe = onSnapshot(
      fornecedoresRef,
      (snapshot) => {
        const lista = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) =>
            String(a.nomeFantasia || a.razaoSocial || "").localeCompare(
              String(b.nomeFantasia || b.razaoSocial || ""),
              "pt-BR",
              { numeric: true, sensitivity: "base" }
            )
          );

        setFornecedores(lista);
        setCarregando(false);
      },
      (error) => {
        console.error("Erro ao carregar fornecedores:", error);
        showToast("Nao foi possivel carregar fornecedores.", "error");
        setFornecedores([]);
        setCarregando(false);
      }
    );

    return () => unsubscribe();
  }, [fornecedoresRef, showToast]);

  const fornecedoresFiltrados = useMemo(() => {
    const termo = normalizarBusca(busca);

    return fornecedores.filter((fornecedor) => {
      const status = normalizarStatus(fornecedor.status);
      const confereStatus = filtroStatus === "todos" || status === filtroStatus;
      const textoBusca = [
        fornecedor.nomeFantasia,
        fornecedor.razaoSocial,
        fornecedor.documento,
        fornecedor.cidade,
        fornecedor.telefone,
      ]
        .map(normalizarBusca)
        .join(" ");

      return confereStatus && (!termo || textoBusca.includes(termo));
    });
  }, [busca, filtroStatus, fornecedores]);

  const totalFornecedores = fornecedores.length;
  const fornecedoresAtivos = fornecedores.filter(
    (fornecedor) => normalizarStatus(fornecedor.status) === "ativo"
  ).length;
  const fornecedoresInativos = fornecedores.filter(
    (fornecedor) => normalizarStatus(fornecedor.status) === "inativo"
  ).length;

  const abrirNovoFornecedor = () => {
    setFornecedorEditando(null);
    setForm(fornecedorInicial);
    setModalAberto(true);
  };

  const abrirEdicaoFornecedor = (fornecedor) => {
    setFornecedorEditando(fornecedor);
    setForm({
      nomeFantasia: fornecedor.nomeFantasia || "",
      razaoSocial: fornecedor.razaoSocial || "",
      documento: fornecedor.documento || "",
      telefone: fornecedor.telefone || "",
      email: fornecedor.email || "",
      cidade: fornecedor.cidade || "",
      estado: fornecedor.estado || "",
      endereco: fornecedor.endereco || "",
      tipoFornecedor: fornecedor.tipoFornecedor || "",
      observacoes: fornecedor.observacoes || "",
      status: normalizarStatus(fornecedor.status),
    });
    setModalAberto(true);
  };

  const fecharModal = () => {
    if (salvando) return;
    setModalAberto(false);
    setFornecedorEditando(null);
    setForm(fornecedorInicial);
  };

  const atualizarCampo = (campo, valor) => {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  };

  const montarPayloadFornecedor = () => ({
    nomeFantasia: normalizarTexto(form.nomeFantasia),
    razaoSocial: normalizarTexto(form.razaoSocial),
    documento: normalizarTexto(form.documento),
    telefone: normalizarTexto(form.telefone),
    email: normalizarTexto(form.email).toLowerCase(),
    cidade: normalizarTexto(form.cidade),
    estado: normalizarTexto(form.estado).toUpperCase(),
    endereco: normalizarTexto(form.endereco),
    tipoFornecedor: normalizarTexto(form.tipoFornecedor),
    observacoes: normalizarTexto(form.observacoes),
    status: normalizarStatus(form.status),
    atualizadoEm: serverTimestamp(),
  });

  const salvarFornecedor = async () => {
    if (!fornecedoresRef || !user || !empresaId) {
      showToast("Empresa ainda nao carregou. Aguarde e tente novamente.", "warning");
      return;
    }

    if (!normalizarTexto(form.nomeFantasia) && !normalizarTexto(form.razaoSocial)) {
      showToast("Informe o nome fantasia ou a razao social do fornecedor.", "warning");
      return;
    }

    setSalvando(true);

    try {
      const payload = montarPayloadFornecedor();

      if (fornecedorEditando?.id) {
        await updateDoc(doc(fornecedoresRef, fornecedorEditando.id), payload);
        showToast("Fornecedor atualizado com sucesso.", "success");
      } else {
        await addDoc(fornecedoresRef, {
          ...payload,
          criadoEm: serverTimestamp(),
        });
        showToast("Fornecedor cadastrado com sucesso.", "success");
      }

      fecharModal();
    } catch (error) {
      console.error("Erro ao salvar fornecedor:", error);
      showToast("Nao foi possivel salvar o fornecedor.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusFornecedor = async (fornecedor) => {
    if (!fornecedoresRef || !fornecedor?.id) return;

    const statusAtual = normalizarStatus(fornecedor.status);
    const proximoStatus = statusAtual === "ativo" ? "inativo" : "ativo";
    const confirmado = await confirmar(
      `Deseja marcar ${fornecedor.nomeFantasia || fornecedor.razaoSocial} como ${getStatusLabel(proximoStatus)}?`
    );

    if (!confirmado) return;

    try {
      await updateDoc(doc(fornecedoresRef, fornecedor.id), {
        status: proximoStatus,
        atualizadoEm: serverTimestamp(),
      });
      showToast("Status do fornecedor atualizado com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao alterar status do fornecedor:", error);
      showToast("Nao foi possivel alterar o status do fornecedor.", "error");
    }
  };

  return (
    <div className="fornecedores-page">
      <div className="page-header fornecedores-header">
        <div>
          <span className="badge badge-info fornecedores-eyebrow">
            <Truck size={14} />
            Gestao de compras
          </span>
          <h1 className="page-title">Fornecedores</h1>
          <p className="page-subtitle">
            Cadastre e acompanhe fornecedores de materia-prima e insumos da
            empresa ativa.
          </p>
        </div>

        <button type="button" onClick={abrirNovoFornecedor}>
          <Plus size={18} />
          Novo fornecedor
        </button>
      </div>

      <div className="summary-grid fornecedores-summary">
        <div className="card metric-card metric-blue">
          <p>Fornecedores cadastrados</p>
          <h2>{totalFornecedores}</h2>
          <small>Empresa ativa</small>
        </div>

        <div className="card metric-card metric-green">
          <p>Fornecedores ativos</p>
          <h2>{fornecedoresAtivos}</h2>
          <small>Disponiveis para operacao</small>
        </div>

        <div className="card metric-card metric-amber">
          <p>Fornecedores inativos</p>
          <h2>{fornecedoresInativos}</h2>
          <small>Ocultos de novos processos</small>
        </div>
      </div>

      <section className="card fornecedores-card">
        <div className="fornecedores-card-header">
          <div className="fornecedores-title-block">
            <span className="fornecedores-main-icon">
              <Building2 size={22} />
            </span>

            <div>
              <span className="badge badge-purple">Fornecedores</span>
              <h3>Cadastro da empresa</h3>
              <p>Dados basicos para preparar compras e historicos futuros.</p>
            </div>
          </div>
        </div>

        <div className="fornecedores-toolbar">
          <label className="fornecedores-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Buscar por nome, documento, cidade ou telefone..."
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
          </label>

          <label className="fornecedores-filter">
            <Filter size={17} />
            <select
              value={filtroStatus}
              onChange={(event) => setFiltroStatus(event.target.value)}
            >
              <option value="todos">Todos os status</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
          </label>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando fornecedores...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Documento</th>
                  <th>Contato</th>
                  <th>Cidade/UF</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Atualizado em</th>
                  <th>Acoes</th>
                </tr>
              </thead>

              <tbody>
                {fornecedoresFiltrados.map((fornecedor) => (
                  <tr key={fornecedor.id}>
                    <td>
                      <div className="fornecedores-cell-main">
                        <strong>
                          {fornecedor.nomeFantasia ||
                            fornecedor.razaoSocial ||
                            "Fornecedor sem nome"}
                        </strong>
                        <small>{fornecedor.razaoSocial || "Razao social nao informada"}</small>
                      </div>
                    </td>
                    <td>{fornecedor.documento || "-"}</td>
                    <td>
                      <div className="fornecedores-cell-main">
                        <span>{fornecedor.telefone || "-"}</span>
                        <small>{fornecedor.email || "E-mail nao informado"}</small>
                      </div>
                    </td>
                    <td>
                      {[fornecedor.cidade, fornecedor.estado].filter(Boolean).join(" / ") || "-"}
                    </td>
                    <td>{fornecedor.tipoFornecedor || "-"}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(fornecedor.status)}`}>
                        {getStatusLabel(fornecedor.status)}
                      </span>
                    </td>
                    <td>{formatarDataSistema(fornecedor.atualizadoEm || fornecedor.criadoEm)}</td>
                    <td>
                      <ActionMenu
                        label="Abrir acoes do fornecedor"
                        items={[
                          {
                            label: "Editar fornecedor",
                            onClick: () => abrirEdicaoFornecedor(fornecedor),
                          },
                          {
                            label:
                              normalizarStatus(fornecedor.status) === "ativo"
                                ? "Inativar fornecedor"
                                : "Ativar fornecedor",
                            danger: normalizarStatus(fornecedor.status) === "ativo",
                            onClick: () => alternarStatusFornecedor(fornecedor),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}

                {fornecedoresFiltrados.length === 0 && (
                  <tr>
                    <td colSpan="8">Nenhum fornecedor encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalAberto && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card fornecedores-modal">
            <div className="fornecedores-modal-header">
              <div>
                <span className="badge badge-info">
                  <Users size={14} />
                  {fornecedorEditando ? "Editar cadastro" : "Novo cadastro"}
                </span>
                <h3>{fornecedorEditando ? "Editar fornecedor" : "Novo fornecedor"}</h3>
                <p>Dados cadastrais simples para uso futuro em compras.</p>
              </div>
            </div>

            <div className="fornecedores-form-grid">
              <label>
                Nome fantasia
                <input
                  value={form.nomeFantasia}
                  onChange={(event) => atualizarCampo("nomeFantasia", event.target.value)}
                  placeholder="Ex: Casa das Essencias"
                />
              </label>

              <label>
                Razao social
                <input
                  value={form.razaoSocial}
                  onChange={(event) => atualizarCampo("razaoSocial", event.target.value)}
                  placeholder="Razao social completa"
                />
              </label>

              <label>
                Documento
                <input
                  value={form.documento}
                  onChange={(event) => atualizarCampo("documento", event.target.value)}
                  placeholder="CNPJ ou CPF"
                />
              </label>

              <label>
                Telefone
                <input
                  value={form.telefone}
                  onChange={(event) => atualizarCampo("telefone", event.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </label>

              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => atualizarCampo("email", event.target.value)}
                  placeholder="contato@fornecedor.com"
                />
              </label>

              <label>
                Tipo de fornecedor
                <select
                  value={form.tipoFornecedor}
                  onChange={(event) => atualizarCampo("tipoFornecedor", event.target.value)}
                >
                  <option value="">Selecione</option>
                  {tiposFornecedor.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cidade
                <input
                  value={form.cidade}
                  onChange={(event) => atualizarCampo("cidade", event.target.value)}
                  placeholder="Cidade"
                />
              </label>

              <label>
                Estado
                <input
                  value={form.estado}
                  onChange={(event) => atualizarCampo("estado", event.target.value)}
                  placeholder="UF"
                  maxLength={2}
                />
              </label>

              <label className="fornecedores-form-wide">
                Endereco
                <input
                  value={form.endereco}
                  onChange={(event) => atualizarCampo("endereco", event.target.value)}
                  placeholder="Rua, numero, bairro"
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) => atualizarCampo("status", event.target.value)}
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>

              <label className="fornecedores-form-wide">
                Observacoes
                <textarea
                  value={form.observacoes}
                  onChange={(event) => atualizarCampo("observacoes", event.target.value)}
                  placeholder="Informacoes comerciais, prazos, contatos ou observacoes internas"
                  rows={4}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="confirm-secondary" onClick={fecharModal}>
                Cancelar
              </button>
              <button type="button" onClick={salvarFornecedor} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar fornecedor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
