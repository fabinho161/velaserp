import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileText,
} from "lucide-react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import {
  cancelarFaturamento,
  determinarFiscalFaturamento as solicitarDeterminacaoFiscal,
  listarFaturamentos,
  obterFaturamento,
  prepararFaturamento,
  salvarContextoOperacional,
} from "../services/faturamentoApi";
import {
  FINALIDADES_OPERACAO,
  INDICADORES_IE_DESTINATARIO,
  PRESENCAS_COMPRADOR,
} from "../utils/faturamento";
import {
  ORIGEM_FATURAMENTO_OPCOES,
  STATUS_FATURAMENTO_OPCOES,
  calcularKpisFaturamento,
  descreverPendenciasDeterminacaoFiscal,
  descreverPendenciaFaturamento,
  descreverPendenciasFaturamento,
  filtrarFaturamentos,
  formatarConsumidorFinalFiscal,
  formatarDestinoOperacao,
  formatarDestinoFiscal,
  formatarFinalidadeFiscal,
  formatarFonteCfop,
  formatarIndicadorIEFiscal,
  formatarOrigemFaturamento,
  formatarOrigemProdutoFiscal,
  formatarSituacaoDeterminacaoItem,
  formatarStatusFaturamento,
  obterSituacaoDeterminacaoItem,
} from "../utils/faturamentoUi";

const CONTEXTO_FORM_INICIAL = {
  finalidadeOperacao: FINALIDADES_OPERACAO.NORMAL,
  presencaComprador: "",
  consumidorFinal: "",
  indicadorIEDestinatario: "",
  naturezaOperacao: "",
};

const texto = (valor) => String(valor || "").trim();

const numeroBR = (valor, casas = 2) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

const moedaBR = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const dataBR = (valor) => {
  if (!valor) return "-";
  const segundosTimestamp =
    typeof valor === "object"
      ? valor.seconds ?? valor._seconds
      : null;
  const data =
    typeof valor?.toDate === "function"
      ? valor.toDate()
      : Number.isFinite(segundosTimestamp)
        ? new Date(segundosTimestamp * 1000)
      : valor instanceof Date
        ? valor
        : new Date(valor);

  if (Number.isNaN(data.getTime())) return "-";

  return data.toLocaleDateString("pt-BR");
};

const textoOpcional = (valor) => texto(valor) || "-";

const obterFormContexto = (faturamento = {}) => {
  const operacao = faturamento.contextoFiscal?.operacao || {};

  return {
    finalidadeOperacao: operacao.finalidadeOperacao || FINALIDADES_OPERACAO.NORMAL,
    presencaComprador: operacao.presencaComprador || "",
    consumidorFinal:
      typeof operacao.consumidorFinal === "boolean"
        ? String(operacao.consumidorFinal)
        : "",
    indicadorIEDestinatario: operacao.indicadorIEDestinatario || "",
    naturezaOperacao: operacao.naturezaOperacao || "",
  };
};

const normalizarFormContexto = (form) => ({
  finalidadeOperacao: FINALIDADES_OPERACAO.NORMAL,
  presencaComprador: form.presencaComprador,
  consumidorFinal:
    form.consumidorFinal === ""
      ? null
      : form.consumidorFinal === "true",
  indicadorIEDestinatario: form.indicadorIEDestinatario,
  naturezaOperacao: form.naturezaOperacao,
});

