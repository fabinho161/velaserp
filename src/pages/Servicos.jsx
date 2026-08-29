import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Clock, Filter, Plus, Search, Wrench } from "lucide-react";
import ActionMenu from "../components/ActionMenu";
import { useConfirmacao } from "../context/useConfirmacao";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { db } from "../firebase";
import { moedaBR } from "../utils/formatters";

const servicoInicial = {
  nome: "",
  descricao: "",
  valor: "",
  tempoEstimadoMinutos: "",
  status: "ativo",
};

const PERFIS_ESCRITA_SERVICOS = new Set([
  "administrador_empresa",
  "comercial",
  "producao",
]);

const normalizarTexto = (valor) => String(valor || "").trim();
const normalizarBusca = (valor) => normalizarTexto(valor).toLowerCase();
const normalizarStatus = (status = "ativo") =>
  String(status || "ativo").trim().toLowerCase() === "inativo" ? "inativo" : "ativo";

const formatarTempo = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return "-";

  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 ? `${numero} min` : "-";
};

const getStatusBadgeClass = (status) =>
  normalizarStatus(status) === "ativo" ? "badge-success" : "badge-danger";

const getStatusLabel = (status) =>
  normalizarStatus(status) === "ativo" ? "Ativo" : "Inativo";

export default function Servicos() {
  const {
    empresaId,
    empresaOwnerUid,
    isAdminMaster,
    perfilEmpresaAtual,
    user,
  } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();

  const [servicos, setServicos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [servicoEditando, setServicoEditando] = useState(null);
  const [form, setForm] = useState(servicoInicial);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const ownerUid = empresaOwnerUid || user?.uid || null;
  const podeEscreverServicos =
    isAdminMaster || PERFIS_ESCRITA_SERVICOS.has(perfilEmpresaAtual);

  const servicosRef = useMemo(() => {
    if (!user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "servicos");
  }, [empresaId, ownerUid, user]);

  useEffect(() => {
    if (!servicosRef) {
      return undefined;
    }

    const unsubscribe = onSnapshot(
      servicosRef,
      (snapshot) => {
        const lista = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) =>
            String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
              numeric: true,
              sensitivity: "base",
            })
          );

        setServicos(lista);
        setCarregando(false);
      },
      (error) => {
        console.error("Erro ao carregar servicos:", error);
        showToast("Nao foi possivel carregar servicos.", "error");
        setServicos([]);
        setCarregando(false);
      }
    );

    return () => unsubscribe();
  }, [servicosRef, showToast]);

  const servicosFiltrados = useMemo(() => {
    const termo = normalizarBusca(busca);

    return servicos.filter((servico) => {
      const status = normalizarStatus(servico.status);
      const confereStatus = filtroStatus === "todos" || status === filtroStatus;
      const texto = [servico.nome, servico.descricao].map(normalizarBusca).join(" ");

      return confereStatus && (!termo || texto.includes(termo));
    });
  }, [busca, filtroStatus, servicos]);

  const totalServicos = servicos.length;
  const servicosAtivos = servicos.filter(
    (servico) => normalizarStatus(servico.status) === "ativo"
  ).length;
  const servicosInativos = totalServicos - servicosAtivos;

  const abrirNovoServico = () => {
    if (!podeEscreverServicos) {
      showToast("Voce nao tem permissao para cadastrar servicos.", "warning");
      return;
    }

    setServicoEditando(null);
    setForm(servicoInicial);
    setModalAberto(true);
  };

  const abrirEdicaoServico = (servico) => {
    if (!podeEscreverServicos) return;

    setServicoEditando(servico);
    setForm({
      nome: servico.nome || "",
      descricao: servico.descricao || "",
      valor: servico.valor ?? "",
      tempoEstimadoMinutos: servico.tempoEstimadoMinutos ?? "",
      status: normalizarStatus(servico.status),
    });
    setModalAberto(true);
  };

  const fecharModal = () => {
    if (salvando) return;
    setModalAberto(false);
    setServicoEditando(null);
    setForm(servicoInicial);
  };

  const atualizarCampo = (campo, valor) => {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  };

  const montarPayloadServico = () => {
    const tempoTratado = normalizarTexto(form.tempoEstimadoMinutos);

    return {
      nome: normalizarTexto(form.nome),
      descricao: normalizarTexto(form.descricao),
      valor: Number(form.valor),
      tempoEstimadoMinutos: tempoTratado ? Number(tempoTratado) : "",
      status: normalizarStatus(form.status),
      atualizadoEm: serverTimestamp(),
    };
  };

  const salvarServico = async () => {
    if (!servicosRef || !user || !empresaId) {
      showToast("Empresa ainda nao carregou. Aguarde e tente novamente.", "warning");
      return;
    }

    if (!podeEscreverServicos) {
      showToast("Voce nao tem permissao para salvar servicos.", "warning");
      return;
    }

    if (!normalizarTexto(form.nome)) {
      showToast("Informe o nome do servico.", "warning");
      return;
    }

    const valorTratado = normalizarTexto(form.valor);
    const valorNumero = Number(valorTratado);

    if (!valorTratado || !Number.isFinite(valorNumero) || valorNumero < 0) {
      showToast("Informe um valor numerico maior ou igual a zero.", "warning");
      return;
    }

    const tempoTratado = normalizarTexto(form.tempoEstimadoMinutos);
    const tempoNumero = Number(tempoTratado);

    if (
      tempoTratado &&
      (!Number.isInteger(tempoNumero) || tempoNumero < 0)
    ) {
      showToast("Informe um tempo estimado inteiro maior ou igual a zero.", "warning");
      return;
    }

    setSalvando(true);

    try {
      const payload = montarPayloadServico();

      if (servicoEditando?.id) {
        await updateDoc(doc(servicosRef, servicoEditando.id), payload);
        showToast("Servico atualizado com sucesso.", "success");
      } else {
        await addDoc(servicosRef, {
          ...payload,
          status: "ativo",
          criadoEm: serverTimestamp(),
        });
        showToast("Servico cadastrado com sucesso.", "success");
      }

      fecharModal();
    } catch (error) {
      console.error("Erro ao salvar servico:", error);
      showToast("Nao foi possivel salvar o servico.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusServico = async (servico) => {
    if (!podeEscreverServicos || !servicosRef || !servico?.id) return;

    const statusAtual = normalizarStatus(servico.status);
    const proximoStatus = statusAtual === "ativo" ? "inativo" : "ativo";
    const confirmado = await confirmar(
      `Deseja marcar ${servico.nome || "este servico"} como ${getStatusLabel(proximoStatus)}?`
    );

    if (!confirmado) return;

    try {
      await updateDoc(doc(servicosRef, servico.id), {
        status: proximoStatus,
        atualizadoEm: serverTimestamp(),
      });
      showToast("Status do servico atualizado com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao alterar status do servico:", error);
      showToast("Nao foi possivel alterar o status do servico.", "error");
    }
  };

  return (
    <div className="page fornecedores-page">
      <div className="page-header">
        <div>
          <span className="badge badge-info fornecedores-eyebrow">
            <Wrench size={14} />
            Oficina
          </span>
          <h1 className="page-title">Servicos</h1>
          <p className="page-subtitle">
            Cadastre a mao de obra que sera usada nas ordens de servico futuras.
          </p>
        </div>

        {podeEscreverServicos && (
          <button type="button" onClick={abrirNovoServico}>
            <Plus size={18} />
            Novo servico
          </button>
        )}
      </div>

      <div className="summary-grid fornecedores-summary">
        <div className="card metric-card metric-blue">
          <p>Servicos cadastrados</p>
          <h2>{totalServicos}</h2>
          <small>Catalogo da oficina</small>
        </div>

        <div className="card metric-card metric-green">
          <p>Servicos ativos</p>
          <h2>{servicosAtivos}</h2>
          <small>Disponiveis para uso futuro</small>
        </div>

        <div className="card metric-card metric-amber">
          <p>Servicos inativos</p>
          <h2>{servicosInativos}</h2>
          <small>Preservados no catalogo</small>
        </div>
      </div>

      <section className="card fornecedores-card">
        <div className="fornecedores-card-header">
          <div className="fornecedores-title-block">
            <span className="fornecedores-main-icon">
              <Clock size={22} />
            </span>

            <div>
              <span className="badge badge-purple">Servicos</span>
              <h3>Catalogo de mao de obra</h3>
              <p>Valores e tempos estimados para rotinas da oficina.</p>
            </div>
          </div>
        </div>

        <div className="fornecedores-toolbar">
          <label className="fornecedores-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Buscar por nome ou descricao..."
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
          <div className="empty-state">Carregando servicos...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Servico</th>
                  <th>Valor</th>
                  <th>Tempo estimado</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>

              <tbody>
                {servicosFiltrados.map((servico) => (
                  <tr key={servico.id}>
                    <td>
                      <div className="fornecedores-cell-main">
                        <strong>{servico.nome || "-"}</strong>
                        <small>{servico.descricao || "Descricao nao informada"}</small>
                      </div>
                    </td>
                    <td>{moedaBR(servico.valor)}</td>
                    <td>{formatarTempo(servico.tempoEstimadoMinutos)}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(servico.status)}`}>
                        {getStatusLabel(servico.status)}
                      </span>
                    </td>
                    <td>
                      {podeEscreverServicos ? (
                        <ActionMenu
                          label="Abrir acoes do servico"
                          items={[
                            {
                              label: "Editar servico",
                              onClick: () => abrirEdicaoServico(servico),
                            },
                            {
                              label:
                                normalizarStatus(servico.status) === "ativo"
                                  ? "Inativar servico"
                                  : "Ativar servico",
                              danger: normalizarStatus(servico.status) === "ativo",
                              onClick: () => alternarStatusServico(servico),
                            },
                          ]}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}

                {servicosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan="5">Nenhum servico encontrado.</td>
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
                  <Wrench size={14} />
                  {servicoEditando ? "Editar cadastro" : "Novo cadastro"}
                </span>
                <h3>{servicoEditando ? "Editar servico" : "Novo servico"}</h3>
                <p>Dados basicos para compor ordens de servico futuras.</p>
              </div>
            </div>

            <div className="fornecedores-form-grid">
              <label>
                Nome do servico *
                <input
                  value={form.nome}
                  onChange={(event) => atualizarCampo("nome", event.target.value)}
                  placeholder="Ex: Troca de oleo"
                />
              </label>

              <label>
                Valor *
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor}
                  onChange={(event) => atualizarCampo("valor", event.target.value)}
                  placeholder="0,00"
                />
              </label>

              <label>
                Tempo estimado (minutos)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.tempoEstimadoMinutos}
                  onChange={(event) =>
                    atualizarCampo("tempoEstimadoMinutos", event.target.value)
                  }
                  placeholder="60"
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
                Descricao
                <textarea
                  value={form.descricao}
                  onChange={(event) => atualizarCampo("descricao", event.target.value)}
                  placeholder="Observacoes sobre o servico"
                  rows={4}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="confirm-secondary" onClick={fecharModal}>
                Cancelar
              </button>
              <button type="button" onClick={salvarServico} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar servico"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
