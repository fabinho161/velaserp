import { normalizarSegmentoEmpresa } from "../config/segmentosEmpresa.js";
import {
  calcularValorTotalServicos,
  normalizarServicosAgendamento,
  resumirServicosAgendamento,
} from "./agenda.js";
import { agruparServicosRealizados } from "./analiticaServicos.js";

const RELATORIOS_GESTAO_SERVICOS = new Set([
  "atendimentos",
  "servicos",
  "financeiro",
  "dre",
]);
const LABELS_STATUS_ATENDIMENTO = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const obterApresentacaoRelatorios = (segmento) => {
  const isGestaoServicos = normalizarSegmentoEmpresa(segmento) === "clientes";

  return {
    isGestaoServicos,
    exibirIndicadoresVendas: !isGestaoServicos,
    exibirDespesas: true,
  };
};

export const filtrarRelatoriosPorSegmento = (relatorios = [], segmento) => {
  if (!obterApresentacaoRelatorios(segmento).isGestaoServicos) {
    return relatorios.filter((relatorio) =>
      !["atendimentos", "servicos"].includes(relatorio?.tipo)
    );
  }

  return relatorios.filter((relatorio) =>
    RELATORIOS_GESTAO_SERVICOS.has(relatorio?.tipo)
  );
};

export const filtrarAtendimentosRelatorio = (
  agendamentos = [],
  { inicio = "", fim = "", clienteId = "", servicoId = "" } = {}
) => agendamentos.filter((agendamento) => {
  const data = String(agendamento?.data || "");
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  if (clienteId && agendamento?.clienteId !== clienteId) return false;

  const servicos = normalizarServicosAgendamento(agendamento);
  if (servicoId && !servicos.some((servico) => servico.servicoId === servicoId)) {
    return false;
  }

  return true;
});

export const prepararRelatorioAtendimentos = (agendamentos = [], filtro = {}) => {
  const atendimentos = filtrarAtendimentosRelatorio(agendamentos, filtro);
  const linhas = atendimentos.map((agendamento) => {
    const servicos = normalizarServicosAgendamento(agendamento);
    const valorHistorico = calcularValorTotalServicos(servicos) ?? 0;

    return {
      id: agendamento.id || "",
      data: agendamento.data || "",
      clienteId: agendamento.clienteId || "",
      clienteNome: agendamento.clienteNome || "Cliente não informado",
      servicos,
      servicosResumo: resumirServicosAgendamento(servicos) || "Serviço não informado",
      servicosNomes: servicos.map((servico) => servico.servicoNome).join(" • ") || "Serviço não informado",
      status: agendamento.status || "agendado",
      statusLabel: LABELS_STATUS_ATENDIMENTO[agendamento.status] || "Agendado",
      horario: [agendamento.horaInicio, agendamento.horaFim].filter(Boolean).join(" – ") || "-",
      duracaoMinutos: Number.isInteger(agendamento.duracaoMinutos)
        ? agendamento.duracaoMinutos
        : 0,
      valorHistorico,
    };
  });
  const concluidos = linhas.filter((linha) => linha.status === "concluido");

  return {
    linhas,
    totalAtendimentos: linhas.length,
    totalConcluidos: concluidos.length,
    valorAtendimentosConcluidos: concluidos.reduce(
      (total, linha) => total + linha.valorHistorico,
      0
    ),
  };
};

export const prepararRelatorioServicos = (agendamentos = [], filtro = {}) => {
  const concluidos = filtrarAtendimentosRelatorio(agendamentos, filtro)
    .filter((agendamento) => agendamento.status === "concluido");
  const linhas = agruparServicosRealizados(concluidos, {
    servicoId: filtro.servicoId || "",
  }).sort((a, b) =>
    b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR")
  );

  return {
    linhas,
    totalExecucoes: linhas.reduce((total, linha) => total + linha.quantidade, 0),
    totalTipos: linhas.length,
    valorHistorico: linhas.reduce((total, linha) => total + linha.valor, 0),
  };
};
