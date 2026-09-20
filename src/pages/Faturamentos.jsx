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
  classificarTributacaoFaturamento as solicitarClassificacaoTributaria,
  determinarFiscalFaturamento as solicitarDeterminacaoFiscal,
  listarFaturamentos,
  listarCatalogoServicos,
  listarCatalogoTributario,
  obterFaturamento,
  prepararFaturamento,
  salvarContextoOperacional,
  salvarClassificacaoManual,
  salvarContextoServico,
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
  descreverPendenciasClassificacaoTributaria,
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
  formatarSituacaoClassificacaoTributariaItem,
  formatarSituacaoDeterminacaoItem,
  formatarStatusFaturamento,
  obterSituacaoClassificacaoTributariaItem,
  obterSituacaoDeterminacaoItem,
} from "../utils/faturamentoUi";

const CONTEXTO_FORM_INICIAL = {
  finalidadeOperacao: FINALIDADES_OPERACAO.NORMAL,
  presencaComprador: "",
  consumidorFinal: "",
  indicadorIEDestinatario: "",
  naturezaOperacao: "",
};

const SERVICO_FORM_INICIAL = {
  competenciaFiscal: "", codigoMunicipio: "", municipio: "", uf: "",
  codigoTributacaoNacional: "", codigoTributacaoMunicipal: "", nbs: "", descricaoFiscal: "",
  confirmarLocal: false, confirmarClassificacao: false,
};