export default function Faturamentos() {
  const {
    empresaId,
    perfilEmpresaAtual,
    empresaOwnerUid,
    isAdminMaster,
    user,
    usuarioEmpresaSomenteLeitura,
  } = useERP();
  const { faturamentoId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();

  const [faturamentos, setFaturamentos] = useState([]);
  const [faturamentoSelecionado, setFaturamentoSelecionado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [tooltipPendencias, setTooltipPendencias] = useState(null);
  const [filtros, setFiltros] = useState({
    status: "todos",
    origem: "todos",
    busca: "",
    dataInicial: "",
    dataFinal: "",
  });
  const [formContexto, setFormContexto] = useState(CONTEXTO_FORM_INICIAL);

  const isOwnerEmpresa = Boolean(user?.uid && empresaOwnerUid === user.uid);
  const podeEditarContexto =
    !usuarioEmpresaSomenteLeitura &&
    (isOwnerEmpresa ||
      isAdminMaster ||
      ["administrador_empresa", "financeiro", "comercial"].includes(perfilEmpresaAtual));
  const podeCancelar =
    !usuarioEmpresaSomenteLeitura &&
    (isOwnerEmpresa ||
      isAdminMaster ||
      ["administrador_empresa", "financeiro"].includes(perfilEmpresaAtual));
  const podeDeterminarFiscal = podeCancelar;

  const carregarLista = useCallback(async () => {
    if (!empresaId) return;

    setLoading(true);
    try {
      const data = await listarFaturamentos({ empresaId });
      setFaturamentos(Array.isArray(data.faturamentos) ? data.faturamentos : []);
    } catch (error) {
      showToast(error.message || "Não foi possível carregar faturamentos.", "error");
    } finally {
      setLoading(false);
    }
  }, [empresaId, showToast]);

  const abrirFaturamento = useCallback((id) => {
    if (!id) return;
    navigate(`/faturamentos/${encodeURIComponent(id)}`);
  }, [navigate]);

  const fecharDetalhe = () => {
    setFaturamentoSelecionado(null);
    setMotivoCancelamento("");
    setFormContexto(CONTEXTO_FORM_INICIAL);
    navigate("/faturamentos");
  };

  const carregarDetalhe = useCallback(async (id) => {
    if (!empresaId || !id) return;

    setLoadingDetalhe(true);
    try {
      const data = await obterFaturamento({ empresaId, faturamentoId: id });
      const faturamento = data.faturamento || null;

      setFaturamentoSelecionado(faturamento);
      setFormContexto(faturamento ? obterFormContexto(faturamento) : CONTEXTO_FORM_INICIAL);
    } catch (error) {
      showToast(error.message || "Não foi possível abrir o faturamento.", "error");
      navigate("/faturamentos");
    } finally {
      setLoadingDetalhe(false);
    }
  }, [empresaId, navigate, showToast]);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  useEffect(() => {
    if (faturamentoId) carregarDetalhe(faturamentoId);
  }, [carregarDetalhe, faturamentoId]);

  const faturamentosFiltrados = useMemo(
    () => filtrarFaturamentos(faturamentos, filtros),
    [faturamentos, filtros]
  );
  const kpis = useMemo(() => calcularKpisFaturamento(faturamentos), [faturamentos]);
  const statusSelecionado = texto(faturamentoSelecionado?.status || "rascunho").toLowerCase();
  const detalheSomenteLeitura = statusSelecionado !== "rascunho" || !podeEditarContexto;
  const operacaoSelecionada = faturamentoSelecionado?.contextoFiscal?.operacao || {};
  const pendenciasSelecionadas = Array.isArray(faturamentoSelecionado?.pendencias)
    ? faturamentoSelecionado.pendencias
    : [];
  const determinacaoFiscalSelecionada =
    faturamentoSelecionado?.determinacaoFiscal &&
    typeof faturamentoSelecionado.determinacaoFiscal === "object"
      ? faturamentoSelecionado.determinacaoFiscal
      : null;
  const pendenciasFiscaisSelecionadas = Array.isArray(
    determinacaoFiscalSelecionada?.pendencias
  )
    ? determinacaoFiscalSelecionada.pendencias
    : [];

  const atualizarFiltro = (campo, valor) => {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  };

  const atualizarContexto = (campo, valor) => {
    setFormContexto((atual) => ({ ...atual, [campo]: valor }));
  };

  const salvarContexto = async () => {
    if (!empresaId || !faturamentoSelecionado?.id || acaoEmAndamento) return;

    setAcaoEmAndamento("contexto");
    try {
      await salvarContextoOperacional({
        empresaId,
        faturamentoId: faturamentoSelecionado.id,
        contexto: normalizarFormContexto(formContexto),
      });
      showToast("Contexto salvo com sucesso.", "success");
      await carregarLista();
      await carregarDetalhe(faturamentoSelecionado.id);
    } catch (error) {
      showToast(error.message || "Não foi possível salvar o contexto.", "error");
    } finally {
      setAcaoEmAndamento("");
    }
  };

  const preparar = async () => {
    if (!empresaId || !faturamentoSelecionado?.id || acaoEmAndamento) return;

    const confirmado = await confirmar(
      "Após preparar, o contexto e os snapshots não poderão ser alterados. Deseja continuar?"
    );
    if (!confirmado) return;

    setAcaoEmAndamento("preparar");
    try {
      await prepararFaturamento({
        empresaId,
        faturamentoId: faturamentoSelecionado.id,
      });
      showToast("Faturamento preparado com sucesso.", "success");
      await carregarLista();
      await carregarDetalhe(faturamentoSelecionado.id);
    } catch (error) {
      if (error.status === 409 && Array.isArray(error.data?.pendencias)) {
        setFaturamentoSelecionado((atual) => ({
          ...(atual || faturamentoSelecionado),
          pendencias: error.data.pendencias,
        }));
        showToast("O faturamento ainda possui pendências.", "warning");
      } else {
        showToast(error.message || "Não foi possível preparar o faturamento.", "error");
      }
      await carregarLista();
    } finally {
      setAcaoEmAndamento("");
    }
  };

  const cancelar = async () => {
    if (!empresaId || !faturamentoSelecionado?.id || acaoEmAndamento) return;

    const confirmado = await confirmar(
      "O cancelamento deste faturamento não cancela a venda, o pagamento ou a movimentação de estoque. Deseja continuar?"
    );
    if (!confirmado) return;

    setAcaoEmAndamento("cancelar");
    try {
      await cancelarFaturamento({
        empresaId,
        faturamentoId: faturamentoSelecionado.id,
        motivoCancelamento,
      });
      showToast("Faturamento cancelado.", "success");
      await carregarLista();
      await carregarDetalhe(faturamentoSelecionado.id);
    } catch (error) {
      showToast(error.message || "Não foi possível cancelar o faturamento.", "error");
    } finally {
      setAcaoEmAndamento("");
    }
  };

  const determinarFiscal = async () => {
    if (!empresaId || !faturamentoSelecionado?.id || acaoEmAndamento) return;

    setAcaoEmAndamento("determinar-fiscal");
    try {
      await solicitarDeterminacaoFiscal({
        empresaId,
        faturamentoId: faturamentoSelecionado.id,
      });
      showToast("Determinação fiscal realizada com sucesso.", "success");
      await carregarLista();
      await carregarDetalhe(faturamentoSelecionado.id);
    } catch (error) {
      showToast(error.message || "Não foi possível determinar fiscalmente o faturamento.", "error");
    } finally {
      setAcaoEmAndamento("");
    }
  };

  const renderInfo = (label, valor) => (
    <div className="billing-info-item">
      <span>{label}</span>
      <strong>{textoOpcional(valor)}</strong>
    </div>
  );

  const esconderTooltipPendencias = () => {
    setTooltipPendencias(null);
  };

  const mostrarTooltipPendencias = (event, conteudo) => {
    if (!conteudo || typeof window === "undefined") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const largura = Math.min(360, Math.max(240, window.innerWidth - 32));
    const margem = 16;
    const left = Math.min(
      Math.max(margem, rect.right - largura),
      Math.max(margem, window.innerWidth - largura - margem)
    );
    const abrirAbaixo = rect.top < 180;

    setTooltipPendencias({
      conteudo,
      left,
      top: abrirAbaixo ? rect.bottom + 8 : rect.top - 8,
      width: largura,
      posicao: abrirAbaixo ? "below" : "above",
    });
  };

  const renderPendenciasTabela = (pendencias = []) => {
    const pendenciasLista = Array.isArray(pendencias) ? pendencias : [];

    if (pendenciasLista.length === 0) {
      return <span className="billing-pendency-empty">Sem pendências</span>;
    }

    const descricoes = descreverPendenciasFaturamento(pendenciasLista);
    const tooltip = descricoes.join("\n");

    return (
      <span
        className="billing-pendency-tooltip"
        tabIndex={0}
        title={tooltip}
        aria-label={tooltip}
        onMouseEnter={(event) => mostrarTooltipPendencias(event, tooltip)}
        onMouseLeave={esconderTooltipPendencias}
        onFocus={(event) => mostrarTooltipPendencias(event, tooltip)}
        onBlur={esconderTooltipPendencias}
      >
        {pendenciasLista.length} pendência(s)
      </span>
    );
  };

  const obterItemOrigemDeterminacao = (itemDeterminado = {}) => {
    const itens = Array.isArray(faturamentoSelecionado?.itens)
      ? faturamentoSelecionado.itens
      : [];
    const indice = Number(itemDeterminado.indice);

    if (Number.isInteger(indice) && itens[indice]) return itens[indice];

    return itens.find((item) =>
      item?.origemItemId &&
      item.origemItemId === itemDeterminado.origemItemId
    ) || {};
  };

  const renderPendenciasFiscais = (pendencias = []) => {
    const lista = Array.isArray(pendencias) ? pendencias : [];

    if (lista.length === 0) return null;

    return (
      <ul className="billing-tax-pendency-list">
        {descreverPendenciasDeterminacaoFiscal(lista).map((descricao) => (
          <li key={descricao}>{descricao}</li>
        ))}
      </ul>
    );
  };

  return (
    <div className="billing-page">
      <div className="billing-header">
        <div>
          <h1 className="page-title">Central de Faturamento</h1>
          <p>Prepare operações comerciais para o fluxo fiscal, sem emitir documentos fiscais.</p>
        </div>
        <button type="button" onClick={carregarLista} disabled={loading}>
          Atualizar
        </button>
      </div>

      <div className="billing-kpi-grid">
        <div className="billing-kpi-card">
          <FileText size={22} />
          <span>Total</span>
          <strong>{kpis.total}</strong>
        </div>
        <div className="billing-kpi-card warning">
          <AlertTriangle size={22} />
          <span>Rascunhos</span>
          <strong>{kpis.rascunhos}</strong>
        </div>
        <div className="billing-kpi-card success">
          <CheckCircle2 size={22} />
          <span>Preparados</span>
          <strong>{kpis.preparados}</strong>
        </div>
        <div className="billing-kpi-card danger">
          <Ban size={22} />
          <span>Cancelados</span>
          <strong>{kpis.cancelados}</strong>
        </div>
        <div className="billing-kpi-card">
          <FileCheck2 size={22} />
          <span>Com pendências</span>
          <strong>{kpis.comPendencias}</strong>
        </div>
      </div>

      <div className="card billing-filter-card">
        <label>
          <span>Status</span>
          <select value={filtros.status} onChange={(e) => atualizarFiltro("status", e.target.value)}>
            {STATUS_FATURAMENTO_OPCOES.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>{opcao.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Origem</span>
          <select value={filtros.origem} onChange={(e) => atualizarFiltro("origem", e.target.value)}>
            {ORIGEM_FATURAMENTO_OPCOES.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>{opcao.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Data inicial</span>
          <input type="date" value={filtros.dataInicial} onChange={(e) => atualizarFiltro("dataInicial", e.target.value)} />
        </label>
        <label>
          <span>Data final</span>
          <input type="date" value={filtros.dataFinal} onChange={(e) => atualizarFiltro("dataFinal", e.target.value)} />
        </label>
        <label>
          <span>Busca</span>
          <input
            placeholder="Destinatário ou número"
            value={filtros.busca}
            onChange={(e) => atualizarFiltro("busca", e.target.value)}
          />
        </label>
        <button
          type="button"
          className="billing-secondary-button"
          onClick={() => setFiltros({
            status: "todos",
            origem: "todos",
            busca: "",
            dataInicial: "",
            dataFinal: "",
          })}
        >
          Limpar
        </button>
      </div>

      <div className="card">
        <div className="billing-card-header">
          <div>
            <h3>Faturamentos</h3>
            <p>{loading ? "Carregando..." : `${faturamentosFiltrados.length} registro(s)`}</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Origem</th>
                <th>Número</th>
                <th>Destinatário</th>
                <th>Data</th>
                <th>Valor líquido</th>
                <th>Status</th>
                <th>Pendências</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {faturamentosFiltrados.map((faturamento) => (
                <tr key={faturamento.id}>
                  <td>{formatarOrigemFaturamento(faturamento.origem)}</td>
                  <td>{faturamento.origem?.numeroDocumento || "-"}</td>
                  <td>{faturamento.contextoFiscal?.destinatario?.nome || "-"}</td>
                  <td>{dataBR(faturamento.contextoFiscal?.operacao?.dataOperacao)}</td>
                  <td>{moedaBR(faturamento.totais?.valorLiquido)}</td>
                  <td>
                    <span className={`billing-status ${faturamento.status || "rascunho"}`}>
                      {formatarStatusFaturamento(faturamento.status)}
                    </span>
                  </td>
                  <td>{renderPendenciasTabela(faturamento.pendencias)}</td>
                  <td>{dataBR(faturamento.criadoEm)}</td>
                  <td>
                    <button
                      type="button"
                      className="billing-icon-button"
                      onClick={() => abrirFaturamento(faturamento.id)}
                    >
                      <Eye size={16} />
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {faturamentosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="9">Nenhum faturamento encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {faturamentoId && (
        <div className="modal-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !acaoEmAndamento) fecharDetalhe();
        }}>
          <div className="billing-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="billing-detail-header">
              <div>
                <h2>Detalhe do Faturamento</h2>
                <p>{loadingDetalhe ? "Carregando..." : faturamentoSelecionado?.origem?.numeroDocumento || "-"}</p>
              </div>
              <button type="button" className="billing-secondary-button" onClick={fecharDetalhe} disabled={Boolean(acaoEmAndamento)}>
                Fechar
              </button>
            </div>

            {faturamentoSelecionado && (
              <>
                <section className="billing-detail-section">
                  <h3>Dados Gerais</h3>
                  <div className="billing-info-grid">
                    {renderInfo("Origem", formatarOrigemFaturamento(faturamentoSelecionado.origem))}
                    {renderInfo("Número", faturamentoSelecionado.origem?.numeroDocumento)}
                    {renderInfo("Data da operação", dataBR(operacaoSelecionada.dataOperacao))}
                    {renderInfo("Segmento", operacaoSelecionada.segmento)}
                    {renderInfo("Status", formatarStatusFaturamento(faturamentoSelecionado.status))}
                    {renderInfo("Valor bruto", moedaBR(faturamentoSelecionado.totais?.valorBruto))}
                    {renderInfo("Desconto", moedaBR(faturamentoSelecionado.totais?.desconto))}
                    {renderInfo("Valor líquido", moedaBR(faturamentoSelecionado.totais?.valorLiquido))}
                  </div>
                </section>

                <section className="billing-detail-section">
                  <h3>Emitente</h3>
                  <div className="billing-info-grid">
                    {renderInfo("CNPJ", faturamentoSelecionado.contextoFiscal?.emitente?.cnpj)}
                    {renderInfo("Regime tributário", faturamentoSelecionado.contextoFiscal?.emitente?.regimeTributario)}
                    {renderInfo("UF", faturamentoSelecionado.contextoFiscal?.emitente?.uf)}
                    {renderInfo("Município", faturamentoSelecionado.contextoFiscal?.emitente?.municipio)}
                    {renderInfo("Ambiente fiscal", faturamentoSelecionado.contextoFiscal?.emitente?.ambienteFiscal)}
                  </div>
                </section>

                <section className="billing-detail-section">
                  <h3>Destinatário</h3>
                  <div className="billing-info-grid">
                    {renderInfo("Nome", faturamentoSelecionado.contextoFiscal?.destinatario?.nome)}
                    {renderInfo("Documento", faturamentoSelecionado.contextoFiscal?.destinatario?.documento)}
                    {renderInfo("E-mail", faturamentoSelecionado.contextoFiscal?.destinatario?.email)}
                    {renderInfo("Telefone", faturamentoSelecionado.contextoFiscal?.destinatario?.telefone)}
                    {renderInfo("Endereço", faturamentoSelecionado.contextoFiscal?.destinatario?.endereco)}
                    {renderInfo("Cidade/UF", [
                      faturamentoSelecionado.contextoFiscal?.destinatario?.cidade,
                      faturamentoSelecionado.contextoFiscal?.destinatario?.uf,
                    ].filter(Boolean).join("/"))}
                  </div>
                </section>

                <section className="billing-detail-section">
                  <h3>Itens</h3>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th>Qtd</th>
                          <th>Unidade</th>
                          <th>Unitário</th>
                          <th>Desconto</th>
                          <th>Total</th>
                          <th>NCM</th>
                          <th>Unidade tributável</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(faturamentoSelecionado.itens || []).map((item, index) => (
                          <tr key={`${item.origemItemId || item.descricao}-${index}`}>
                            <td>{item.descricao || "-"}</td>
                            <td>{numeroBR(item.quantidade, 3)}</td>
                            <td>{item.unidade || "-"}</td>
                            <td>{moedaBR(item.valorUnitario)}</td>
                            <td>{moedaBR(item.desconto)}</td>
                            <td>{moedaBR(item.total)}</td>
                            <td>{item.fiscalSnapshot?.ncm || "-"}</td>
                            <td>{item.fiscalSnapshot?.unidadeTributavel || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="billing-detail-section">
                  <h3>Contexto Fiscal da Operação</h3>
                  <div className="billing-context-grid">
                    <label>
                      <span>Finalidade</span>
                      <input value="Operação normal" readOnly />
                    </label>
                    <label>
                      <span>Presença do comprador</span>
                      <select
                        value={formContexto.presencaComprador}
                        onChange={(e) => atualizarContexto("presencaComprador", e.target.value)}
                        disabled={detalheSomenteLeitura}
                      >
                        <option value="">Selecione</option>
                        <option value={PRESENCAS_COMPRADOR.PRESENCIAL}>Presencial</option>
                        <option value={PRESENCAS_COMPRADOR.INTERNET}>Internet</option>
                        <option value={PRESENCAS_COMPRADOR.TELEFONE}>Telefone</option>
                        <option value={PRESENCAS_COMPRADOR.ENTREGA_DOMICILIO}>Entrega em domicílio</option>
                        <option value={PRESENCAS_COMPRADOR.NAO_PRESENCIAL_OUTROS}>Não presencial - outros</option>
                      </select>
                    </label>
                    <label>
                      <span>Consumidor final?</span>
                      <select
                        value={formContexto.consumidorFinal}
                        onChange={(e) => atualizarContexto("consumidorFinal", e.target.value)}
                        disabled={detalheSomenteLeitura}
                      >
                        <option value="">Não informado</option>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                      </select>
                    </label>
                    <label>
                      <span>Indicador IE</span>
                      <select
                        value={formContexto.indicadorIEDestinatario}
                        onChange={(e) => atualizarContexto("indicadorIEDestinatario", e.target.value)}
                        disabled={detalheSomenteLeitura}
                      >
                        <option value="">Selecione</option>
                        <option value={INDICADORES_IE_DESTINATARIO.CONTRIBUINTE}>Contribuinte do ICMS</option>
                        <option value={INDICADORES_IE_DESTINATARIO.CONTRIBUINTE_ISENTO}>Contribuinte isento</option>
                        <option value={INDICADORES_IE_DESTINATARIO.NAO_CONTRIBUINTE}>Não contribuinte</option>
                      </select>
                    </label>
                    <label>
                      <span>Destino da operação</span>
                      <input value={formatarDestinoOperacao(operacaoSelecionada.destinoOperacao)} readOnly />
                    </label>
                    <label className="billing-context-nature">
                      <span>Natureza da operação</span>
                      <input
                        placeholder="Ex.: Venda de mercadoria"
                        value={formContexto.naturezaOperacao}
                        onChange={(e) => atualizarContexto("naturezaOperacao", e.target.value)}
                        disabled={detalheSomenteLeitura}
                      />
                    </label>
                  </div>

                  {statusSelecionado === "preparado" && (
                    <p className="billing-state-note">
                      Preparado em {dataBR(faturamentoSelecionado.preparadoEm)} por {textoOpcional(faturamentoSelecionado.preparadoPor)}.
                    </p>
                  )}
                  {statusSelecionado === "cancelado" && (
                    <p className="billing-state-note">
                      Cancelado em {dataBR(faturamentoSelecionado.canceladoEm)} por {textoOpcional(faturamentoSelecionado.canceladoPor)}.
                      Motivo: {textoOpcional(faturamentoSelecionado.motivoCancelamento)}
                    </p>
                  )}
                </section>

                <section className="billing-detail-section">
                  <h3>Determinação Fiscal</h3>
                  {determinacaoFiscalSelecionada ? (
                    <>
                      <div className="billing-info-grid billing-tax-summary">
                        {renderInfo("Versão", determinacaoFiscalSelecionada.versao)}
                        {renderInfo("Regra", determinacaoFiscalSelecionada.regraVersao)}
                        {renderInfo(
                          "Destino",
                          formatarDestinoFiscal(
                            determinacaoFiscalSelecionada.operacao?.destinoOperacao
                          )
                        )}
                        {renderInfo(
                          "Finalidade",
                          formatarFinalidadeFiscal(
                            determinacaoFiscalSelecionada.operacao?.finalidadeOperacao
                          )
                        )}
                        {renderInfo(
                          "Consumidor final",
                          formatarConsumidorFinalFiscal(
                            determinacaoFiscalSelecionada.operacao?.consumidorFinal
                          )
                        )}
                        {renderInfo(
                          "Indicador IE",
                          formatarIndicadorIEFiscal(
                            determinacaoFiscalSelecionada.operacao?.indicadorIEDestinatario
                          )
                        )}
                      </div>

                      <div className="table-wrapper billing-tax-table-wrapper">
                        <table className="billing-tax-table">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Classificação</th>
                              <th>CFOP</th>
                              <th>Regra/Fonte</th>
                              <th>Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(determinacaoFiscalSelecionada.itens || []).map((itemDeterminado, index) => {
                              const itemOrigem = obterItemOrigemDeterminacao(itemDeterminado);
                              const situacao = obterSituacaoDeterminacaoItem(itemDeterminado);
                              const pendenciasItem = Array.isArray(itemDeterminado.pendencias)
                                ? itemDeterminado.pendencias
                                : [];

                              return (
                                <tr key={`${itemDeterminado.origemItemId || "item"}-${index}`}>
                                  <td data-label="Item">
                                    <span className="billing-tax-item-name">
                                      {itemOrigem.descricao || `Item ${index + 1}`}
                                    </span>
                                  </td>
                                  <td data-label="Classificação">
                                    {formatarOrigemProdutoFiscal(
                                      itemOrigem.fiscalSnapshot?.origemProduto
                                    )}
                                  </td>
                                  <td data-label="CFOP">{itemDeterminado.cfopEfetivo || "-"}</td>
                                  <td data-label="Regra/Fonte">
                                    {formatarFonteCfop(itemDeterminado.fonteCfop)}
                                  </td>
                                  <td data-label="Situação">
                                    <span className={`billing-tax-status ${situacao}`}>
                                      {formatarSituacaoDeterminacaoItem(situacao)}
                                    </span>
                                    {renderPendenciasFiscais(pendenciasItem)}
                                  </td>
                                </tr>
                              );
                            })}
                            {(determinacaoFiscalSelecionada.itens || []).length === 0 && (
                              <tr>
                                <td colSpan="5">Nenhum item determinado.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="billing-tax-pendencies">
                        <h4>Pendências fiscais</h4>
                        {pendenciasFiscaisSelecionadas.length > 0 ? (
                          <ul className="billing-pendency-list">
                            {descreverPendenciasDeterminacaoFiscal(
                              pendenciasFiscaisSelecionadas
                            ).map((descricao) => (
                              <li key={descricao}>{descricao}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="billing-empty-note">Sem pendências fiscais.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="billing-empty-note">
                      Determinação fiscal ainda não realizada.
                    </p>
                  )}
                </section>

                <section className="billing-detail-section">
                  <h3>Pendências</h3>
                  {pendenciasSelecionadas.length > 0 ? (
                    <ul className="billing-pendency-list">
                      {pendenciasSelecionadas.map((pendencia) => (
                        <li key={pendencia}>{descreverPendenciaFaturamento(pendencia)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="billing-empty-note">Nenhuma pendência registrada.</p>
                  )}
                </section>

                {statusSelecionado !== "cancelado" && (
                  <section className="billing-detail-section">
                    <h3>Cancelamento</h3>
                    <textarea
                      placeholder="Motivo opcional do cancelamento"
                      value={motivoCancelamento}
                      onChange={(e) => setMotivoCancelamento(e.target.value)}
                      disabled={!podeCancelar || Boolean(acaoEmAndamento)}
                    />
                  </section>
                )}

                <div className="billing-detail-actions">
                  {statusSelecionado === "rascunho" && podeEditarContexto && (
                    <button type="button" onClick={salvarContexto} disabled={Boolean(acaoEmAndamento)}>
                      Salvar contexto
                    </button>
                  )}
                  {statusSelecionado === "rascunho" && podeDeterminarFiscal && (
                    <button
                      type="button"
                      onClick={determinarFiscal}
                      disabled={Boolean(acaoEmAndamento)}
                    >
                      {acaoEmAndamento === "determinar-fiscal"
                        ? "Determinando..."
                        : "Determinar fiscal"}
                    </button>
                  )}
                  {statusSelecionado === "rascunho" && podeEditarContexto && (
                    <button type="button" onClick={preparar} disabled={Boolean(acaoEmAndamento)}>
                      Preparar faturamento
                    </button>
                  )}
                  {["rascunho", "preparado"].includes(statusSelecionado) && podeCancelar && (
                    <button
                      type="button"
                      className="billing-danger-button"
                      onClick={cancelar}
                      disabled={Boolean(acaoEmAndamento)}
                    >
                      Cancelar faturamento
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {tooltipPendencias && (
        <div
          id="billing-pendency-floating-tooltip"
          role="tooltip"
          className={`billing-pendency-floating-tooltip ${tooltipPendencias.posicao}`}
          style={{
            left: tooltipPendencias.left,
            top: tooltipPendencias.top,
            width: tooltipPendencias.width,
          }}
        >
          {tooltipPendencias.conteudo}
        </div>
      )}
    </div>
  );
}
