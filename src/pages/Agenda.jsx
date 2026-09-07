import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { CalendarDays, CheckCircle2, Filter, Plus, Search } from "lucide-react";
import ActionMenu from "../components/ActionMenu";
import { useConfirmacao } from "../context/useConfirmacao";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { db } from "../firebase";
import {
  existeConflitoAgendamento,
  normalizarStatusAgendamento,
} from "../utils/agenda";
import { moedaBR } from "../utils/formatters";

const agendamentoInicial = {
  clienteId: "",
  servicoId: "",
  data: "",
  horaInicio: "",
  duracaoMinutos: "",
  status: "agendado",
  observacoes: "",
};

const PERFIS_ESCRITA_AGENDA = new Set(["administrador_empresa", "comercial"]);

const STATUS_AGENDA = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

const normalizarTexto = (valor) => String(valor || "").trim();
const normalizarBusca = (valor) =>
  normalizarTexto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizarStatusCadastro = (status = "ativo") =>
  String(status || "ativo").trim().toLowerCase() === "inativo" ? "inativo" : "ativo";

const formatarData = (valor) => {
  if (!valor) return "-";

  const data = new Date(`${valor}T00:00:00`);
  return Number.isNaN(data.getTime()) ? "-" : data.toLocaleDateString("pt-BR");
};

const formatarDuracao = (valor) => {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) && numero > 0 ? `${numero} min` : "-";
};

const getStatusLabel = (status) => {
  const statusNormalizado = normalizarStatusAgendamento(status);
  return STATUS_AGENDA.find((item) => item.value === statusNormalizado)?.label || "Agendado";
};

const getStatusBadgeClass = (status) => {
  const classes = {
    agendado: "badge-info",
    confirmado: "badge-purple",
    concluido: "badge-success",
    cancelado: "badge-danger",
  };

  return classes[normalizarStatusAgendamento(status)] || "badge-info";
};

const getClienteNome = (cliente = {}) => cliente.nome || cliente.clienteNome || "Cliente";