const obterFormServico = (faturamento) => {
  const contexto = faturamento?.contextoFiscalServico || {};
  const local = contexto.localPrestacaoFiscal || faturamento?.contextoFiscal?.operacao?.localPrestacao || {};
  const classificacao = contexto.classificacaoFiscalServico || faturamento?.itens?.[0]?.fiscalServicoSnapshot || {};
  return {
    competenciaFiscal: faturamento?.contextoFiscal?.operacao?.competenciaFiscal || "",
    codigoMunicipio: local.codigoMunicipio || "", municipio: local.municipio || "", uf: local.uf || "",
    codigoTributacaoNacional: classificacao.codigoTributacaoNacional || "",
    codigoTributacaoMunicipal: classificacao.codigoTributacaoMunicipal || "",
    nbs: classificacao.nbs || "", descricaoFiscal: classificacao.descricaoFiscal || "",
    confirmarLocal: false, confirmarClassificacao: false,
  };
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

const formatarFonteTributaria = (fonte) => {
  if (!fonte) return "-";
  if (typeof fonte === "string") return textoOpcional(fonte);
  if (typeof fonte !== "object") return "-";

  return [fonte.tipo, fonte.codigo, fonte.versao]
    .map((valor) => texto(valor))
    .filter(Boolean)
    .join(" / ") || "-";
};

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
  const [formServico, setFormServico] = useState(SERVICO_FORM_INICIAL);
  const [catalogoTributario, setCatalogoTributario] = useState(null);
  const [catalogoServicos, setCatalogoServicos] = useState(null);
  const [classificacoesForm, setClassificacoesForm] = useState({});

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
  const podeRevisarServico = podeCancelar;

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
    setFormServico(SERVICO_FORM_INICIAL);
    setCatalogoServicos(null);
    setClassificacoesForm({});
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
      setFormServico(faturamento ? obterFormServico(faturamento) : SERVICO_FORM_INICIAL);
      setClassificacoesForm(Object.fromEntries((faturamento?.classificacaoTributaria?.itens || [])
        .filter((item) => item.origemClassificacao === "manual")
        .map((item) => [item.indice, { cst: item.ibsCbs?.cst || "",
          cClassTrib: item.ibsCbs?.cClassTrib || "", observacao: item.observacao || "" }])));
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

  useEffect(() => {
    if (!empresaId || !faturamentoId) return;
    let ativo = true;
    listarCatalogoTributario({ empresaId })
      .then((data) => { if (ativo) setCatalogoTributario(data); })
      .catch(() => { if (ativo) setCatalogoTributario(null); });
    return () => { ativo = false; };
  }, [empresaId, faturamentoId]);

  const faturamentosFiltrados = useMemo(
    () => filtrarFaturamentos(faturamentos, filtros),
    [faturamentos, filtros]
  );
  const kpis = useMemo(() => calcularKpisFaturamento(faturamentos), [faturamentos]);
  const statusSelecionado = texto(faturamentoSelecionado?.status || "rascunho").toLowerCase();
  const isServico = faturamentoSelecionado?.origem?.tipo === "atendimento" ||
    faturamentoSelecionado?.itens?.some((item) => item.tipoItem === "servico");
  useEffect(() => {
    if (!empresaId || !faturamentoId || !isServico) return undefined;
    let ativo = true;
    listarCatalogoServicos({ empresaId })
      .then((data) => { if (ativo) setCatalogoServicos(data); })
      .catch(() => { if (ativo) setCatalogoServicos(null); });
    return () => { ativo = false; };
  }, [empresaId, faturamentoId, isServico]);
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
  const classificacaoTributariaSelecionada =
    faturamentoSelecionado?.classificacaoTributaria &&
    typeof faturamentoSelecionado.classificacaoTributaria === "object"
      ? faturamentoSelecionado.classificacaoTributaria
      : null;
  const pendenciasTributariasSelecionadas = Array.isArray(
    classificacaoTributariaSelecionada?.pendencias
  )
    ? classificacaoTributariaSelecionada.pendencias
    : [];

  const atualizarFiltro = (campo, valor) => {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  };

  const atualizarContexto = (campo, valor) => {
    setFormContexto((atual) => ({ ...atual, [campo]: valor }));
  };

  const salvarRevisaoServico = async () => {
    if (!empresaId || !faturamentoSelecionado?.id || !podeRevisarServico ||
        statusSelecionado !== "rascunho" || acaoEmAndamento) return;
    const revisao = {};
    if (formServico.competenciaFiscal) revisao.competenciaFiscal = formServico.competenciaFiscal;
    if (formServico.confirmarLocal) {
      revisao.localPrestacaoFiscal = {
        tipo: "brasil", codigoMunicipio: formServico.codigoMunicipio,
        municipio: formServico.municipio, uf: formServico.uf.toUpperCase(), codigoPais: "BR",
      };
    }
    if (formServico.confirmarClassificacao) {
      revisao.classificacaoFiscalServico = {
        codigoTributacaoNacional: formServico.codigoTributacaoNacional,
        codigoTributacaoMunicipal: formServico.codigoTributacaoMunicipal,
        nbs: formServico.nbs, descricaoFiscal: formServico.descricaoFiscal,
      };
    }
    if (Object.keys(revisao).length === 0) {
      showToast("Informe ao menos um dado fiscal para confirmar.", "warning");
      return;
    }
    setAcaoEmAndamento("contexto-servico");
    try {
      await salvarContextoServico({ empresaId, faturamentoId: faturamentoSelecionado.id, revisao });
      showToast("Contexto fiscal do serviço salvo.", "success");
      await carregarLista();
      await carregarDetalhe(faturamentoSelecionado.id);
    } catch (error) {
      showToast(error.message || "Não foi possível salvar o contexto fiscal.", "error");
    } finally {
      setAcaoEmAndamento("");
    }
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
      "Após preparar, os dados da operação e os dados fiscais registrados não poderão ser alterados. Deseja continuar?"
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

  const classificarTributacao = async () => {
    if (!empresaId || !faturamentoSelecionado?.id || acaoEmAndamento) return;

    setAcaoEmAndamento("classificar-tributacao");
    try {
      await solicitarClassificacaoTributaria({
        empresaId,
        faturamentoId: faturamentoSelecionado.id,
      });
      showToast("Classificação tributária realizada com sucesso.", "success");
      await carregarLista();
      await carregarDetalhe(faturamentoSelecionado.id);
    } catch (error) {
      showToast(error.message || "Não foi possível classificar tributariamente o faturamento.", "error");
    } finally {
      setAcaoEmAndamento("");
    }
  };

  const atualizarClassificacaoForm = (indice, campo, valor) => {
    setClassificacoesForm((atual) => ({ ...atual, [indice]: {
      ...atual[indice], [campo]: valor,
      ...(campo === "cst" ? { cClassTrib: "" } : {}),
    } }));
  };

  const salvarClassificacoes = async () => {
    if (!empresaId || !faturamentoSelecionado?.id || acaoEmAndamento) return;
    if (Object.values(classificacoesForm).some((form) => Boolean(form.cst) !== Boolean(form.cClassTrib))) {
      showToast("Selecione CST e classificação para cada item preenchido.", "warning");
      return;
    }
    const itens = Object.entries(classificacoesForm)
      .filter(([, form]) => form.cst && form.cClassTrib)
      .map(([indice, form]) => ({ indice: Number(indice),
        origemItemId: faturamentoSelecionado.itens[Number(indice)]?.origemItemId || "",
        cst: form.cst, cClassTrib: form.cClassTrib, observacao: form.observacao || "" }));
    if (itens.length === 0) {
      showToast("Selecione CST e classificação para ao menos um item.", "warning");
      return;
    }
    setAcaoEmAndamento("classificacao-manual");
    try {
      await salvarClassificacaoManual({ empresaId, faturamentoId: faturamentoSelecionado.id, itens });
      showToast("Classificação informada com sucesso.", "success");
      await carregarDetalhe(faturamentoSelecionado.id);
    } catch (error) {
      showToast(error.message || "Não foi possível salvar a classificação.", "error");
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

  const renderPendenciasTributarias = (pendencias = []) => {
    const lista = Array.isArray(pendencias) ? pendencias : [];

    if (lista.length === 0) return null;

    return (
      <ul className="billing-tax-pendency-list">
        {descreverPendenciasClassificacaoTributaria(lista).map((descricao) => (
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
          <p>Organize rascunhos fiscais e suas pendências, sem emitir documentos fiscais.</p>
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
                    {!isServico && renderInfo("Número", faturamentoSelecionado.origem?.numeroDocumento)}
                    {renderInfo("Data da operação", dataBR(operacaoSelecionada.dataOperacao))}
                    {renderInfo("Segmento", operacaoSelecionada.segmento)}
                    {renderInfo("Status", formatarStatusFaturamento(faturamentoSelecionado.status))}
                    {renderInfo("Valor bruto", moedaBR(faturamentoSelecionado.totais?.valorBruto))}
                    {renderInfo("Desconto", moedaBR(faturamentoSelecionado.totais?.desconto))}
                    {renderInfo("Valor líquido", moedaBR(faturamentoSelecionado.totais?.valorLiquido))}
                  </div>
                </section>

                <section className="billing-detail-section">
                  <h3>{isServico ? "Prestador" : "Emitente"}</h3>
                  <div className="billing-info-grid">
                    {renderInfo("CNPJ", faturamentoSelecionado.contextoFiscal?.emitente?.cnpj)}
                    {isServico && renderInfo("Inscrição municipal", faturamentoSelecionado.contextoFiscal?.emitente?.inscricaoMunicipal)}
                    {renderInfo("Regime tributário", faturamentoSelecionado.contextoFiscal?.emitente?.regimeTributario)}
                    {renderInfo("UF", faturamentoSelecionado.contextoFiscal?.emitente?.uf)}
                    {renderInfo("Município", faturamentoSelecionado.contextoFiscal?.emitente?.municipio)}
                    {renderInfo("Ambiente fiscal", faturamentoSelecionado.contextoFiscal?.emitente?.ambienteFiscal)}
                  </div>
                </section>

                <section className="billing-detail-section">
                  <h3>{isServico ? "Tomador" : "Destinatário"}</h3>
                  <div className="billing-info-grid">
                    {renderInfo("Nome", faturamentoSelecionado.contextoFiscal?.destinatario?.nome)}
                    {isServico ? (
                      <>
                        {renderInfo("CPF", faturamentoSelecionado.contextoFiscal?.destinatario?.cpf)}
                        {renderInfo("CNPJ", faturamentoSelecionado.contextoFiscal?.destinatario?.cnpj)}
                      </>
                    ) : renderInfo("Documento", faturamentoSelecionado.contextoFiscal?.destinatario?.documento)}
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
                  <h3>{isServico ? "Serviço" : "Itens"}</h3>
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
                          {!isServico && <th>NCM</th>}
                          {!isServico && <th>Unidade tributável</th>}
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
                            {!isServico && <td>{item.fiscalSnapshot?.ncm || "-"}</td>}
                            {!isServico && <td>{item.fiscalSnapshot?.unidadeTributavel || "-"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {isServico && <section className="billing-detail-section">
                  <h3>Contexto Fiscal do Serviço</h3>
                  <div className="billing-info-grid">
                    {renderInfo("Competência operacional", dataBR(operacaoSelecionada.competenciaOperacional))}
                    {renderInfo("Competência fiscal", operacaoSelecionada.competenciaFiscal ? dataBR(operacaoSelecionada.competenciaFiscal) : "Não informado")}
                    {renderInfo("Local histórico da prestação", operacaoSelecionada.localPrestacao
                      ? `${operacaoSelecionada.localPrestacao.municipio || ""}/${operacaoSelecionada.localPrestacao.uf || ""} (${operacaoSelecionada.localPrestacao.codigoMunicipio || ""})`
                      : "Não informado")}
                    {renderInfo("Local fiscal confirmado", faturamentoSelecionado.contextoFiscalServico?.localPrestacaoFiscal
                      ? `${faturamentoSelecionado.contextoFiscalServico.localPrestacaoFiscal.municipio}/${faturamentoSelecionado.contextoFiscalServico.localPrestacaoFiscal.uf} (${faturamentoSelecionado.contextoFiscalServico.localPrestacaoFiscal.codigoMunicipio})`
                      : "Não informado")}
                    {renderInfo("Código nacional do snapshot", faturamentoSelecionado.itens?.[0]?.fiscalServicoSnapshot?.codigoTributacaoNacional || "Não informado")}
                    {renderInfo("Código municipal do snapshot", faturamentoSelecionado.itens?.[0]?.fiscalServicoSnapshot?.codigoTributacaoMunicipal || "Não informado")}
                    {renderInfo("NBS do snapshot", faturamentoSelecionado.itens?.[0]?.fiscalServicoSnapshot?.nbs || "Não informado")}
                    {renderInfo("Descrição fiscal do snapshot", faturamentoSelecionado.itens?.[0]?.fiscalServicoSnapshot?.descricaoFiscal || "Não informado")}
                    {renderInfo("Código nacional confirmado", faturamentoSelecionado.contextoFiscalServico?.classificacaoFiscalServico?.codigoTributacaoNacional || "Não informado")}
                    {renderInfo("Código municipal confirmado", faturamentoSelecionado.contextoFiscalServico?.classificacaoFiscalServico?.codigoTributacaoMunicipal || "Não informado")}
                    {renderInfo("NBS confirmada", faturamentoSelecionado.contextoFiscalServico?.classificacaoFiscalServico?.nbs || "Não informado")}
                    {renderInfo("Descrição fiscal confirmada", faturamentoSelecionado.contextoFiscalServico?.classificacaoFiscalServico?.descricaoFiscal || "Não informado")}
                    {renderInfo("Confirmação", faturamentoSelecionado.contextoFiscalServico?.classificacaoFiscalServico?.confirmadoPor
                      ? `Manual por ${faturamentoSelecionado.contextoFiscalServico.classificacaoFiscalServico.confirmadoPor}` : "Não informado")}
                  </div>
                  {statusSelecionado === "rascunho" && podeRevisarServico && <details
                    open={faturamentoSelecionado?.origem?.tipo === "atendimento" && pendenciasSelecionadas.length > 0}
                  >
                    <summary>Revisar contexto fiscal</summary>
                    <p>Os dados históricos abaixo são sugestões e somente serão confirmados mediante sua seleção.</p>
                    <p>Classificação manual sem validação por catálogo oficial.</p>
                    <div className="billing-context-grid">
                      <label>Data efetiva da prestação
                        <input type="date" value={formServico.competenciaFiscal}
                          onChange={(event) => setFormServico((atual) => ({ ...atual, competenciaFiscal: event.target.value }))} />
                      </label>
                      <label className="billing-service-confirm"><input type="checkbox" checked={formServico.confirmarLocal}
                        onChange={(event) => setFormServico((atual) => ({ ...atual, confirmarLocal: event.target.checked }))} />
                        Confirmar local fiscal
                      </label>
                      <label className="billing-service-confirm"><input type="checkbox" checked={formServico.confirmarClassificacao}
                        onChange={(event) => setFormServico((atual) => ({ ...atual, confirmarClassificacao: event.target.checked }))} />
                        Confirmar classificação manual
                      </label>
                      <label>Código de Tributação Nacional
                        <input
                          list="catalogo-servicos-nfse"
                          value={formServico.codigoTributacaoNacional}
                          onChange={(event) => setFormServico((atual) => ({
                            ...atual, codigoTributacaoNacional: event.target.value,
                          }))}
                        />
                        <datalist id="catalogo-servicos-nfse">
                          {(catalogoServicos?.itens || []).map((item) => <option
                            key={item.codigoTributacaoNacional}
                            value={item.codigoTributacaoNacional}
                          >{item.descricao}</option>)}
                        </datalist>
                        <small>{catalogoServicos
                          ? `Catálogo oficial ${catalogoServicos.versao}`
                          : "Catálogo oficial indisponível para consulta."}</small>
                      </label>
                      {[
                        ["codigoMunicipio", "Código IBGE do local fiscal"], ["municipio", "Município da prestação"],
                        ["uf", "UF da prestação"],
                        ["codigoTributacaoMunicipal", "Código de Tributação Municipal"], ["nbs", "NBS"],
                        ["descricaoFiscal", "Descrição fiscal"],
                      ].map(([campo, label]) => <label key={campo}>{label}
                        <input value={formServico[campo]} onChange={(event) =>
                          setFormServico((atual) => ({ ...atual, [campo]: event.target.value }))} />
                      </label>)}
                    </div>
                    <button type="button" onClick={salvarRevisaoServico} disabled={Boolean(acaoEmAndamento)}>
                      Confirmar revisão fiscal
                    </button>
                  </details>}
                </section>}

                {!isServico && <section className="billing-detail-section">
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
                </section>}

                {!isServico && <section className="billing-detail-section">
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
                </section>}

                {!isServico && <section className="billing-detail-section">
                  <h3>Classificação Tributária</h3>
                  {statusSelecionado === "rascunho" && podeDeterminarFiscal && (
                    <div className="billing-manual-classification">
                      <p>A classificação deve seguir o enquadramento fiscal da operação. O Renovar ERP valida códigos e vigência, mas não define o enquadramento.</p>
                      {!catalogoTributario && <p>Não foi possível carregar o catálogo tributário.</p>}
                      {(faturamentoSelecionado.itens || []).map((item, indice) => {
                        const form = classificacoesForm[indice] || {};
                        return (
                          <div className="billing-manual-item" key={`${item.origemItemId || "item"}-${indice}`}>
                            <strong>{item.descricao || `Item ${indice + 1}`}</strong>
                            <span>NCM: {item.fiscalSnapshot?.ncm || "-"} · CFOP: {determinacaoFiscalSelecionada?.itens?.find((atual) => atual.indice === indice)?.cfopEfetivo || "-"}</span>
                            <div className="billing-manual-fields">
                              <label>CST IBS/CBS
                                <select value={form.cst || ""} onChange={(event) => atualizarClassificacaoForm(indice, "cst", event.target.value)} disabled={!catalogoTributario || Boolean(acaoEmAndamento)}>
                                  <option value="">Selecione</option>
                                  {(catalogoTributario?.csts || []).map((cst) => <option key={cst.cst} value={cst.cst}>{cst.cst} - {cst.nome}</option>)}
                                </select>
                              </label>
                              <label>Classificação (cClassTrib)
                                <select value={form.cClassTrib || ""} onChange={(event) => atualizarClassificacaoForm(indice, "cClassTrib", event.target.value)} disabled={!form.cst || Boolean(acaoEmAndamento)}>
                                  <option value="">Selecione</option>
                                  {(catalogoTributario?.itens || []).filter((opcao) => opcao.cst === form.cst).map((opcao) =>
                                    <option key={opcao.cClassTrib} value={opcao.cClassTrib}>{opcao.cClassTrib} - {opcao.descricao}</option>)}
                                </select>
                              </label>
                              <label>Observação
                                <input maxLength={500} value={form.observacao || ""} onChange={(event) => atualizarClassificacaoForm(indice, "observacao", event.target.value)} />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                      <button type="button" onClick={salvarClassificacoes} disabled={!catalogoTributario || Boolean(acaoEmAndamento)}>
                        {acaoEmAndamento === "classificacao-manual" ? "Salvando..." : "Salvar classificação"}
                      </button>
                    </div>
                  )}
                  {classificacaoTributariaSelecionada ? (
                    <>
                      <div className="billing-info-grid billing-tax-summary">
                        {renderInfo("Versão", classificacaoTributariaSelecionada.versao)}
                        {renderInfo("Regra", classificacaoTributariaSelecionada.regraVersao)}
                      </div>

                      <div className="table-wrapper billing-tax-table-wrapper">
                        <table className="billing-tax-table billing-tax-classification-table">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>CST IBS/CBS</th>
                              <th>cClassTrib</th>
                              <th>Fonte</th>
                              <th>Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(classificacaoTributariaSelecionada.itens || []).map((itemClassificado, index) => {
                              const itemOrigem = obterItemOrigemDeterminacao(itemClassificado);
                              const situacao = obterSituacaoClassificacaoTributariaItem(itemClassificado);
                              const pendenciasItem = Array.isArray(itemClassificado.pendencias)
                                ? itemClassificado.pendencias
                                : [];

                              return (
                                <tr key={`${itemClassificado.origemItemId || "item"}-${index}`}>
                                  <td data-label="Item">
                                    <span className="billing-tax-item-name">
                                      {itemOrigem.descricao || `Item ${index + 1}`}
                                    </span>
                                  </td>
                                  <td data-label="CST IBS/CBS">
                                    {itemClassificado.ibsCbs?.cst || "-"}
                                  </td>
                                  <td data-label="cClassTrib">
                                    {itemClassificado.ibsCbs?.cClassTrib || "-"}
                                    {itemClassificado.ibsCbs?.cClassTrib && (() => {
                                      const opcao = (catalogoTributario?.itens || []).find((atual) =>
                                        atual.cClassTrib === itemClassificado.ibsCbs.cClassTrib);
                                      return opcao ? <small>{opcao.descricao} · Vigência: {dataBR(opcao.inicioVigencia)} a {opcao.fimVigencia ? dataBR(opcao.fimVigencia) : "sem fim informado"}</small> : null;
                                    })()}
                                  </td>
                                  <td data-label="Fonte">
                                    {itemClassificado.origemClassificacao === "manual" ? "Informado manualmente" : formatarFonteTributaria(itemClassificado.ibsCbs?.fonte)}
                                    {itemClassificado.origemClassificacao === "manual" && (
                                      <small>Classificado por {itemClassificado.atualizadoPor || itemClassificado.classificadoPor || "-"} em {dataBR(itemClassificado.atualizadoEm || itemClassificado.classificadoEm)}. {itemClassificado.observacao || ""}</small>
                                    )}
                                  </td>
                                  <td data-label="Situação">
                                    <span className={`billing-tax-status ${situacao}`}>
                                      {formatarSituacaoClassificacaoTributariaItem(situacao)}
                                    </span>
                                    {renderPendenciasTributarias(pendenciasItem)}
                                  </td>
                                </tr>
                              );
                            })}
                            {(classificacaoTributariaSelecionada.itens || []).length === 0 && (
                              <tr>
                                <td colSpan="5">Nenhum item classificado.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="billing-tax-pendencies">
                        <h4>Pendências tributárias</h4>
                        {pendenciasTributariasSelecionadas.length > 0 ? (
                          <ul className="billing-pendency-list">
                            {descreverPendenciasClassificacaoTributaria(
                              pendenciasTributariasSelecionadas
                            ).map((descricao) => (
                              <li key={descricao}>{descricao}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="billing-empty-note">Sem pendências tributárias.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="billing-empty-note">
                      Classificação tributária ainda não realizada.
                    </p>
                  )}
                </section>}

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
                  {statusSelecionado === "rascunho" && podeEditarContexto && !isServico && (
                    <button type="button" onClick={salvarContexto} disabled={Boolean(acaoEmAndamento)}>
                      Salvar contexto
                    </button>
                  )}
                  {statusSelecionado === "rascunho" && podeDeterminarFiscal && !isServico && (
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
                  {statusSelecionado === "rascunho" && podeDeterminarFiscal && !isServico && !classificacaoTributariaSelecionada?.itens?.some((item) => item.origemClassificacao === "manual") && (
                    <button
                      type="button"
                      onClick={classificarTributacao}
                      disabled={Boolean(acaoEmAndamento)}
                    >
                      {acaoEmAndamento === "classificar-tributacao"
                        ? "Classificando..."
                        : "Classificar tributação"}
                    </button>
                  )}
                  {statusSelecionado === "rascunho" && podeEditarContexto && !isServico && (
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
