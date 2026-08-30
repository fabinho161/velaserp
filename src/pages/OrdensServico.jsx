import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ClipboardList, Filter, Package, Plus, Search, Wrench } from "lucide-react";
import ActionMenu from "../components/ActionMenu";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { db } from "../firebase";
import { calcularEstoqueProdutos } from "../utils/estoqueProdutos";
import { useConfirmacao } from "../context/useConfirmacao";
import { moedaBR } from "../utils/formatters";
import { gerarOrdemServicoPDF } from "../utils/ordemServicoPdf";

const STATUS_OS = [
  { valor: "aberta", label: "Aberta", classe: "badge-info" },
  { valor: "aguardando_aprovacao", label: "Aguardando aprovacao", classe: "badge-warning" },
  { valor: "aprovada", label: "Aprovada", classe: "badge-purple" },
  { valor: "em_execucao", label: "Em execucao", classe: "badge-info" },
  { valor: "concluida", label: "Concluida", classe: "badge-success" },
  { valor: "encerrada", label: "Encerrada", classe: "badge-purple" },
  { valor: "cancelada", label: "Cancelada", classe: "badge-danger" },
];

const STATUS_VALIDOS = new Set(STATUS_OS.map((status) => status.valor));
const STATUS_EDICAO_OS = STATUS_OS.filter((status) => status.valor !== "encerrada");
const STATUS_PAGAMENTO_OS = [
  { valor: "pendente", label: "Pendente" },
  { valor: "pago", label: "Pago" },
];
const STATUS_PAGAMENTO_VALIDOS = new Set(
  STATUS_PAGAMENTO_OS.map((status) => status.valor)
);
const FORMAS_PAGAMENTO_OS = [
  { valor: "", label: "Nao informado" },
  { valor: "dinheiro", label: "Dinheiro" },
  { valor: "pix", label: "PIX" },
  { valor: "cartao_credito", label: "Cartao de credito" },
  { valor: "cartao_debito", label: "Cartao de debito" },
  { valor: "transferencia", label: "Transferencia" },
  { valor: "boleto", label: "Boleto" },
  { valor: "outro", label: "Outro" },
];
const PERFIS_ESCRITA_OS = new Set([
  "administrador_empresa",
  "comercial",
  "producao",
]);

const osInicial = {
  clienteId: "",
  clienteNome: "",
  clienteTelefone: "",
  veiculoId: "",
  veiculoPlaca: "",
  veiculoMarca: "",
  veiculoModelo: "",
  veiculoAno: "",
  quilometragemEntrada: "",
  defeitoRelatado: "",
  diagnostico: "",
  observacoes: "",
  status: "aberta",
  statusPagamento: "pendente",
  formaPagamento: "",
  dataPagamento: null,
  encerradoEm: null,
  encerradoPor: "",
};

const servicoFormularioInicial = {
  servicoId: "",
  quantidade: "1",
  valorUnitario: "",
};

const pecaFormularioInicial = {
  produtoId: "",
  quantidade: "1",
  valorUnitario: "",
};

const normalizarTexto = (valor) => String(valor || "").trim();
const normalizarBusca = (valor) => normalizarTexto(valor).toLowerCase();
const normalizarStatusCadastro = (status = "ativo") =>
  String(status || "ativo").trim().toLowerCase() === "inativo" ? "inativo" : "ativo";
const normalizarStatusOS = (status = "aberta") => {
  const statusTratado = String(status || "aberta").trim().toLowerCase();
  return STATUS_VALIDOS.has(statusTratado) ? statusTratado : "aberta";
};
const normalizarStatusPagamentoOS = (status = "pendente") => {
  const statusTratado = String(status || "pendente").trim().toLowerCase();
  return STATUS_PAGAMENTO_VALIDOS.has(statusTratado) ? statusTratado : "pendente";
};
const obterDataPagamentoAtual = () => new Date().toISOString().split("T")[0];
const numeroSeguro = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const obterStatusOSConfig = (status) =>
  STATUS_OS.find((item) => item.valor === normalizarStatusOS(status)) || STATUS_OS[0];

const obterStatusPagamentoLabel = (status) =>
  STATUS_PAGAMENTO_OS.find(
    (item) => item.valor === normalizarStatusPagamentoOS(status)
  )?.label || "Pendente";

const obterFormaPagamentoLabel = (formaPagamento) =>
  FORMAS_PAGAMENTO_OS.find(
    (item) => item.valor === String(formaPagamento || "").trim().toLowerCase()
  )?.label || "Nao informado";

const normalizarTelefoneWhatsApp = (telefone) => {
  const digitos = String(telefone || "").replace(/\D/g, "");

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos;
  }

  return "";
};

const formatarData = (valor) => {
  if (!valor) return "-";

  const data =
    typeof valor?.toDate === "function"
      ? valor.toDate()
      : valor instanceof Date
      ? valor
      : new Date(valor);

  if (Number.isNaN(data.getTime())) return "-";

  return data.toLocaleDateString("pt-BR");
};

const montarDescricaoVeiculo = (veiculo = {}) =>
  [
    veiculo.placa,
    [veiculo.marca, veiculo.modelo].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" - ") || "Veiculo sem identificacao";

const produtoEstaAtivoParaOS = (produto = {}) => {
  const status = String(produto.status || "ativo").trim().toLowerCase();
  const statusInativo = ["inativo", "removido", "excluido", "excluído", "cancelado"];

  return produto.ativo !== false && !statusInativo.includes(status);
};

