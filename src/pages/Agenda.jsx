import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
} from "firebase/firestore";
import { CalendarDays, CheckCircle2, Filter, Plus, Search } from "lucide-react";
import ActionMenu from "../components/ActionMenu";
import { useConfirmacao } from "../context/useConfirmacao";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { db } from "../firebase";
import {
  criarAgendamento,
  editarAgendamento,
  excluirAgendamento,
  transicionarAgendamento,
} from "../services/agendaApi";
import { concluirAtendimento } from "../services/financeiroServicosApi";
import {
  calcularDuracaoAgendamento,
  calcularResumoAgenda,
  compararAgendamentosPorHorario,
  existeConflitoAgendamento,
  filtrarAgendamentoPorVisao,
  isAtendimentoAntigoEmAberto,
  normalizarStatusAgendamento,
  obterAcaoPrincipalAgenda,
  obterDataLocalISO,
  obterHoraFimAgendamento,
  montarPayloadAgendamento,
  podeEditarDadosAgendamento,
  podeTransicionarStatusAgendamento,
  sugerirHoraFim,
  transicoesPermitidasAgendamento,
} from "../utils/agenda";
import { moedaBR } from "../utils/formatters";

const agendamentoInicial = {
  clienteId: "",
  servicoId: "",
  data: "",
  horaInicio: "",
  horaFim: "",
  status: "agendado",
  observacoes: "",
};

const PERFIS_ESCRITA_AGENDA = new Set(["administrador_empresa", "comercial"]);

const STATUS_AGENDA = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_atendimento", label: "Em atendimento" },
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
  if (!Number.isFinite(numero) || numero <= 0) return "Não informada";
  const horas = Math.floor(numero / 60);
  const minutos = numero % 60;
  return horas ? `${horas}h${minutos ? String(minutos).padStart(2, "0") : ""}` : `${minutos} min`;
};

const getStatusLabel = (status) => {
  if (!status) return "Agendado";
  return STATUS_AGENDA.find((item) => item.value === status)?.label || "Status desconhecido";
};

const getStatusBadgeClass = (status) => {
  const classes = {
    agendado: "badge-info",
    confirmado: "badge-purple",
    em_atendimento: "badge-info",
    concluido: "badge-success",
    cancelado: "badge-danger",
  };

  return classes[normalizarStatusAgendamento(status)] || "badge-info";
};

