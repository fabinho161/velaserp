import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ArrowRight,
  Ban,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Plus,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PERMISSOES_EMPRESA } from "../../config/perfisEmpresa.js";
import { useERP } from "../../context/useERP";
import { useToast } from "../../context/useToast";
import { db } from "../../firebase";
import {
  calcularDashboardClientes,
  obterAcoesRapidasDashboardClientes,
  obterDataLocalISO,
} from "../../utils/dashboardClientes.js";
import { registrarErroFirestore } from "../../utils/firestoreDiagnostico.js";

const PERFIS_OPERACAO_AGENDA = new Set(["administrador_empresa", "comercial"]);
const PERFIS_OPERACAO_SERVICOS = new Set(["administrador_empresa", "comercial", "producao"]);
const LABELS_STATUS = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const moeda = (valor) => Number(valor || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dataExtenso = () => new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
}).format(new Date());

const classeStatus = (status) => ({
  agendado: "badge-info",
  confirmado: "badge-purple",
  em_atendimento: "badge-warning",
  concluido: "badge-success",
  cancelado: "badge-danger",
}[status] || "badge-info");

export default function DashboardClientes() {
  const {
    empresaId,
    empresaOwnerUid,
    isAdminMaster,
    perfilEmpresaAtual,
    temPermissaoEmpresaAtual,
    user,
    usuarioEmpresaSomenteLeitura,
  } = useERP();
  const { showToast } = useToast();
  const ownerUid = empresaOwnerUid || user?.uid || null;
  const chaveEmpresa = ownerUid && empresaId ? `${ownerUid}/${empresaId}` : "";
  const podeVerAgenda = Boolean(temPermissaoEmpresaAtual?.(PERMISSOES_EMPRESA.agenda));
  const podeVerFinanceiro = Boolean(temPermissaoEmpresaAtual?.(PERMISSOES_EMPRESA.financeiro));
  const podeOperarAgenda = !usuarioEmpresaSomenteLeitura &&
    (isAdminMaster || PERFIS_OPERACAO_AGENDA.has(perfilEmpresaAtual));
  const podeCriarCliente = !usuarioEmpresaSomenteLeitura &&
    Boolean(temPermissaoEmpresaAtual?.(PERMISSOES_EMPRESA.crm));
  const podeCriarServico = !usuarioEmpresaSomenteLeitura &&
    Boolean(temPermissaoEmpresaAtual?.(PERMISSOES_EMPRESA.servicos)) &&
    (isAdminMaster || PERFIS_OPERACAO_SERVICOS.has(perfilEmpresaAtual));
  const [agendaSnapshot, setAgendaSnapshot] = useState({ chave: "", lista: [], carregado: false });
  const [contasSnapshot, setContasSnapshot] = useState({ chave: "", lista: [], carregado: false });

  useEffect(() => {
    if (!chaveEmpresa || !podeVerAgenda) return undefined;
    return onSnapshot(
      collection(db, "users", ownerUid, "empresas", empresaId, "agendamentos"),
      (snapshot) => setAgendaSnapshot({
        chave: chaveEmpresa,
        lista: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        carregado: true,
      }),
      (error) => {
        registrarErroFirestore({
          origem: "DashboardClientes",
          colecao: "agendamentos",
          operacao: "list:onSnapshot",
          error,
          perfil: perfilEmpresaAtual,
          segmento: "clientes",
        });
        setAgendaSnapshot({ chave: chaveEmpresa, lista: [], carregado: true });
        showToast("Não foi possível carregar os dados da agenda.", "error");
      }
    );
  }, [chaveEmpresa, empresaId, ownerUid, podeVerAgenda, perfilEmpresaAtual, showToast]);

  useEffect(() => {
    if (!chaveEmpresa || !podeVerFinanceiro) return undefined;
    return onSnapshot(
      collection(db, "users", ownerUid, "empresas", empresaId, "contasReceber"),
      (snapshot) => setContasSnapshot({
        chave: chaveEmpresa,
        lista: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        carregado: true,
      }),
      (error) => {
        registrarErroFirestore({
          origem: "DashboardClientes",
          colecao: "contasReceber",
          operacao: "list:onSnapshot",
          error,
          perfil: perfilEmpresaAtual,
          segmento: "clientes",
        });
        setContasSnapshot({ chave: chaveEmpresa, lista: [], carregado: true });
        showToast("Não foi possível carregar o resumo financeiro.", "error");
      }
    );
  }, [chaveEmpresa, empresaId, ownerUid, podeVerFinanceiro, perfilEmpresaAtual, showToast]);

  const agendaCarregada = !podeVerAgenda ||
    (agendaSnapshot.chave === chaveEmpresa && agendaSnapshot.carregado);
  const contasCarregadas = !podeVerFinanceiro ||
    (contasSnapshot.chave === chaveEmpresa && contasSnapshot.carregado);
  const carregando = !agendaCarregada || !contasCarregadas;
  const agendamentos = useMemo(
    () => (agendaSnapshot.chave === chaveEmpresa ? agendaSnapshot.lista : []),
    [agendaSnapshot, chaveEmpresa],
  );
  const contas = useMemo(
    () => (contasSnapshot.chave === chaveEmpresa ? contasSnapshot.lista : []),
    [chaveEmpresa, contasSnapshot],
  );
  const hoje = obterDataLocalISO();
  const resumo = useMemo(() => {
    const agora = new Date();
    return calcularDashboardClientes({
      agendamentos,
      contasReceber: podeVerFinanceiro ? contas : [],
      hoje,
      agoraMinutos: agora.getHours() * 60 + agora.getMinutes(),
    });
  }, [agendamentos, contas, hoje, podeVerFinanceiro]);

  if (carregando) {
    return <div className="dashboard-services-loading">Carregando visão da operação...</div>;
  }

  if (!podeVerAgenda) {
    return <div className="dashboard-services-loading">Seu perfil não possui acesso aos dados da agenda.</div>;
  }

  const proximo = resumo.proximoAtendimento;
  const iconesAcao = {
    novo_agendamento: Plus,
    novo_cliente: UserPlus,
    novo_servico: Wrench,
    abrir_agenda: CalendarDays,
  };
  const acoes = obterAcoesRapidasDashboardClientes({
    podeVerAgenda, podeOperarAgenda, podeCriarCliente, podeCriarServico,
  }).map((acao) => ({ ...acao, Icone: iconesAcao[acao.id] }));

  return (
    <div className="dashboard-services-page">
      <header className="dashboard-services-header">
        <div>
          <span>Gestão de Serviços</span>
          <h1>Visão geral da sua operação</h1>
          <p>{dataExtenso()}</p>
        </div>
        <Link className="dashboard-services-header-action" to="/agenda">
          Abrir agenda <ArrowRight size={17} />
        </Link>
      </header>

      <section className="dashboard-services-kpis" aria-label="Indicadores principais">
        <article className="dashboard-services-kpi kpi-calendar">
          <CalendarDays size={20} />
          <div><span>Agenda de hoje</span><strong>{resumo.totalHoje}</strong><small>{resumo.restantesHoje} restantes</small></div>
        </article>
        <article className="dashboard-services-kpi kpi-next">
          <Clock3 size={20} />
          <div>
            <span>Próximo atendimento</span>
            {proximo ? <><strong>{proximo.horaInicio}</strong><small>{proximo.clienteNome || "Cliente"} · {proximo.servicoNome || "Serviço"}</small></> :
              <small className="dashboard-services-empty-copy">Nenhum atendimento pendente hoje</small>}
          </div>
        </article>
        {podeVerFinanceiro && <article className="dashboard-services-kpi kpi-receivable">
          <Wallet size={20} />
          <div><span>A receber</span><strong>{moeda(resumo.financeiro.aReceber)}</strong><small>{resumo.financeiro.pendencias} pendências</small></div>
        </article>}
        {podeVerFinanceiro && <article className="dashboard-services-kpi kpi-received">
          <CircleDollarSign size={20} />
          <div><span>Recebido no mês</span><strong>{moeda(resumo.financeiro.recebidoMes)}</strong><small>{resumo.financeiro.recebimentosMes} recebimentos</small></div>
        </article>}
      </section>

      <section className="dashboard-services-primary-grid">
        <article className="card dashboard-services-agenda">
          <div className="dashboard-services-section-header">
            <div><span>Operação</span><h2>Agenda de hoje</h2></div>
            <Link to="/agenda">Ver agenda <ArrowRight size={15} /></Link>
          </div>
          {resumo.agendaHoje.length === 0 ? <div className="dashboard-services-empty">Sua agenda está livre hoje.</div> :
            <div className="dashboard-services-schedule">
              {resumo.agendaHoje.map((item) => <div className="dashboard-services-appointment" key={item.id}>
                <time>{item.horaInicio || "--:--"}<small>{item.horaFim || ""}</small></time>
                <div><strong>{item.clienteNome || "Cliente"}</strong><span>{item.servicoNome || "Serviço"}</span></div>
                <span className={`badge ${classeStatus(item.status)}`}>{LABELS_STATUS[item.status] || "Agendado"}</span>
              </div>)}
            </div>}
        </article>

        <aside className="card dashboard-services-quick">
          <div className="dashboard-services-section-header"><div><span>Atalhos</span><h2>Ações rápidas</h2></div></div>
          <div className="dashboard-services-actions">
            {acoes.map(({ label, rota, Icone }) => <Link to={rota} key={label}><Icone size={18} /><span>{label}</span><ArrowRight size={15} /></Link>)}
          </div>
        </aside>
      </section>

      <section className="dashboard-services-month-grid">
        <article className="dashboard-services-month-card"><CheckCircle2 /><span>Concluídos no mês</span><strong>{resumo.concluidosMes}</strong></article>
        <article className="dashboard-services-month-card"><Ban /><span>Cancelamentos</span><strong>{resumo.cancelamentosMes}</strong></article>
        <article className="dashboard-services-month-card"><Users /><span>Clientes atendidos</span><strong>{resumo.clientesAtendidosMes}</strong></article>
        {podeVerFinanceiro && <article className="dashboard-services-month-card"><CircleDollarSign /><span>Ticket médio recebido</span><strong>{moeda(resumo.financeiro.ticketMedioRecebido)}</strong></article>}
      </section>

      <section className="dashboard-services-insights-grid">
        <article className="card dashboard-services-chart-card">
          <div className="dashboard-services-section-header"><div><span>Mês atual</span><h2>Evolução dos atendimentos</h2></div></div>
          {resumo.evolucao.length === 0 ? <div className="dashboard-services-empty">Nenhum atendimento concluído neste mês.</div> :
            <div className="dashboard-services-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={resumo.evolucao} margin={{ top: 10, right: 12, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(valor) => [valor, "Concluídos"]} labelFormatter={(dia) => `Dia ${dia}`} />
                  <Line type="monotone" dataKey="quantidade" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>}
        </article>

        <article className="card dashboard-services-ranking-card">
          <div className="dashboard-services-section-header"><div><span>Mês atual</span><h2>Serviços mais realizados</h2></div></div>
          {resumo.servicosMaisRealizados.length === 0 ? <div className="dashboard-services-empty">Nenhum serviço realizado neste mês.</div> :
            <ol className="dashboard-services-ranking">
              {resumo.servicosMaisRealizados.map((item, indice) => <li key={item.servicoId || `legado-${item.nome}`}>
                <span>{indice + 1}</span><strong>{item.nome}</strong><small>{item.quantidade} realizados</small>
              </li>)}
            </ol>}
        </article>
      </section>

      {podeVerFinanceiro && <section className="card dashboard-services-finance">
        <div><span>Resumo financeiro</span><strong>{moeda(resumo.financeiro.recebidoMes)} recebidos no mês</strong><small>{moeda(resumo.financeiro.aReceber)} em {resumo.financeiro.pendencias} pendências</small></div>
        <Link to="/financeiro">Ver Financeiro <ArrowRight size={16} /></Link>
      </section>}
    </div>
  );
}