const montarDescricaoProduto = (produto = {}) =>
  [
    produto.codigo ? `${produto.codigo} -` : "",
    produto.nome || produto.produtoNome || produto.produto || "",
    produto.tipo || "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim() || "Produto sem nome";

const obterPrecoProduto = (produto = {}) =>
  numeroSeguro(
    produto.precoAtual ||
      produto.precoVendaAtual ||
      produto.precoVenda ||
      produto.valorUnitario ||
      produto.preco ||
      produto.precoUnitario ||
      0
  );

const obterCustoProduto = (produto = {}) =>
  numeroSeguro(
    produto.custoAtual ||
      produto.custoUnitarioAtual ||
      produto.custoMedio ||
      produto.custoUnitario ||
      produto.custoProducao ||
      0
  );

const recalcularServico = (servico = {}) => {
  const quantidade = numeroSeguro(servico.quantidade);
  const valorUnitario = numeroSeguro(servico.valorUnitario);

  return {
    ...servico,
    quantidade,
    valorUnitario,
    subtotal: quantidade * valorUnitario,
  };
};

const recalcularPeca = (peca = {}) => {
  const quantidade = numeroSeguro(peca.quantidade);
  const valorUnitario = numeroSeguro(peca.valorUnitario);
  const custoUnitario = numeroSeguro(peca.custoUnitario);

  return {
    ...peca,
    quantidade,
    valorUnitario,
    subtotal: quantidade * valorUnitario,
    custoUnitario,
    custoTotal: quantidade * custoUnitario,
  };
};

export default function OrdensServico() {
  const {
    clientesComerciais = [],
    empresaId,
    empresaOwnerUid,
    empresas = [],
    configuracoes,
    isAdminMaster,
    ordensServico = [],
    perfilEmpresaAtual,
    perdasDoacoes = [],
    producoes = [],
    produtos = [],
    vendas = [],
    user,
  } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();

  const [veiculos, setVeiculos] = useState([]);
  const [servicosCatalogo, setServicosCatalogo] = useState([]);
  const [carregandoVeiculos, setCarregandoVeiculos] = useState(true);
  const [carregandoServicos, setCarregandoServicos] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [ordemEditando, setOrdemEditando] = useState(null);
  const [form, setForm] = useState(osInicial);
  const [servicosOS, setServicosOS] = useState([]);
  const [servicoForm, setServicoForm] = useState(servicoFormularioInicial);
  const [pecasOS, setPecasOS] = useState([]);
  const [pecaForm, setPecaForm] = useState(pecaFormularioInicial);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const ownerUid = empresaOwnerUid || user?.uid || null;
  const podeEscreverOrdens =
    isAdminMaster || PERFIS_ESCRITA_OS.has(perfilEmpresaAtual);
  const empresaAtiva = useMemo(
    () => empresas.find((empresa) => empresa.id === empresaId) || null,
    [empresaId, empresas]
  );
  const dadosEmpresaPDF = useMemo(() => {
    const empresaConfig = configuracoes?.empresa || {};

    return {
      nome: empresaConfig.nome || empresaAtiva?.nome || "Renovar ERP",
      cnpj: empresaConfig.cnpj || empresaAtiva?.cnpj || "",
      cidade: empresaConfig.cidade || empresaAtiva?.cidade || "",
      telefone: empresaConfig.telefone || empresaAtiva?.telefone || "",
      email: empresaConfig.email || empresaAtiva?.email || "",
      logoBase64: empresaConfig.logoBase64 || empresaAtiva?.logoBase64 || "",
      logoUrl: empresaConfig.logoUrl || empresaAtiva?.logoUrl || "",
    };
  }, [configuracoes, empresaAtiva]);

  const ordensServicoRef = useMemo(() => {
    if (!user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "ordensServico");
  }, [empresaId, ownerUid, user]);

  const veiculosRef = useMemo(() => {
    if (!user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "veiculos");
  }, [empresaId, ownerUid, user]);

  const servicosRef = useMemo(() => {
    if (!user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "servicos");
  }, [empresaId, ownerUid, user]);

  useEffect(() => {
    if (!veiculosRef) return undefined;

    const unsubscribe = onSnapshot(
      veiculosRef,
      (snapshot) => {
        const lista = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) =>
            String(a.placa || "").localeCompare(String(b.placa || ""), "pt-BR", {
              numeric: true,
              sensitivity: "base",
            })
          );

        setVeiculos(lista);
        setCarregandoVeiculos(false);
      },
      (error) => {
        console.error("Erro ao carregar veiculos para OS:", error);
        showToast("Nao foi possivel carregar os veiculos.", "error");
        setVeiculos([]);
        setCarregandoVeiculos(false);
      }
    );

    return () => unsubscribe();
  }, [showToast, veiculosRef]);

  useEffect(() => {
    if (!servicosRef) return undefined;

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

        setServicosCatalogo(lista);
        setCarregandoServicos(false);
      },
      (error) => {
        console.error("Erro ao carregar servicos para OS:", error);
        showToast("Nao foi possivel carregar os servicos.", "error");
        setServicosCatalogo([]);
        setCarregandoServicos(false);
      }
    );

    return () => unsubscribe();
  }, [servicosRef, showToast]);

  const veiculoSelecionado = useMemo(
    () => veiculos.find((veiculo) => veiculo.id === form.veiculoId) || null,
    [form.veiculoId, veiculos]
  );

  const veiculoTemClienteVinculado = Boolean(
    normalizarTexto(veiculoSelecionado?.clienteId)
  );

  const clientesParaSelecao = useMemo(() => {
    const clientesAtivos = clientesComerciais.filter(
      (cliente) => cliente.ativo !== false || cliente.id === form.clienteId
    );

    if (
      form.clienteId &&
      !clientesAtivos.some((cliente) => cliente.id === form.clienteId)
    ) {
      clientesAtivos.push({
        id: form.clienteId,
        nome: form.clienteNome,
        telefone: form.clienteTelefone,
      });
    }

    return clientesAtivos.sort((a, b) =>
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
        numeric: true,
        sensitivity: "base",
      })
    );
  }, [clientesComerciais, form.clienteId, form.clienteNome, form.clienteTelefone]);

  const veiculosParaSelecao = useMemo(
    () =>
      veiculos.filter(
        (veiculo) =>
          normalizarStatusCadastro(veiculo.status) !== "inativo" ||
          veiculo.id === form.veiculoId
      ),
    [form.veiculoId, veiculos]
  );

  const servicosAtivos = useMemo(
    () =>
      servicosCatalogo.filter(
        (servico) => normalizarStatusCadastro(servico.status) === "ativo"
      ),
    [servicosCatalogo]
  );

  const estoqueProdutos = useMemo(
    () =>
      calcularEstoqueProdutos({
        produtos,
        producoes,
        vendas,
        perdasDoacoes,
        ordensServico,
        ignorarOrdemServicoId: ordemEditando?.id || "",
      }),
    [ordemEditando?.id, ordensServico, perdasDoacoes, producoes, produtos, vendas]
  );

  const estoqueProdutosPorId = useMemo(
    () =>
      new Map(
        estoqueProdutos
          .filter((produto) => produto.produtoId)
          .map((produto) => [produto.produtoId, produto])
      ),
    [estoqueProdutos]
  );

  const produtosDisponiveis = useMemo(
    () =>
      produtos
        .filter((produto) => {
          const produtoId = produto.id || produto.produtoId || "";
          return produtoId && produtoEstaAtivoParaOS(produto) && produto.vendavel !== false;
        })
        .sort((a, b) =>
          montarDescricaoProduto(a).localeCompare(montarDescricaoProduto(b), "pt-BR", {
            numeric: true,
            sensitivity: "base",
          })
        ),
    [produtos]
  );

  const obterSaldoDisponivelProduto = (produtoId, ignorarPecaIndex = null) => {
    const saldoEstoque = Number(estoqueProdutosPorId.get(produtoId)?.saldo || 0);
    const quantidadeNaOS = pecasOS.reduce((total, peca, index) => {
      if (ignorarPecaIndex !== null && index === ignorarPecaIndex) return total;
      if (peca.produtoId !== produtoId) return total;

      return total + numeroSeguro(peca.quantidade);
    }, 0);

    return Math.max(0, saldoEstoque - quantidadeNaOS);
  };

  const ordensFiltradas = useMemo(() => {
    const termo = normalizarBusca(busca);

    return ordensServico.filter((ordem) => {
      const status = normalizarStatusOS(ordem.status);
      const confereStatus = filtroStatus === "todos" || status === filtroStatus;
      const texto = [
        ordem.numero,
        ordem.clienteNome,
        ordem.veiculoPlaca,
        ordem.veiculoMarca,
        ordem.veiculoModelo,
      ]
        .map(normalizarBusca)
        .join(" ");

      return confereStatus && (!termo || texto.includes(termo));
    });
  }, [busca, filtroStatus, ordensServico]);

  const totais = useMemo(() => {
    const totalServicos = servicosOS.reduce(
      (total, servico) => total + numeroSeguro(servico.subtotal),
      0
    );
    const totalPecas = pecasOS.reduce(
      (total, peca) => total + numeroSeguro(peca.subtotal),
      0
    );

    return {
      totalServicos,
      totalPecas,
      totalGeral: totalServicos + totalPecas,
    };
  }, [pecasOS, servicosOS]);

  const carregando = carregandoVeiculos || carregandoServicos;

  const atualizarCampo = (campo, valor) => {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  };

  const atualizarStatusPagamento = (statusPagamento) => {
    const statusNormalizado = normalizarStatusPagamentoOS(statusPagamento);

    setForm((atual) => ({
      ...atual,
      statusPagamento: statusNormalizado,
      dataPagamento:
        statusNormalizado === "pago"
          ? atual.dataPagamento || obterDataPagamentoAtual()
          : null,
    }));
  };

  const selecionarVeiculo = (veiculoId) => {
    const veiculo = veiculos.find((item) => item.id === veiculoId);

    if (!veiculo) {
      setForm((atual) => ({
        ...atual,
        veiculoId: "",
        veiculoPlaca: "",
        veiculoMarca: "",
        veiculoModelo: "",
        veiculoAno: "",
        clienteId: "",
        clienteNome: "",
        clienteTelefone: "",
      }));
      return;
    }

    const clienteId = normalizarTexto(veiculo.clienteId);
    const cliente = clienteId
      ? clientesComerciais.find((item) => item.id === clienteId)
      : null;
    const clienteNome = clienteId ? cliente?.nome || veiculo.clienteNome || "" : "";

    setForm((atual) => ({
      ...atual,
      veiculoId: veiculo.id,
      veiculoPlaca: veiculo.placa || "",
      veiculoMarca: veiculo.marca || "",
      veiculoModelo: veiculo.modelo || "",
      veiculoAno: veiculo.ano || "",
      clienteId,
      clienteNome,
      clienteTelefone: cliente?.telefone || "",
    }));
  };

  const selecionarCliente = (clienteId) => {
    const cliente = clientesComerciais.find((item) => item.id === clienteId);

    setForm((atual) => ({
      ...atual,
      clienteId: cliente?.id || "",
      clienteNome: cliente?.nome || "",
      clienteTelefone: cliente?.telefone || "",
    }));
  };

  const selecionarServicoCatalogo = (servicoId) => {
    const servico = servicosCatalogo.find((item) => item.id === servicoId);

    setServicoForm({
      servicoId,
      quantidade: "1",
      valorUnitario: servico ? String(servico.valor ?? "") : "",
    });
  };

  const selecionarProduto = (produtoId) => {
    const produto = produtosDisponiveis.find(
      (item) => (item.id || item.produtoId) === produtoId
    );

    setPecaForm({
      produtoId,
      quantidade: "1",
      valorUnitario: produto ? String(obterPrecoProduto(produto)) : "",
    });
  };

  const adicionarServico = () => {
    const servico = servicosCatalogo.find((item) => item.id === servicoForm.servicoId);

    if (!servico) {
      showToast("Selecione um servico ativo.", "warning");
      return;
    }

    if (normalizarStatusCadastro(servico.status) !== "ativo") {
      showToast("Selecione um servico ativo.", "warning");
      return;
    }

    const quantidade = Number(servicoForm.quantidade);
    const valorUnitario = Number(servicoForm.valorUnitario);

    if (!Number.isInteger(quantidade) || quantidade < 1) {
      showToast("Informe uma quantidade inteira maior ou igual a 1.", "warning");
      return;
    }

    if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
      showToast("Informe um valor unitario maior ou igual a zero.", "warning");
      return;
    }

    setServicosOS((atuais) => [
      ...atuais,
      {
        servicoId: servico.id,
        nome: servico.nome || "",
        valorUnitario,
        quantidade,
        subtotal: valorUnitario * quantidade,
        tempoEstimadoMinutos: servico.tempoEstimadoMinutos ?? "",
      },
    ]);
    setServicoForm(servicoFormularioInicial);
  };

  const atualizarServicoOS = (index, campo, valor) => {
    setServicosOS((atuais) =>
      atuais.map((servico, servicoIndex) => {
        if (servicoIndex !== index) return servico;

        return recalcularServico({
          ...servico,
          [campo]: valor,
        });
      })
    );
  };

  const removerServicoOS = (index) => {
    setServicosOS((atuais) => atuais.filter((_, servicoIndex) => servicoIndex !== index));
  };

  const adicionarPeca = () => {
    const produto = produtosDisponiveis.find(
      (item) => (item.id || item.produtoId) === pecaForm.produtoId
    );

    if (!produto) {
      showToast("Selecione um produto ativo e vendavel.", "warning");
      return;
    }

    const quantidade = Number(pecaForm.quantidade);
    const valorUnitario = Number(pecaForm.valorUnitario);

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      showToast("Informe uma quantidade maior que zero.", "warning");
      return;
    }

    const saldoDisponivel = obterSaldoDisponivelProduto(produto.id || produto.produtoId || "");

    if (quantidade > saldoDisponivel) {
      showToast(`Estoque insuficiente. Saldo disponivel: ${saldoDisponivel}.`, "warning");
      return;
    }

    if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
      showToast("Informe um valor unitario maior ou igual a zero.", "warning");
      return;
    }

    const custoUnitario = obterCustoProduto(produto);

    setPecasOS((atuais) => [
      ...atuais,
      {
        produtoId: produto.id || produto.produtoId || "",
        codigoProduto: produto.codigo || "",
        produtoNome: produto.nome || produto.produtoNome || "",
        produto: montarDescricaoProduto(produto),
        quantidade,
        valorUnitario,
        subtotal: quantidade * valorUnitario,
        custoUnitario,
        custoTotal: quantidade * custoUnitario,
      },
    ]);
    setPecaForm(pecaFormularioInicial);
  };

  const atualizarPecaOS = (index, campo, valor) => {
    setPecasOS((atuais) =>
      atuais.map((peca, pecaIndex) => {
        if (pecaIndex !== index) return peca;

        if (campo === "quantidade") {
          const quantidade = Number(valor);
          const saldoDisponivel = obterSaldoDisponivelProduto(peca.produtoId, index);

          if (
            Number.isFinite(quantidade) &&
            quantidade > saldoDisponivel
          ) {
            showToast(`Estoque insuficiente. Saldo disponivel: ${saldoDisponivel}.`, "warning");
            return peca;
          }
        }

        return recalcularPeca({
          ...peca,
          [campo]: valor,
        });
      })
    );
  };

  const removerPecaOS = (index) => {
    setPecasOS((atuais) => atuais.filter((_, pecaIndex) => pecaIndex !== index));
  };

  const limparFormulario = () => {
    setForm(osInicial);
    setServicosOS([]);
    setServicoForm(servicoFormularioInicial);
    setPecasOS([]);
    setPecaForm(pecaFormularioInicial);
    setOrdemEditando(null);
  };

  const abrirNovaOrdem = () => {
    if (!podeEscreverOrdens) {
      showToast("Voce nao tem permissao para criar ordens de servico.", "warning");
      return;
    }

    limparFormulario();
    setModalAberto(true);
  };

  const abrirEdicaoOrdem = (ordem) => {
    if (!podeEscreverOrdens) return;

    setOrdemEditando(ordem);
    setForm({
      clienteId: ordem.clienteId || "",
      clienteNome: ordem.clienteNome || "",
      clienteTelefone: ordem.clienteTelefone || "",
      veiculoId: ordem.veiculoId || "",
      veiculoPlaca: ordem.veiculoPlaca || "",
      veiculoMarca: ordem.veiculoMarca || "",
      veiculoModelo: ordem.veiculoModelo || "",
      veiculoAno: ordem.veiculoAno || "",
      quilometragemEntrada: ordem.quilometragemEntrada ?? "",
      defeitoRelatado: ordem.defeitoRelatado || "",
      diagnostico: ordem.diagnostico || "",
      observacoes: ordem.observacoes || "",
      status: normalizarStatusOS(ordem.status),
      statusPagamento: normalizarStatusPagamentoOS(ordem.statusPagamento),
      formaPagamento: ordem.formaPagamento || "",
      dataPagamento: ordem.dataPagamento || null,
      encerradoEm: ordem.encerradoEm || null,
      encerradoPor: ordem.encerradoPor || "",
    });
    setServicosOS(
      Array.isArray(ordem.servicos)
        ? ordem.servicos.map((servico) => recalcularServico(servico))
        : []
    );
    setPecasOS(
      Array.isArray(ordem.pecas)
        ? ordem.pecas.map((peca) => recalcularPeca(peca))
        : []
    );
    setServicoForm(servicoFormularioInicial);
    setPecaForm(pecaFormularioInicial);
    setModalAberto(true);
  };

  const resetarModal = () => {
    setModalAberto(false);
    limparFormulario();
  };

  const fecharModalSemDescartar = () => {
    if (salvando) return;
    setModalAberto(false);
  };

  const cancelarModal = () => {
    if (salvando) return;
    resetarModal();
  };

  const montarPayload = () => {
    const veiculo = veiculos.find((item) => item.id === form.veiculoId);
    const cliente = clientesComerciais.find((item) => item.id === form.clienteId);
    const servicosNormalizados = servicosOS.map((servico) => recalcularServico(servico));
    const pecasNormalizadas = pecasOS.map((peca) => recalcularPeca(peca));
    const totalServicos = servicosNormalizados.reduce(
      (total, servico) => total + numeroSeguro(servico.subtotal),
      0
    );
    const totalPecas = pecasNormalizadas.reduce(
      (total, peca) => total + numeroSeguro(peca.subtotal),
      0
    );
    const statusPagamento = normalizarStatusPagamentoOS(form.statusPagamento);
    const status = normalizarStatusOS(form.status);

    return {
      clienteId: form.clienteId,
      clienteNome: form.clienteNome || cliente?.nome || "",
      clienteTelefone: form.clienteTelefone || cliente?.telefone || "",
      veiculoId: form.veiculoId,
      veiculoPlaca: form.veiculoPlaca || veiculo?.placa || "",
      veiculoMarca: form.veiculoMarca || veiculo?.marca || "",
      veiculoModelo: form.veiculoModelo || veiculo?.modelo || "",
      veiculoAno: form.veiculoAno || veiculo?.ano || "",
      quilometragemEntrada:
        form.quilometragemEntrada === "" ? "" : Number(form.quilometragemEntrada),
      defeitoRelatado: normalizarTexto(form.defeitoRelatado),
      diagnostico: normalizarTexto(form.diagnostico),
      observacoes: normalizarTexto(form.observacoes),
      servicos: servicosNormalizados,
      pecas: pecasNormalizadas,
      totalServicos,
      totalPecas,
      totalGeral: totalServicos + totalPecas,
      status,
      statusPagamento,
      formaPagamento: normalizarTexto(form.formaPagamento),
      dataPagamento:
        statusPagamento === "pago" ? form.dataPagamento || obterDataPagamentoAtual() : null,
      encerradoEm: status === "encerrada" ? form.encerradoEm || null : null,
      encerradoPor: status === "encerrada" ? normalizarTexto(form.encerradoPor) : "",
      atualizadoEm: serverTimestamp(),
    };
  };

  const salvarOrdem = async () => {
    if (!ordensServicoRef || !user || !empresaId) {
      showToast("Empresa ainda nao carregou. Aguarde e tente novamente.", "warning");
      return;
    }

    if (!podeEscreverOrdens) {
      showToast("Voce nao tem permissao para salvar ordens de servico.", "warning");
      return;
    }

    if (normalizarStatusOS(ordemEditando?.status) === "encerrada") {
      showToast("OS encerrada fica disponivel somente para leitura.", "warning");
      return;
    }

    if (normalizarStatusOS(form.status) === "encerrada") {
      showToast("Use a acao Encerrar OS para finalizar a ordem.", "warning");
      return;
    }

    if (!form.veiculoId) {
      showToast("Selecione um veiculo.", "warning");
      return;
    }

    if (!form.clienteId || !normalizarTexto(form.clienteNome)) {
      showToast("Selecione um cliente.", "warning");
      return;
    }

    if (!normalizarTexto(form.defeitoRelatado)) {
      showToast("Informe o defeito relatado.", "warning");
      return;
    }

    const quilometragemTratada = normalizarTexto(form.quilometragemEntrada);
    const quilometragemNumero = Number(quilometragemTratada);

    if (
      quilometragemTratada &&
      (!Number.isFinite(quilometragemNumero) || quilometragemNumero < 0)
    ) {
      showToast("Informe uma quilometragem maior ou igual a zero.", "warning");
      return;
    }

    const servicoInvalido = servicosOS.some((servico) => {
      const quantidade = Number(servico.quantidade);
      const valorUnitario = Number(servico.valorUnitario);

      return (
        !Number.isInteger(quantidade) ||
        quantidade < 1 ||
        !Number.isFinite(valorUnitario) ||
        valorUnitario < 0
      );
    });

    if (servicoInvalido) {
      showToast("Revise os servicos da ordem.", "warning");
      return;
    }

    const pecaInvalida = pecasOS.some((peca) => {
      const quantidade = Number(peca.quantidade);
      const valorUnitario = Number(peca.valorUnitario);

      return (
        !peca.produtoId ||
        !Number.isFinite(quantidade) ||
        quantidade <= 0 ||
        !Number.isFinite(valorUnitario) ||
        valorUnitario < 0
      );
    });

    if (pecaInvalida) {
      showToast("Revise as pecas da ordem.", "warning");
      return;
    }

    const pecaSemSaldo = pecasOS.find((peca, index) => {
      const saldoDisponivel = obterSaldoDisponivelProduto(peca.produtoId, index);
      return Number(peca.quantidade) > saldoDisponivel;
    });

    if (pecaSemSaldo) {
      const saldoDisponivel = obterSaldoDisponivelProduto(
        pecaSemSaldo.produtoId,
        pecasOS.indexOf(pecaSemSaldo)
      );
      showToast(`Estoque insuficiente para ${pecaSemSaldo.produtoNome || pecaSemSaldo.produto}. Saldo disponivel: ${saldoDisponivel}.`, "warning");
      return;
    }

    setSalvando(true);

    try {
      const payload = montarPayload();

      if (ordemEditando?.id) {
        await updateDoc(doc(ordensServicoRef, ordemEditando.id), payload);
        showToast("Ordem de servico atualizada com sucesso.", "success");
      } else {
        const novaOrdemRef = doc(ordensServicoRef);
        await setDoc(novaOrdemRef, {
          ...payload,
          numero: `OS-${novaOrdemRef.id}`,
          status: "aberta",
          criadoEm: serverTimestamp(),
        });
        showToast("Ordem de servico criada com sucesso.", "success");
      }

      resetarModal();
    } catch (error) {
      console.error("Erro ao salvar ordem de servico:", error);
      showToast("Nao foi possivel salvar a ordem de servico.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const encerrarOrdem = async (ordem) => {
    if (!ordensServicoRef || !user || !empresaId) {
      showToast("Empresa ainda nao carregou. Aguarde e tente novamente.", "warning");
      return;
    }

    if (!podeEscreverOrdens) {
      showToast("Voce nao tem permissao para encerrar ordens de servico.", "warning");
      return;
    }

    if (salvando) return;

    const statusAtual = normalizarStatusOS(ordem.status);
    const pagamentoAtual = normalizarStatusPagamentoOS(ordem.statusPagamento);

    if (statusAtual !== "concluida" || pagamentoAtual !== "pago") {
      showToast(
        "Para encerrar a OS, o servico deve estar concluido e o pagamento marcado como pago.",
        "warning"
      );
      return;
    }

    const confirmado = await confirmar("Deseja encerrar esta ordem de servico?");
    if (!confirmado) return;

    setSalvando(true);

    try {
      await updateDoc(doc(ordensServicoRef, ordem.id), {
        status: "encerrada",
        encerradoEm: serverTimestamp(),
        encerradoPor: user.uid,
        atualizadoEm: serverTimestamp(),
      });
      showToast("Ordem de servico encerrada com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao encerrar ordem de servico:", error);
      showToast("Nao foi possivel encerrar a ordem de servico.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const imprimirOrdem = async (ordem) => {
    try {
      await gerarOrdemServicoPDF({
        ordem,
        dadosEmpresa: dadosEmpresaPDF,
      });
    } catch (error) {
      console.error("Erro ao gerar PDF da ordem de servico:", error);
      showToast("Nao foi possivel gerar o PDF da ordem de servico.", "error");
    }
  };

  const enviarOrdemWhatsApp = (ordem) => {
    const telefone = normalizarTelefoneWhatsApp(ordem.clienteTelefone);

    if (!telefone) {
      showToast("Informe um telefone valido no cliente da OS para enviar pelo WhatsApp.", "warning");
      return;
    }

    const numero = ordem.numero || `OS-${ordem.id}`;
    const veiculo =
      [
        ordem.veiculoPlaca,
        [ordem.veiculoMarca, ordem.veiculoModelo].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(" - ") || "Veiculo nao informado";
    const status = obterStatusOSConfig(ordem.status).label;
    const statusPagamento = normalizarStatusPagamentoOS(ordem.statusPagamento);
    const pagamento = [
      `Pagamento: ${obterStatusPagamentoLabel(statusPagamento)}`,
      statusPagamento === "pago"
        ? `Forma: ${obterFormaPagamentoLabel(ordem.formaPagamento)}`
        : "",
    ].filter(Boolean);
    const empresaNome = dadosEmpresaPDF.nome || "Equipe da oficina";
    const mensagem = [
      `Ola, ${ordem.clienteNome || "tudo bem"}.\n`,
      `Segue um resumo da sua Ordem de Servico ${numero}.`,
      "",
      `Veiculo: ${veiculo}`,
      `Status: ${status}`,
      `Total: ${moedaBR(ordem.totalGeral || 0)}`,
      ...pagamento,
      "",
      "Qualquer duvida, estamos a disposicao.",
      empresaNome,
    ].join("\n");
    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page fornecedores-page">
      <div className="page-header fornecedores-header">
        <div>
          <span className="page-eyebrow">Oficina</span>
          <h1 className="page-title">Ordens de Servico</h1>
          <p className="page-subtitle">
            Registre atendimento, veiculo, servicos e status operacional.
          </p>
        </div>

        {podeEscreverOrdens && (
          <button type="button" onClick={abrirNovaOrdem}>
            <Plus size={18} />
            Nova OS
          </button>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="card metric-card metric-blue">
          <p>Ordens</p>
          <h2>{ordensServico.length}</h2>
          <small>Total registrado</small>
        </div>

        <div className="card metric-card metric-green">
          <p>Em andamento</p>
          <h2>
            {
              ordensServico.filter((ordem) =>
                ["aberta", "aguardando_aprovacao", "aprovada", "em_execucao"].includes(
                  normalizarStatusOS(ordem.status)
                )
              ).length
            }
          </h2>
          <small>Fluxo operacional</small>
        </div>

        <div className="card metric-card metric-purple">
          <p>Concluidas</p>
          <h2>
            {
              ordensServico.filter(
                (ordem) => normalizarStatusOS(ordem.status) === "concluida"
              ).length
            }
          </h2>
          <small>Historico preservado</small>
        </div>
      </div>

      <section className="card fornecedores-card">
        <div className="fornecedores-card-header">
          <div className="fornecedores-title-block">
            <span className="fornecedores-main-icon">
              <ClipboardList size={22} />
            </span>

            <div>
              <span className="badge badge-purple">Ordens</span>
              <h3>Atendimentos da oficina</h3>
              <p>Controle de veiculo, cliente, servicos e status.</p>
            </div>
          </div>
        </div>

        <div className="fornecedores-toolbar">
          <label className="fornecedores-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Buscar por OS, cliente, placa ou veiculo..."
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
              {STATUS_OS.map((status) => (
                <option key={status.valor} value={status.valor}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando ordens de servico...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>OS</th>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Veiculo</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>

              <tbody>
                {ordensFiltradas.map((ordem) => {
                  const status = obterStatusOSConfig(ordem.status);
                  const statusValor = normalizarStatusOS(ordem.status);
                  const ordemEncerrada = statusValor === "encerrada";
                  const ordemCancelada = statusValor === "cancelada";
                  const acoesOrdem = [
                    podeEscreverOrdens && !ordemEncerrada
                      ? {
                          label: "Editar OS",
                          onClick: () => abrirEdicaoOrdem(ordem),
                        }
                      : null,
                    podeEscreverOrdens && !ordemEncerrada && !ordemCancelada
                      ? {
                          label: "Encerrar OS",
                          onClick: () => encerrarOrdem(ordem),
                        }
                      : null,
                    {
                      label: "Imprimir OS",
                      onClick: () => imprimirOrdem(ordem),
                    },
                    {
                      label: "Enviar por WhatsApp",
                      onClick: () => enviarOrdemWhatsApp(ordem),
                    },
                  ].filter(Boolean);

                  return (
                    <tr key={ordem.id}>
                      <td>
                        <strong>{ordem.numero || `OS-${ordem.id}`}</strong>
                      </td>
                      <td>{formatarData(ordem.criadoEm)}</td>
                      <td>{ordem.clienteNome || "-"}</td>
                      <td>
                        <div className="fornecedores-cell-main">
                          <strong>{ordem.veiculoPlaca || "-"}</strong>
                          <small>
                            {[ordem.veiculoMarca, ordem.veiculoModelo]
                              .filter(Boolean)
                              .join(" ") || "Veiculo nao informado"}
                          </small>
                        </div>
                      </td>
                      <td>{moedaBR(ordem.totalGeral || 0)}</td>
                      <td>
                        <span className={`badge ${status.classe}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        {acoesOrdem.length > 0 ? (
                          <ActionMenu
                            label="Abrir acoes da ordem de servico"
                            items={acoesOrdem}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}

                {ordensFiltradas.length === 0 && (
                  <tr>
                    <td colSpan="7">Nenhuma ordem de servico encontrada.</td>
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
          onClick={fecharModalSemDescartar}
        >
          <div
            className="modal-card fornecedores-modal oficina-os-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="fornecedores-modal-header">
              <div>
                <span className="badge badge-info">
                  <ClipboardList size={14} />
                  {ordemEditando ? "Editar OS" : "Nova OS"}
                </span>
                <h3>{ordemEditando ? "Editar ordem de servico" : "Nova ordem de servico"}</h3>
                <p>Dados principais do atendimento da oficina.</p>
              </div>
            </div>

            <div className="oficina-modal-section-title">
              <h4>Dados do atendimento</h4>
            </div>

            <div className="fornecedores-form-grid">
              <label>
                Veiculo *
                <select
                  value={form.veiculoId}
                  onChange={(event) => selecionarVeiculo(event.target.value)}
                >
                  <option value="">Selecione um veiculo</option>
                  {veiculosParaSelecao.map((veiculo) => (
                    <option key={veiculo.id} value={veiculo.id}>
                      {montarDescricaoVeiculo(veiculo)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cliente *
                <select
                  value={form.clienteId}
                  disabled={veiculoTemClienteVinculado}
                  onChange={(event) => selecionarCliente(event.target.value)}
                >
                  <option value="">Selecione um cliente</option>
                  {clientesParaSelecao.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nome || "Cliente sem nome"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Quilometragem de entrada
                <input
                  type="number"
                  min="0"
                  value={form.quilometragemEntrada}
                  onChange={(event) =>
                    atualizarCampo("quilometragemEntrada", event.target.value)
                  }
                  placeholder="0"
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  disabled={!ordemEditando}
                  onChange={(event) => atualizarCampo("status", event.target.value)}
                >
                  {STATUS_EDICAO_OS.map((status) => (
                    <option key={status.valor} value={status.valor}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status do pagamento
                <select
                  value={form.statusPagamento}
                  onChange={(event) => atualizarStatusPagamento(event.target.value)}
                >
                  {STATUS_PAGAMENTO_OS.map((status) => (
                    <option key={status.valor} value={status.valor}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Forma de pagamento
                <select
                  value={form.formaPagamento}
                  onChange={(event) =>
                    atualizarCampo("formaPagamento", event.target.value)
                  }
                >
                  {FORMAS_PAGAMENTO_OS.map((forma) => (
                    <option key={forma.valor || "sem_forma"} value={forma.valor}>
                      {forma.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fornecedores-form-wide">
                Defeito relatado *
                <textarea
                  value={form.defeitoRelatado}
                  onChange={(event) => atualizarCampo("defeitoRelatado", event.target.value)}
                  placeholder="Descreva o relato do cliente"
                  rows={3}
                />
              </label>

              <label className="fornecedores-form-wide">
                Diagnostico
                <textarea
                  value={form.diagnostico}
                  onChange={(event) => atualizarCampo("diagnostico", event.target.value)}
                  placeholder="Diagnostico tecnico"
                  rows={3}
                />
              </label>

              <label className="fornecedores-form-wide">
                Observacoes
                <textarea
                  value={form.observacoes}
                  onChange={(event) => atualizarCampo("observacoes", event.target.value)}
                  placeholder="Observacoes internas"
                  rows={3}
                />
              </label>
            </div>

            <div className="fornecedores-card-header">
              <div className="fornecedores-title-block">
                <span className="fornecedores-main-icon">
                  <Wrench size={20} />
                </span>
                <div>
                  <h3>Servicos</h3>
                  <p>Valores salvos como snapshot desta OS.</p>
                </div>
              </div>
            </div>

            <div className="fornecedores-form-grid">
              <label>
                Servico
                <select
                  value={servicoForm.servicoId}
                  onChange={(event) => selecionarServicoCatalogo(event.target.value)}
                >
                  <option value="">Selecione um servico</option>
                  {servicosAtivos.map((servico) => (
                    <option key={servico.id} value={servico.id}>
                      {servico.nome || "Servico sem nome"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Quantidade
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={servicoForm.quantidade}
                  onChange={(event) =>
                    setServicoForm((atual) => ({
                      ...atual,
                      quantidade: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Valor unitario
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={servicoForm.valorUnitario}
                  onChange={(event) =>
                    setServicoForm((atual) => ({
                      ...atual,
                      valorUnitario: event.target.value,
                    }))
                  }
                  placeholder="0,00"
                />
              </label>

              <div className="fornecedores-form-wide">
                <button type="button" className="confirm-secondary" onClick={adicionarServico}>
                  <Plus size={16} />
                  Adicionar servico
                </button>
              </div>
            </div>

            {servicosOS.length > 0 && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Servico</th>
                      <th>Qtd.</th>
                      <th>Valor unit.</th>
                      <th>Subtotal</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicosOS.map((servico, index) => (
                      <tr key={`${servico.servicoId}-${index}`}>
                        <td>
                          <div className="fornecedores-cell-main">
                            <strong>{servico.nome || "-"}</strong>
                            <small>
                              {servico.tempoEstimadoMinutos !== ""
                                ? `${servico.tempoEstimadoMinutos} min`
                                : "Tempo nao informado"}
                            </small>
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={servico.quantidade}
                            onChange={(event) =>
                              atualizarServicoOS(index, "quantidade", event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={servico.valorUnitario}
                            onChange={(event) =>
                              atualizarServicoOS(index, "valorUnitario", event.target.value)
                            }
                          />
                        </td>
                        <td>{moedaBR(servico.subtotal || 0)}</td>
                        <td>
                          <button
                            type="button"
                            className="confirm-secondary"
                            onClick={() => removerServicoOS(index)}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="fornecedores-card-header">
              <div className="fornecedores-title-block">
                <span className="fornecedores-main-icon">
                  <Package size={20} />
                </span>
                <div>
                  <h3>Pecas</h3>
                  <p>Produtos salvos como snapshot e consumidos pelo estoque derivado.</p>
                </div>
              </div>
            </div>

            <div className="fornecedores-form-grid">
              <label>
                Produto
                <select
                  value={pecaForm.produtoId}
                  onChange={(event) => selecionarProduto(event.target.value)}
                >
                  <option value="">Selecione um produto</option>
                  {produtosDisponiveis.map((produto) => (
                    <option key={produto.id || produto.produtoId} value={produto.id || produto.produtoId}>
                      {montarDescricaoProduto(produto)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Quantidade
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={pecaForm.quantidade}
                  onChange={(event) =>
                    setPecaForm((atual) => ({
                      ...atual,
                      quantidade: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Valor unitario
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pecaForm.valorUnitario}
                  onChange={(event) =>
                    setPecaForm((atual) => ({
                      ...atual,
                      valorUnitario: event.target.value,
                    }))
                  }
                  placeholder="0,00"
                />
              </label>

              <div className="fornecedores-form-wide">
                <button type="button" className="confirm-secondary" onClick={adicionarPeca}>
                  <Plus size={16} />
                  Adicionar peca
                </button>
              </div>
            </div>

            {pecasOS.length > 0 && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Peca</th>
                      <th>Qtd.</th>
                      <th>Valor unit.</th>
                      <th>Subtotal</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pecasOS.map((peca, index) => (
                      <tr key={`${peca.produtoId}-${index}`}>
                        <td>
                          <div className="fornecedores-cell-main">
                            <strong>{peca.produtoNome || peca.produto || "-"}</strong>
                            <small>{peca.codigoProduto || "Codigo nao informado"}</small>
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={peca.quantidade}
                            onChange={(event) =>
                              atualizarPecaOS(index, "quantidade", event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={peca.valorUnitario}
                            onChange={(event) =>
                              atualizarPecaOS(index, "valorUnitario", event.target.value)
                            }
                          />
                        </td>
                        <td>{moedaBR(peca.subtotal || 0)}</td>
                        <td>
                          <button
                            type="button"
                            className="confirm-secondary"
                            onClick={() => removerPecaOS(index)}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="oficina-modal-section-title">
              <h4>Totais / Pagamento</h4>
            </div>

            <div className="resumo-pedido">
              <span>Total servicos: {moedaBR(totais.totalServicos)}</span>
              <span>Total pecas: {moedaBR(totais.totalPecas)}</span>
              <strong>Total geral: {moedaBR(totais.totalGeral)}</strong>
            </div>

            <div className="modal-actions">
              <button type="button" className="confirm-secondary" onClick={cancelarModal}>
                Cancelar
              </button>
              <button type="button" onClick={salvarOrdem} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar OS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