export default function Agenda() {
  const {
    empresaId,
    empresaOwnerUid,
    isAdminMaster,
    perfilEmpresaAtual,
    user,
  } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();

  const [agendamentos, setAgendamentos] = useState([]);
  const [clientesSnapshot, setClientesSnapshot] = useState({ chave: "", lista: [] });
  const [servicosSnapshot, setServicosSnapshot] = useState({ chave: "", lista: [] });
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [agendamentoEditando, setAgendamentoEditando] = useState(null);
  const [form, setForm] = useState(agendamentoInicial);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroData, setFiltroData] = useState("");

  const ownerUid = empresaOwnerUid || user?.uid || null;
  const podeEscreverAgenda =
    isAdminMaster || PERFIS_ESCRITA_AGENDA.has(perfilEmpresaAtual);
  const chaveDependencias =
    podeEscreverAgenda && ownerUid && empresaId ? `${ownerUid}/${empresaId}` : "";
  const clientes =
    clientesSnapshot.chave === chaveDependencias ? clientesSnapshot.lista : [];
  const servicos =
    servicosSnapshot.chave === chaveDependencias ? servicosSnapshot.lista : [];
  const carregandoDependencias = Boolean(
    chaveDependencias &&
      (clientesSnapshot.chave !== chaveDependencias ||
        servicosSnapshot.chave !== chaveDependencias)
  );

  const agendamentosRef = useMemo(() => {
    if (!user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "agendamentos");
  }, [empresaId, ownerUid, user]);

  const clientesRef = useMemo(() => {
    if (!podeEscreverAgenda || !user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "clientesComerciais");
  }, [empresaId, ownerUid, podeEscreverAgenda, user]);

  const servicosRef = useMemo(() => {
    if (!podeEscreverAgenda || !user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "servicos");
  }, [empresaId, ownerUid, podeEscreverAgenda, user]);

  useEffect(() => {
    if (!agendamentosRef) return undefined;

    const unsubscribe = onSnapshot(
      agendamentosRef,
      (snapshot) => {
        const lista = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        setAgendamentos(lista);
        setCarregando(false);
      },
      (error) => {
        console.error("Erro ao carregar agendamentos:", error);
        showToast("Não foi possível carregar a agenda.", "error");
        setAgendamentos([]);
        setCarregando(false);
      }
    );

    return () => unsubscribe();
  }, [agendamentosRef, showToast]);

  useEffect(() => {
    if (!clientesRef || !chaveDependencias) return undefined;

    const unsubscribe = onSnapshot(
      clientesRef,
      (snapshot) => {
        const lista = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .filter((cliente) => cliente.ativo !== false)
          .sort((a, b) =>
            getClienteNome(a).localeCompare(getClienteNome(b), "pt-BR", {
              numeric: true,
              sensitivity: "base",
            })
          );

        setClientesSnapshot({ chave: chaveDependencias, lista });
      },
      (error) => {
        console.error("Erro ao carregar clientes da agenda:", error);
        showToast("Não foi possível carregar os clientes.", "error");
        setClientesSnapshot({ chave: chaveDependencias, lista: [] });
      }
    );

    return () => unsubscribe();
  }, [chaveDependencias, clientesRef, showToast]);

  useEffect(() => {
    if (!servicosRef || !chaveDependencias) return undefined;

    const unsubscribe = onSnapshot(
      servicosRef,
      (snapshot) => {
        const lista = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .filter((servico) => normalizarStatusCadastro(servico.status) === "ativo")
          .sort((a, b) =>
            String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
              numeric: true,
              sensitivity: "base",
            })
          );

        setServicosSnapshot({ chave: chaveDependencias, lista });
      },
      (error) => {
        console.error("Erro ao carregar serviços da agenda:", error);
        showToast("Não foi possível carregar os serviços.", "error");
        setServicosSnapshot({ chave: chaveDependencias, lista: [] });
      }
    );

    return () => unsubscribe();
  }, [chaveDependencias, servicosRef, showToast]);

  const agendamentosOrdenados = useMemo(
    () =>
      [...agendamentos].sort((a, b) => {
        const dataA = `${a.data || "9999-12-31"} ${a.horaInicio || "23:59"}`;
        const dataB = `${b.data || "9999-12-31"} ${b.horaInicio || "23:59"}`;

        return dataA.localeCompare(dataB);
      }),
    [agendamentos]
  );

  const hojeISO = new Date().toISOString().split("T")[0];

  const resumo = useMemo(() => {
    const proximos = agendamentos.filter(
      (agendamento) =>
        normalizarStatusAgendamento(agendamento.status) !== "cancelado" &&
        String(agendamento.data || "") >= hojeISO
    ).length;

    return {
      hoje: agendamentos.filter(
        (agendamento) =>
          agendamento.data === hojeISO &&
          normalizarStatusAgendamento(agendamento.status) !== "cancelado"
      ).length,
      confirmados: agendamentos.filter(
        (agendamento) => normalizarStatusAgendamento(agendamento.status) === "confirmado"
      ).length,
      proximos,
      cancelados: agendamentos.filter(
        (agendamento) => normalizarStatusAgendamento(agendamento.status) === "cancelado"
      ).length,
    };
  }, [agendamentos, hojeISO]);

  const agendamentosFiltrados = useMemo(() => {
    const termo = normalizarBusca(busca);

    return agendamentosOrdenados.filter((agendamento) => {
      const status = normalizarStatusAgendamento(agendamento.status);
      const textoBusca = [
        agendamento.clienteNome,
        agendamento.clienteTelefone,
        agendamento.servicoNome,
        agendamento.observacoes,
      ]
        .map(normalizarBusca)
        .join(" ");

      if (termo && !textoBusca.includes(termo)) return false;
      if (filtroStatus !== "todos" && status !== filtroStatus) return false;
      if (filtroData && agendamento.data !== filtroData) return false;

      return true;
    });
  }, [agendamentosOrdenados, busca, filtroData, filtroStatus]);

  const atualizarCampo = (campo, valor) => {
    setForm((atual) => {
      if (campo !== "servicoId") {
        return {
          ...atual,
          [campo]: valor,
        };
      }

      const servico = servicos.find((item) => item.id === valor);

      return {
        ...atual,
        servicoId: valor,
        duracaoMinutos: servico?.tempoEstimadoMinutos || "",
      };
    });
  };

  const abrirNovoAgendamento = () => {
    if (!podeEscreverAgenda) {
      showToast("Você não tem permissão para criar agendamentos.", "warning");
      return;
    }

    setAgendamentoEditando(null);
    setForm(agendamentoInicial);
    setModalAberto(true);
  };

  const abrirEdicaoAgendamento = (agendamento) => {
    if (!podeEscreverAgenda) return;
    if (normalizarStatusAgendamento(agendamento.status) === "cancelado") return;

    setAgendamentoEditando(agendamento);
    setForm({
      clienteId: agendamento.clienteId || "",
      servicoId: agendamento.servicoId || "",
      data: agendamento.data || "",
      horaInicio: agendamento.horaInicio || "",
      duracaoMinutos: agendamento.duracaoMinutos || "",
      status: normalizarStatusAgendamento(agendamento.status),
      observacoes: agendamento.observacoes || "",
    });
    setModalAberto(true);
  };

  const fecharModal = () => {
    if (salvando) return;

    setModalAberto(false);
    setAgendamentoEditando(null);
    setForm(agendamentoInicial);
  };

  const montarPayloadAgendamento = () => {
    const cliente = clientes.find((item) => item.id === form.clienteId);
    const servico = servicos.find((item) => item.id === form.servicoId);

    if (!cliente || !servico) return null;

    const duracaoMinutos = Number(servico.tempoEstimadoMinutos || form.duracaoMinutos || 0);

    return {
      clienteId: cliente.id,
      clienteNome: getClienteNome(cliente),
      clienteTelefone: normalizarTexto(cliente.telefone),
      servicoId: servico.id,
      servicoNome: normalizarTexto(servico.nome),
      valorServico: Number(servico.valor || 0),
      duracaoMinutos,
      data: form.data,
      horaInicio: form.horaInicio,
      status: normalizarStatusAgendamento(form.status),
      observacoes: normalizarTexto(form.observacoes),
      atualizadoEm: serverTimestamp(),
    };
  };

  const salvarAgendamento = async () => {
    if (!agendamentosRef || !user || !empresaId) {
      showToast("Empresa ainda não carregou. Aguarde e tente novamente.", "warning");
      return;
    }

    if (!podeEscreverAgenda) {
      showToast("Você não tem permissão para salvar agendamentos.", "warning");
      return;
    }

    if (!form.clienteId || !form.servicoId || !form.data || !form.horaInicio) {
      showToast("Preencha os campos obrigatórios.", "warning");
      return;
    }

    const payload = montarPayloadAgendamento();

    if (
      !payload ||
      !Number.isInteger(payload.duracaoMinutos) ||
      payload.duracaoMinutos <= 0 ||
      !Number.isFinite(payload.valorServico) ||
      payload.valorServico < 0
    ) {
      showToast("Selecione um serviço ativo com valor e duração válidos.", "warning");
      return;
    }

    if (
      existeConflitoAgendamento(payload, agendamentos, {
        ignorarId: agendamentoEditando?.id || "",
      })
    ) {
      showToast("Já existe um agendamento nesse horário.", "warning");
      return;
    }

    setSalvando(true);

    try {
      if (agendamentoEditando?.id) {
        await updateDoc(doc(agendamentosRef, agendamentoEditando.id), payload);
        showToast("Alterações salvas com sucesso.", "success");
      } else {
        await addDoc(agendamentosRef, {
          ...payload,
          criadoEm: serverTimestamp(),
          criadoPor: user.uid,
        });
        showToast("Cadastro realizado com sucesso.", "success");
      }

      fecharModal();
    } catch (error) {
      console.error("Erro ao salvar agendamento:", error);
      showToast("Não foi possível salvar. Tente novamente.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const atualizarStatusAgendamento = async (agendamento, status) => {
    if (!podeEscreverAgenda || !agendamentosRef || !agendamento?.id) return;

    const statusNormalizado = normalizarStatusAgendamento(status);

    if (statusNormalizado === "cancelado") {
      const confirmado = await confirmar(
        `Deseja cancelar o agendamento de ${agendamento.clienteNome || "cliente"}?`
      );

      if (!confirmado) return;
    }

    try {
      await updateDoc(doc(agendamentosRef, agendamento.id), {
        status: statusNormalizado,
        atualizadoEm: serverTimestamp(),
      });

      showToast(
        statusNormalizado === "cancelado"
          ? "Agendamento cancelado com sucesso."
          : "Alterações salvas com sucesso.",
        "success"
      );
    } catch (error) {
      console.error("Erro ao atualizar status do agendamento:", error);
      showToast("Não foi possível concluir a operação.", "error");
    }
  };

  return (
    <div className="page fornecedores-page agenda-page">
      <div className="page-header fornecedores-header">
        <div>
          <span className="badge badge-info fornecedores-eyebrow">
            <CalendarDays size={14} />
            Prestação de Serviços
          </span>
          <h1 className="page-title">Agenda</h1>
          <p className="page-subtitle">
            Organize os serviços agendados da empresa.
          </p>
        </div>

        {podeEscreverAgenda && (
          <button type="button" onClick={abrirNovoAgendamento}>
            <Plus size={18} />
            Novo agendamento
          </button>
        )}
      </div>

      <div className="summary-grid fornecedores-summary">
        <div className="card metric-card metric-blue">
          <p>Agendamentos de hoje</p>
          <h2>{resumo.hoje}</h2>
          <small>Agenda do dia</small>
        </div>

        <div className="card metric-card metric-purple">
          <p>Confirmados</p>
          <h2>{resumo.confirmados}</h2>
          <small>Clientes confirmados</small>
        </div>

        <div className="card metric-card metric-green">
          <p>Próximos agendamentos</p>
          <h2>{resumo.proximos}</h2>
          <small>Hoje ou datas futuras</small>
        </div>

        <div className="card metric-card metric-red">
          <p>Cancelados</p>
          <h2>{resumo.cancelados}</h2>
          <small>Histórico preservado</small>
        </div>
      </div>

      <section className="card fornecedores-card">
        <div className="fornecedores-card-header">
          <div className="fornecedores-title-block">
            <span className="fornecedores-main-icon">
              <CheckCircle2 size={22} />
            </span>

            <div>
              <span className="badge badge-purple">Agenda</span>
              <h3>Agendamentos</h3>
              <p>Lista operacional de serviços agendados por data e horário.</p>
            </div>
          </div>
        </div>

        <div className="fornecedores-toolbar">
          <label className="fornecedores-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Buscar por cliente, telefone, serviço ou observação..."
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
              {STATUS_AGENDA.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label className="fornecedores-filter">
            <CalendarDays size={17} />
            <input
              type="date"
              value={filtroData}
              onChange={(event) => setFiltroData(event.target.value)}
            />
          </label>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando agenda...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Duração</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {agendamentosFiltrados.map((agendamento) => {
                  const status = normalizarStatusAgendamento(agendamento.status);
                  const podeEditar = podeEscreverAgenda && status !== "cancelado";

                  return (
                    <tr
                      key={agendamento.id}
                      className={podeEditar ? "agenda-table-row" : undefined}
                      onDoubleClick={() => abrirEdicaoAgendamento(agendamento)}
                    >
                      <td>{formatarData(agendamento.data)}</td>
                      <td>{agendamento.horaInicio || "-"}</td>
                      <td>
                        <div className="fornecedores-cell-main">
                          <strong>{agendamento.clienteNome || "-"}</strong>
                          <small>{agendamento.clienteTelefone || "Telefone não informado"}</small>
                        </div>
                      </td>
                      <td>{agendamento.servicoNome || "-"}</td>
                      <td>{formatarDuracao(agendamento.duracaoMinutos)}</td>
                      <td>{moedaBR(agendamento.valorServico || 0)}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(status)}`}>
                          {getStatusLabel(status)}
                        </span>
                      </td>
                      <td onDoubleClick={(event) => event.stopPropagation()}>
                        {podeEditar ? (
                          <ActionMenu
                            label="Abrir ações do agendamento"
                            items={[
                              {
                                label: "Editar agendamento",
                                onClick: () => abrirEdicaoAgendamento(agendamento),
                              },
                              status !== "confirmado" && {
                                label: "Marcar como confirmado",
                                onClick: () =>
                                  atualizarStatusAgendamento(agendamento, "confirmado"),
                              },
                              status !== "concluido" && {
                                label: "Marcar como concluído",
                                onClick: () =>
                                  atualizarStatusAgendamento(agendamento, "concluido"),
                              },
                              {
                                label: "Cancelar agendamento",
                                danger: true,
                                onClick: () =>
                                  atualizarStatusAgendamento(agendamento, "cancelado"),
                              },
                            ].filter(Boolean)}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}

                {agendamentosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan="8">Nenhum agendamento encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalAberto && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={fecharModal}
        >
          <div
            className="modal-card fornecedores-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="fornecedores-modal-header">
              <div>
                <span className="badge badge-info">
                  <CalendarDays size={14} />
                  {agendamentoEditando ? "Editar agenda" : "Novo agendamento"}
                </span>
                <h3>{agendamentoEditando ? "Editar agendamento" : "Novo agendamento"}</h3>
                <p>Cliente, serviço, data e horário do atendimento agendado.</p>
              </div>
            </div>

            <div className="fornecedores-form-grid">
              <label>
                Cliente *
                <select
                  value={form.clienteId}
                  onChange={(event) => atualizarCampo("clienteId", event.target.value)}
                  disabled={carregandoDependencias}
                >
                  <option value="">Selecione</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {getClienteNome(cliente)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Serviço *
                <select
                  value={form.servicoId}
                  onChange={(event) => atualizarCampo("servicoId", event.target.value)}
                >
                  <option value="">Selecione</option>
                  {servicos.map((servico) => (
                    <option key={servico.id} value={servico.id}>
                      {servico.nome || "Serviço"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Data *
                <input
                  type="date"
                  value={form.data}
                  onChange={(event) => atualizarCampo("data", event.target.value)}
                />
              </label>

              <label>
                Hora inicial *
                <input
                  type="time"
                  value={form.horaInicio}
                  onChange={(event) => atualizarCampo("horaInicio", event.target.value)}
                />
              </label>

              <label>
                Duração
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.duracaoMinutos}
                  readOnly
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) => atualizarCampo("status", event.target.value)}
                >
                  {STATUS_AGENDA.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fornecedores-form-wide">
                Observações
                <textarea
                  value={form.observacoes}
                  onChange={(event) => atualizarCampo("observacoes", event.target.value)}
                  placeholder="Informações importantes para o atendimento"
                  rows={4}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="confirm-secondary" onClick={fecharModal}>
                Cancelar
              </button>
              <button type="button" onClick={salvarAgendamento} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar agendamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