const getClienteNome = (cliente = {}) => cliente.nome || cliente.clienteNome || "Cliente";
const ACOES_STATUS = {
  confirmado: "Confirmar",
  em_atendimento: "Iniciar atendimento",
  concluido: "Concluir atendimento",
  cancelado: "Cancelar agendamento",
};

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
  const [excluindoId, setExcluindoId] = useState("");
  const [clientesSnapshot, setClientesSnapshot] = useState({ chave: "", lista: [] });
  const [servicosSnapshot, setServicosSnapshot] = useState({ chave: "", lista: [] });
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [agendamentoEditando, setAgendamentoEditando] = useState(null);
  const [form, setForm] = useState(agendamentoInicial);
  const [fimAutomatico, setFimAutomatico] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroData, setFiltroData] = useState("");
  const [filtroRapido, setFiltroRapido] = useState("todos");
  const [acaoEmAndamento, setAcaoEmAndamento] = useState({ id: "", status: "" });

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
    () => [...agendamentos].sort(compararAgendamentosPorHorario),
    [agendamentos]
  );

  const hojeISO = obterDataLocalISO();
  const resumo = useMemo(
    () => calcularResumoAgenda(agendamentos, hojeISO),
    [agendamentos, hojeISO]
  );

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
      if (!filtrarAgendamentoPorVisao(agendamento, filtroRapido, hojeISO)) return false;
      if (filtroStatus !== "todos" && status !== filtroStatus) return false;
      if (filtroData && agendamento.data !== filtroData) return false;

      return true;
    });
  }, [agendamentosOrdenados, busca, filtroData, filtroRapido, filtroStatus, hojeISO]);

  const atualizarCampo = (campo, valor) => {
    if (campo === "horaFim") {
      setFimAutomatico(false);
      setForm((atual) => ({ ...atual, horaFim: valor }));
      return;
    }
    if (campo === "servicoId") {
      if (valor === form.servicoId) return;
      const servico = servicos.find((item) => item.id === valor);
      setFimAutomatico(true);
      setForm((atual) => ({
        ...atual,
        servicoId: valor,
        horaFim: sugerirHoraFim(atual.horaInicio, servico?.tempoEstimadoMinutos),
      }));
      return;
    }
    if (campo === "horaInicio" && fimAutomatico) {
      const servico = servicos.find((item) => item.id === form.servicoId);
      setForm((atual) => ({
        ...atual,
        horaInicio: valor,
        horaFim: sugerirHoraFim(valor, servico?.tempoEstimadoMinutos),
      }));
      return;
    }
    setForm((atual) => ({ ...atual, [campo]: valor }));
  };

  const trocarVisaoAgenda = (visao, status = "todos") => {
    setFiltroRapido(visao);
    setFiltroStatus(status);
    setFiltroData("");
  };

  const abrirNovoAgendamento = () => {
    if (!podeEscreverAgenda) {
      showToast("Você não tem permissão para criar agendamentos.", "warning");
      return;
    }

    setAgendamentoEditando(null);
    setForm(agendamentoInicial);
    setFimAutomatico(true);
    setModalAberto(true);
  };

  const abrirEdicaoAgendamento = (agendamento) => {
    setAgendamentoEditando(agendamento);
    setForm({
      clienteId: agendamento.clienteId || "",
      servicoId: agendamento.servicoId || "",
      data: agendamento.data || "",
      horaInicio: agendamento.horaInicio || "",
      horaFim: obterHoraFimAgendamento(agendamento),
      status: agendamento.status || "agendado",
      observacoes: agendamento.observacoes || "",
    });
    setFimAutomatico(false);
    setModalAberto(true);
  };

  const limparModal = () => {
    setModalAberto(false);
    setAgendamentoEditando(null);
    setForm(agendamentoInicial);
    setFimAutomatico(true);
  };

  const fecharModal = () => {
    if (salvando) return;
    limparModal();
  };

  const montarPayloadAtual = () => {
    const cliente = clientes.find((item) => item.id === form.clienteId);
    const servico = servicos.find((item) => item.id === form.servicoId);
    return montarPayloadAgendamento({
      form, agendamentoEditando,
      cliente,
      servico: servico || (agendamentoEditando?.servicoId === form.servicoId ? { id: form.servicoId } : null),
    });
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
    if (agendamentoEditando && !podeEditarDadosAgendamento(agendamentoEditando.status)) {
      showToast("Este atendimento está disponível somente para consulta.", "warning");
      return;
    }

    if (!form.clienteId || !form.servicoId || !form.data || !form.horaInicio) {
      showToast("Preencha os campos obrigatórios.", "warning");
      return;
    }
    if (!form.horaFim) {
      showToast("Informe o horário final.", "warning");
      return;
    }
    if (calcularDuracaoAgendamento(form.horaInicio, form.horaFim) === null) {
      showToast("O horário final deve ser posterior ao horário inicial.", "warning");
      return;
    }

    const payload = montarPayloadAtual();

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
      showToast("Já existe um atendimento agendado nesse período.", "warning");
      return;
    }

    setSalvando(true);

    try {
      if (agendamentoEditando?.id) {
        await editarAgendamento(agendamentoEditando.id, {
          ownerUid,
          empresaId,
          clienteId: form.clienteId,
          servicoId: form.servicoId,
          data: payload.data,
          horaInicio: payload.horaInicio,
          horaFim: payload.horaFim,
          duracaoMinutos: payload.duracaoMinutos,
          observacoes: payload.observacoes,
        });
        showToast("Alterações salvas com sucesso.", "success");
      } else {
        await criarAgendamento({
          ownerUid,
          empresaId,
          clienteId: form.clienteId,
          servicoId: form.servicoId,
          data: payload.data,
          horaInicio: payload.horaInicio,
          horaFim: payload.horaFim,
          duracaoMinutos: payload.duracaoMinutos,
          observacoes: payload.observacoes,
        });
        showToast("Cadastro realizado com sucesso.", "success");
      }

      limparModal();
    } catch (error) {
      console.error("Erro ao salvar agendamento:", error);
      showToast(error.message || "Não foi possível salvar. Tente novamente.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const atualizarStatusAgendamento = async (agendamento, status) => {
    if (!podeEscreverAgenda || !agendamentosRef || !agendamento?.id) return;
    if (acaoEmAndamento.id) return;
    if (!podeTransicionarStatusAgendamento(agendamento.status, status)) return;

    if (status === "concluido") {
      setAcaoEmAndamento({ id: agendamento.id, status });
      try {
        const resultado = await concluirAtendimento({
          ownerUid, empresaId, agendamentoId: agendamento.id,
        });
        showToast(resultado.pendencia || "Atendimento concluído. Conta a receber registrada.", "success");
      } catch (error) {
        showToast(error.message || "Não foi possível concluir o atendimento.", "error");
      } finally {
        setAcaoEmAndamento({ id: "", status: "" });
      }
      return;
    }

    if (status === "cancelado") {
      const confirmado = await confirmar(
        `Deseja cancelar o agendamento de ${agendamento.clienteNome || "cliente"}?`
      );

      if (!confirmado) return;
    }

    setAcaoEmAndamento({ id: agendamento.id, status });
    try {
      const acao = status === "confirmado" ? "confirmar" :
        status === "em_atendimento" ? "iniciar" : "cancelar";
      await transicionarAgendamento(agendamento.id, acao, { ownerUid, empresaId });

      showToast(
        status === "cancelado"
          ? "Agendamento cancelado com sucesso."
          : "Alterações salvas com sucesso.",
        "success"
      );
    } catch (error) {
      console.error("Erro ao atualizar status do agendamento:", error);
      showToast(error.message || "Não foi possível concluir a operação.", "error");
    } finally {
      setAcaoEmAndamento({ id: "", status: "" });
    }
  };

  const solicitarExclusaoAgendamento = async (agendamento) => {
    if (!podeEscreverAgenda || excluindoId) return;

    const confirmado = await confirmar({
      titulo: "Excluir agendamento?",
      message: "Este agendamento será removido definitivamente. Esta ação não poderá ser desfeita.",
      textoConfirmar: "Excluir agendamento",
    });
    if (!confirmado) return;

    setExcluindoId(agendamento.id);
    try {
      await excluirAgendamento(agendamento.id, { ownerUid, empresaId });
      showToast("Agendamento excluído com sucesso.", "success");
    } catch (error) {
      showToast(
        error.status === 409
          ? error.message
          : error.message || "Não foi possível excluir o agendamento.",
        "error"
      );
    } finally {
      setExcluindoId("");
    }
  };

  const somenteLeitura = !podeEscreverAgenda ||
    Boolean(agendamentoEditando && !podeEditarDadosAgendamento(agendamentoEditando.status));

  return (
    <div className="page fornecedores-page agenda-page">
      <div className="page-header fornecedores-header">
        <div>
          <span className="badge badge-info fornecedores-eyebrow">
            <CalendarDays size={14} />
            Gestão de Serviços
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
        <button
          type="button"
          className={`card metric-card metric-blue agenda-summary-control ${filtroRapido === "hoje" ? "is-active" : ""}`}
          onClick={() => trocarVisaoAgenda("hoje")}
        >
          <p>Agendamentos de hoje</p>
          <h2>{resumo.hoje}</h2>
          <small>Agenda do dia</small>
        </button>

        <button
          type="button"
          className={`card metric-card metric-purple agenda-summary-control ${filtroRapido === "todos" && filtroStatus === "confirmado" ? "is-active" : ""}`}
          onClick={() => trocarVisaoAgenda("todos", "confirmado")}
        >
          <p>Confirmados</p>
          <h2>{resumo.confirmados}</h2>
          <small>Clientes confirmados</small>
        </button>

        <button
          type="button"
          className={`card metric-card metric-green agenda-summary-control ${filtroRapido === "proximos" ? "is-active" : ""}`}
          onClick={() => trocarVisaoAgenda("proximos")}
        >
          <p>Próximos agendamentos</p>
          <h2>{resumo.proximos}</h2>
          <small>Hoje ou datas futuras</small>
        </button>

        <button
          type="button"
          className={`card metric-card metric-red agenda-summary-control ${filtroRapido === "todos" && filtroStatus === "cancelado" ? "is-active" : ""}`}
          onClick={() => trocarVisaoAgenda("todos", "cancelado")}
        >
          <p>Cancelados</p>
          <h2>{resumo.cancelados}</h2>
          <small>Histórico preservado</small>
        </button>
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

        <div className="agenda-quick-filters" aria-label="Visualizações rápidas da agenda">
          {[
            ["todos", "Todos"],
            ["hoje", "Hoje"],
            ["proximos", "Próximos"],
            ["em_atendimento", "Em atendimento"],
          ].map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              className={filtroRapido === valor ? "is-active" : ""}
              aria-pressed={filtroRapido === valor}
              onClick={() => trocarVisaoAgenda(valor)}
            >
              {label}
            </button>
          ))}
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
                  <th>Horário</th>
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
                  const podeEditar = podeEscreverAgenda && podeEditarDadosAgendamento(agendamento.status);
                  const acaoPrincipal = obterAcaoPrincipalAgenda(status, podeEscreverAgenda);
                  const processandoAcao = acaoEmAndamento.id === agendamento.id;
                  const processandoAcaoPrincipal = processandoAcao &&
                    acaoEmAndamento.status === acaoPrincipal.proximoStatus;
                  const atendimentoPendente = isAtendimentoAntigoEmAberto(agendamento, hojeISO);
                  const itensMenu = [
                    ...(acaoPrincipal.tipo === "visualizar" ? [] : [{
                      label: podeEditar ? "Editar agendamento" : "Visualizar atendimento",
                      onClick: () => abrirEdicaoAgendamento(agendamento),
                    }]),
                    ...(podeEscreverAgenda ? transicoesPermitidasAgendamento(agendamento.status)
                      .filter((proximo) => proximo !== acaoPrincipal.proximoStatus)
                      .map((proximo) => ({
                        label: ACOES_STATUS[proximo],
                        danger: proximo === "cancelado",
                        disabled: Boolean(acaoEmAndamento.id),
                        onClick: () => atualizarStatusAgendamento(agendamento, proximo),
                      })) : []),
                    ...(podeEscreverAgenda ? [{
                      label: excluindoId === agendamento.id ? "Excluindo..." : "Excluir agendamento",
                      danger: true,
                      disabled: Boolean(excluindoId || acaoEmAndamento.id),
                      onClick: () => solicitarExclusaoAgendamento(agendamento),
                    }] : []),
                  ];

                  return (
                    <tr
                      key={agendamento.id}
                      className={`agenda-table-row ${atendimentoPendente ? "is-pending" : ""}`}
                      onDoubleClick={() => abrirEdicaoAgendamento(agendamento)}
                    >
                      <td>{formatarData(agendamento.data)}</td>
                      <td>{agendamento.horaInicio || "-"}{obterHoraFimAgendamento(agendamento) ? ` – ${obterHoraFimAgendamento(agendamento)}` : ""}</td>
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
                        {atendimentoPendente && (
                          <small className="agenda-pending-label">Atendimento pendente</small>
                        )}
                      </td>
                      <td onDoubleClick={(event) => event.stopPropagation()}>
                        <div className="agenda-row-actions">
                          <button
                            type="button"
                            className="agenda-primary-action"
                            disabled={Boolean(acaoEmAndamento.id || excluindoId)}
                            onClick={() => acaoPrincipal.tipo === "visualizar"
                              ? abrirEdicaoAgendamento(agendamento)
                              : atualizarStatusAgendamento(agendamento, acaoPrincipal.proximoStatus)}
                          >
                            {processandoAcaoPrincipal ? acaoPrincipal.processando : acaoPrincipal.label}
                          </button>
                          {itensMenu.length > 0 && (
                            <ActionMenu
                            label="Abrir ações do agendamento"
                              items={itensMenu}
                            />
                          )}
                        </div>
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
                  disabled={carregandoDependencias || somenteLeitura}
                >
                  <option value="">Selecione</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {getClienteNome(cliente)}
                    </option>
                  ))}
                  {agendamentoEditando?.clienteId && !clientes.some((cliente) => cliente.id === agendamentoEditando.clienteId) && (
                    <option value={agendamentoEditando.clienteId}>{agendamentoEditando.clienteNome || "Cliente anterior"}</option>
                  )}
                </select>
              </label>

              <label>
                Serviço *
                <select
                  value={form.servicoId}
                  onChange={(event) => atualizarCampo("servicoId", event.target.value)}
                  disabled={somenteLeitura}
                >
                  <option value="">Selecione</option>
                  {servicos.map((servico) => (
                    <option key={servico.id} value={servico.id}>
                      {servico.nome || "Serviço"}
                    </option>
                  ))}
                  {agendamentoEditando?.servicoId && !servicos.some((servico) => servico.id === agendamentoEditando.servicoId) && (
                    <option value={agendamentoEditando.servicoId}>{agendamentoEditando.servicoNome || "Serviço anterior"}</option>
                  )}
                </select>
              </label>

              <label>
                Data *
                <input
                  type="date"
                  value={form.data}
                  onChange={(event) => atualizarCampo("data", event.target.value)}
                  disabled={somenteLeitura}
                />
              </label>

              <label>
                Hora inicial *
                <input
                  type="time"
                  value={form.horaInicio}
                  onChange={(event) => atualizarCampo("horaInicio", event.target.value)}
                  disabled={somenteLeitura}
                />
              </label>

              <label>
                Hora final *
                <input
                  type="time"
                  value={form.horaFim}
                  onChange={(event) => atualizarCampo("horaFim", event.target.value)}
                  disabled={somenteLeitura}
                />
              </label>

              <div className="fornecedores-form-wide">
                Duração: {formatarDuracao(calcularDuracaoAgendamento(form.horaInicio, form.horaFim))}
              </div>

              <div>Status: {getStatusLabel(form.status)}</div>

              <label className="fornecedores-form-wide">
                Observações
                <textarea
                  value={form.observacoes}
                  onChange={(event) => atualizarCampo("observacoes", event.target.value)}
                  placeholder="Informações importantes para o atendimento"
                  rows={4}
                  disabled={somenteLeitura}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="confirm-secondary" onClick={fecharModal}>
                {somenteLeitura ? "Fechar" : "Cancelar"}
              </button>
              {!somenteLeitura && (
                <button type="button" onClick={salvarAgendamento} disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar agendamento"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
