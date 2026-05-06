import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  MessageCircle,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import ActionMenu from "../components/ActionMenu";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import { usePlano } from "../hooks/usePlano";
import { useTableSort } from "../hooks/useTableSort";
import { dataBR, moedaBR, numeroBR } from "../utils/formatters";

const TIPOS_CLIENTE = ["Final", "Revendedor", "Distribuidor", "Outro"];
const STATUS_RELACIONAMENTO = ["Ativo", "Atenção", "Inativo"];
const STATUS_RECOMPRA = [
  "Sem compras",
  "Novo cliente",
  "Em dia",
  "Próximo da recompra",
  "Atrasado",
  "Inativo",
];

const CLIENTE_INICIAL = {
  nome: "",
  telefone: "",
  email: "",
  cidade: "",
  uf: "",
  endereco: "",
  documento: "",
  tipo: "Final",
  observacoes: "",
  statusRelacionamento: "Ativo",
  proximaAcao: "",
  dataProximaAcao: "",
  ativo: true,
};

const normalizarTexto = (valor = "") =>
  String(valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const normalizarTelefone = (telefone = "") => String(telefone).replace(/\D/g, "");

const parseData = (data) => {
  if (!data) return null;

  const date = new Date(`${data}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatarData = (data) => (data ? dataBR(data) : "-");

const diferencaDias = (inicio, fim) => {
  const umDia = 1000 * 60 * 60 * 24;
  return Math.round((fim.getTime() - inicio.getTime()) / umDia);
};

const somarDias = (data, dias) => {
  const novaData = new Date(data);
  novaData.setDate(novaData.getDate() + Math.round(dias));
  return novaData.toISOString().split("T")[0];
};

const obterClienteVenda = (venda = {}) =>
  venda.clienteNome || venda.cliente || "";

const obterItensResumo = (venda = {}) => {
  const itens = Array.isArray(venda.itens)
    ? venda.itens
    : venda.produto
    ? [{ produto: venda.produto, quantidade: venda.quantidade }]
    : [];

  if (itens.length === 0) return "-";

  return itens
    .map((item) => `${Number(item.quantidade || 0)}x ${item.produto || "-"}`)
    .join(", ");
};

const obterClasseStatusRecompra = (status) => {
  const classes = {
    "Sem compras": "badge-info",
    "Novo cliente": "badge-purple",
    "Em dia": "badge-success",
    "Próximo da recompra": "badge-warning",
    Atrasado: "badge-danger",
    Inativo: "badge-danger",
  };

  return classes[status] || "badge-info";
};

export default function ClientesCRM() {
  const navigate = useNavigate();
  const {
    user,
    empresaId,
    clientesComerciais = [],
    vendas = [],
    addItem,
    updateItem,
    deleteItem,
  } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();
  const {
    podeUsarCRMComercial,
    podeUsarCRMBasico,
    podeUsarCRMInteligente,
    podeUsarCRMWhatsapp,
    podeUsarCRMFollowUp,
  } = usePlano();
  const ordenacaoClientes = useTableSort({
    chave: "nome",
    direcao: "asc",
  });

  const [busca, setBusca] = useState("");
  const [filtroStatusRecompra, setFiltroStatusRecompra] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroRelacionamento, setFiltroRelacionamento] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteEditandoId, setClienteEditandoId] = useState(null);
  const [form, setForm] = useState(CLIENTE_INICIAL);
  const [clienteHistorico, setClienteHistorico] = useState(null);
  const [clienteExclusao, setClienteExclusao] = useState(null);
  const [clienteExclusaoBloqueada, setClienteExclusaoBloqueada] = useState(null);
  const [excluindoCliente, setExcluindoCliente] = useState(false);

  const vendasValidas = useMemo(
    () =>
      (vendas || []).filter((venda) => {
        const expedicao = String(venda.statusExpedicao || "").toLowerCase();
        const pagamento = String(venda.statusPagamento || "").toLowerCase();
        return expedicao !== "cancelado" && pagamento !== "cancelado";
      }),
    [vendas]
  );

  const obterComprasCliente = useCallback((cliente) => {
    const nomeCliente = normalizarTexto(cliente.nome);

    return vendasValidas
      .filter((venda) => {
        if (venda.clienteId && venda.clienteId === cliente.id) return true;
        if (venda.clienteId && venda.clienteId !== cliente.id) return false;
        return normalizarTexto(obterClienteVenda(venda)) === nomeCliente;
      })
      .sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
  }, [vendasValidas]);

  const calcularRecompra = useCallback((cliente) => {
    const compras = obterComprasCliente(cliente);
    const totalComprado = compras.reduce(
      (total, venda) => total + Number(venda.total || 0),
      0
    );
    const quantidadeDePedidos = compras.length;
    const ticketMedio =
      quantidadeDePedidos > 0 ? totalComprado / quantidadeDePedidos : 0;
    const ultimaCompra = compras[compras.length - 1];
    const dataUltimaCompra = ultimaCompra?.data || "";
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (cliente.ativo === false) {
      return {
        compras,
        totalComprado,
        quantidadeDePedidos,
        ticketMedio,
        dataUltimaCompra,
        frequenciaMediaDias: null,
        proximaCompraPrevista: "",
        diasDesdeUltimaCompra: dataUltimaCompra
          ? diferencaDias(parseData(dataUltimaCompra), hoje)
          : null,
        statusRecompra: "Inativo",
      };
    }

    if (quantidadeDePedidos === 0) {
      return {
        compras,
        totalComprado,
        quantidadeDePedidos,
        ticketMedio,
        dataUltimaCompra: "",
        frequenciaMediaDias: null,
        proximaCompraPrevista: "",
        diasDesdeUltimaCompra: null,
        statusRecompra: "Sem compras",
      };
    }

    const dataUltima = parseData(dataUltimaCompra);
    const diasDesdeUltimaCompra = dataUltima ? diferencaDias(dataUltima, hoje) : null;

    if (quantidadeDePedidos === 1) {
      return {
        compras,
        totalComprado,
        quantidadeDePedidos,
        ticketMedio,
        dataUltimaCompra,
        frequenciaMediaDias: null,
        proximaCompraPrevista: "",
        diasDesdeUltimaCompra,
        statusRecompra: "Novo cliente",
      };
    }

    const intervalos = [];

    for (let index = 1; index < compras.length; index += 1) {
      const anterior = parseData(compras[index - 1].data);
      const atual = parseData(compras[index].data);

      if (anterior && atual) {
        intervalos.push(Math.max(0, diferencaDias(anterior, atual)));
      }
    }

    const frequenciaMediaDias =
      intervalos.length > 0
        ? intervalos.reduce((total, dias) => total + dias, 0) / intervalos.length
        : null;
    const proximaCompraPrevista =
      dataUltima && frequenciaMediaDias !== null
        ? somarDias(dataUltima, frequenciaMediaDias)
        : "";
    const dataPrevista = parseData(proximaCompraPrevista);
    const diasParaRecompra = dataPrevista ? diferencaDias(hoje, dataPrevista) : null;

    let statusRecompra = "Em dia";

    if (diasParaRecompra !== null && diasParaRecompra >= 0 && diasParaRecompra <= 3) {
      statusRecompra = "Próximo da recompra";
    }

    if (diasParaRecompra !== null && diasParaRecompra < 0) {
      statusRecompra = "Atrasado";
    }

    return {
      compras,
      totalComprado,
      quantidadeDePedidos,
      ticketMedio,
      dataUltimaCompra,
      frequenciaMediaDias,
      proximaCompraPrevista,
      diasDesdeUltimaCompra,
      statusRecompra,
    };
  }, [obterComprasCliente]);

  const clientesComMetricas = useMemo(
    () =>
      (clientesComerciais || []).map((cliente) => ({
        ...cliente,
        metricas: calcularRecompra(cliente),
      })),
    [calcularRecompra, clientesComerciais]
  );

  const clientesFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca);

    return clientesComMetricas.filter((cliente) => {
      const textoBusca = normalizarTexto(
        [
          cliente.nome,
          cliente.telefone,
          cliente.cidade,
          cliente.documento,
        ].join(" ")
      );

      if (termo && !textoBusca.includes(termo)) return false;
      if (
        podeUsarCRMInteligente &&
        filtroStatusRecompra &&
        cliente.metricas.statusRecompra !== filtroStatusRecompra
      ) {
        return false;
      }
      if (filtroTipo && cliente.tipo !== filtroTipo) return false;
      if (
        podeUsarCRMFollowUp &&
        filtroRelacionamento &&
        cliente.statusRelacionamento !== filtroRelacionamento
      ) {
        return false;
      }

      return true;
    });
  }, [
    busca,
    clientesComMetricas,
    filtroRelacionamento,
    filtroStatusRecompra,
    filtroTipo,
    podeUsarCRMFollowUp,
    podeUsarCRMInteligente,
  ]);

  const clientesOrdenados = ordenacaoClientes.ordenar(
    clientesFiltrados,
    (cliente, chave) => {
      const valores = {
        nome: cliente.nome || "",
        tipo: cliente.tipo || "",
        cidade: `${cliente.cidade || ""}/${cliente.uf || ""}`,
        ultimaCompra: cliente.metricas.dataUltimaCompra || "",
        frequenciaMediaDias: Number(cliente.metricas.frequenciaMediaDias || 0),
        proximaCompraPrevista: cliente.metricas.proximaCompraPrevista || "",
        totalComprado: Number(cliente.metricas.totalComprado || 0),
        ticketMedio: Number(cliente.metricas.ticketMedio || 0),
        statusRecompra: cliente.metricas.statusRecompra || "",
        proximaAcao: cliente.dataProximaAcao || cliente.proximaAcao || "",
      };

      return valores[chave] ?? "";
    }
  );

  const resumo = useMemo(
    () => {
      const hojeISO = new Date().toISOString().split("T")[0];

      return clientesComMetricas.reduce(
        (acc, cliente) => {
          const clienteAtivo = cliente.ativo !== false;

          if (clienteAtivo) acc.ativos += 1;
          if (cliente.metricas.statusRecompra === "Próximo da recompra") {
            acc.proximos += 1;
          }
          if (clienteAtivo && cliente.metricas.statusRecompra === "Atrasado") {
            acc.atrasados += 1;
          }
          if (!clienteAtivo) acc.inativos += 1;

          acc.receita += Number(cliente.metricas.totalComprado || 0);
          acc.pedidos += Number(cliente.metricas.quantidadeDePedidos || 0);
          if (
            cliente.ativo !== false &&
            cliente.dataProximaAcao === hojeISO
          ) {
            acc.contatosHoje += 1;
          }

          return acc;
        },
        {
          ativos: 0,
          proximos: 0,
          atrasados: 0,
          inativos: 0,
          receita: 0,
          pedidos: 0,
          contatosHoje: 0,
        }
      );
    },
    [clientesComMetricas]
  );

  const ticketMedioGeral = resumo.pedidos > 0 ? resumo.receita / resumo.pedidos : 0;

  const limparFormulario = () => {
    setForm(CLIENTE_INICIAL);
    setClienteEditandoId(null);
  };

  const abrirNovoCliente = () => {
    limparFormulario();
    setModalAberto(true);
  };

  const editarCliente = (cliente) => {
    setClienteEditandoId(cliente.id);
    setForm({
      nome: cliente.nome || "",
      telefone: cliente.telefone || "",
      email: cliente.email || "",
      cidade: cliente.cidade || "",
      uf: cliente.uf || "",
      endereco: cliente.endereco || "",
      documento: cliente.documento || "",
      tipo: cliente.tipo || "Final",
      observacoes: cliente.observacoes || "",
      statusRelacionamento: cliente.statusRelacionamento || "Ativo",
      proximaAcao: cliente.proximaAcao || "",
      dataProximaAcao: cliente.dataProximaAcao || "",
      ativo: cliente.ativo !== false,
    });
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    limparFormulario();
  };

  const salvarCliente = async () => {
    const nome = form.nome.trim();
    const telefoneNormalizado = normalizarTelefone(form.telefone);

    if (!nome) {
      showToast("Informe o nome do cliente.", "warning");
      return;
    }

    const duplicado = (clientesComerciais || []).some((cliente) => {
      if (cliente.id === clienteEditandoId) return false;

      const mesmoNome = normalizarTexto(cliente.nome) === normalizarTexto(nome);
      const mesmoTelefone =
        telefoneNormalizado &&
        normalizarTelefone(cliente.telefone) === telefoneNormalizado;

      return mesmoNome || Boolean(mesmoTelefone);
    });

    if (duplicado) {
      showToast("Já existe um cliente com este nome ou telefone nesta empresa.", "warning");
      return;
    }

    const clienteAnterior = clienteEditandoId
      ? clientesComerciais.find((cliente) => cliente.id === clienteEditandoId)
      : null;
    const clienteAtivo = form.ativo !== false;
    let statusRelacionamento = form.statusRelacionamento;

    if (!clienteAtivo) {
      statusRelacionamento = "Inativo";
    } else if (statusRelacionamento === "Inativo") {
      statusRelacionamento = "Ativo";
    }

    const dadosCliente = {
      ...form,
      nome,
      uf: String(form.uf || "").trim().toUpperCase(),
      telefone: form.telefone.trim(),
      email: form.email.trim(),
      cidade: form.cidade.trim(),
      endereco: form.endereco.trim(),
      documento: form.documento.trim(),
      empresaId,
      userId: user?.uid || "",
      ativo: clienteAtivo,
      statusRelacionamento,
      updatedAt: new Date(),
    };

    if (clienteEditandoId) {
      await updateItem("clientesComerciais", clienteEditandoId, dadosCliente);

      if (clienteAnterior?.ativo === false && clienteAtivo) {
        showToast("Cliente reativado com sucesso.", "success");
      } else if (clienteAnterior?.ativo !== false && !clienteAtivo) {
        showToast("Cliente desativado.", "success");
      } else {
        showToast("Cliente atualizado com sucesso.", "success");
      }
    } else {
      await addItem("clientesComerciais", {
        ...dadosCliente,
        createdAt: new Date(),
      });
      showToast("Cliente cadastrado com sucesso.", "success");
    }

    fecharModal();
  };

  const desativarCliente = async (cliente) => {
    const confirmado = await confirmar(
      `Deseja desativar ${cliente.nome}? O histórico de compras será preservado.`
    );

    if (!confirmado) return;

    await updateItem("clientesComerciais", cliente.id, {
      ativo: false,
      statusRelacionamento: "Inativo",
      updatedAt: new Date(),
    });

    showToast("Cliente desativado.", "success");
  };

  const obterMovimentacaoCliente = (cliente) => {
    const metricas = cliente.metricas || calcularRecompra(cliente);
    const compras = metricas.compras || obterComprasCliente(cliente);
    const totalComprado = Number(metricas.totalComprado || cliente.totalComprado || 0);
    const possuiHistoricoComercial = [
      cliente.observacoes,
      cliente.proximaAcao,
      cliente.dataProximaAcao,
    ].some((valor) => String(valor || "").trim());

    return {
      compras: compras.length,
      totalComprado,
      possuiHistoricoComercial,
      podeExcluir:
        totalComprado === 0 &&
        compras.length === 0 &&
        !possuiHistoricoComercial,
    };
  };

  const solicitarExclusaoCliente = (cliente) => {
    const movimentacao = obterMovimentacaoCliente(cliente);

    if (!movimentacao.podeExcluir) {
      setClienteExclusaoBloqueada({ ...cliente, movimentacao });
      return;
    }

    setClienteExclusao({ ...cliente, movimentacao });
  };

  const confirmarExclusaoCliente = async () => {
    if (!clienteExclusao || excluindoCliente) return;

    setExcluindoCliente(true);

    try {
      const removido = await deleteItem("clientesComerciais", clienteExclusao.id);

      if (removido === false) return;

      if (clienteHistorico?.id === clienteExclusao.id) {
        setClienteHistorico(null);
      }

      setClienteExclusao(null);
      showToast("Cliente excluido com sucesso.", "success");
    } finally {
      setExcluindoCliente(false);
    }
  };

  const abrirWhatsapp = (cliente) => {
    const telefone = normalizarTelefone(cliente.telefone);

    if (!telefone) {
      showToast("Este cliente não possui telefone cadastrado.", "warning");
      return;
    }

    const telefoneComPais = telefone.startsWith("55") ? telefone : `55${telefone}`;
    const mensagem = encodeURIComponent(
      `Olá, ${cliente.nome}! Tudo bem?\n\nVi aqui que talvez esteja na hora de repor seu estoque. Quer que eu separe um novo pedido para você?`
    );

    window.open(`https://wa.me/${telefoneComPais}?text=${mensagem}`, "_blank", "noopener,noreferrer");
  };

  const renderCabecalhoOrdenavel = (label, chave) => {
    const ativo = ordenacaoClientes.ativo(chave);

    return (
      <button
        type="button"
        className={ativo ? "table-sort-button active" : "table-sort-button"}
        onClick={() => ordenacaoClientes.ordenarPor(chave)}
      >
        <span>{label}</span>
        {ativo && <span aria-hidden="true">{ordenacaoClientes.indicador(chave)}</span>}
      </button>
    );
  };

  if (!podeUsarCRMComercial) {
    return (
      <div className="crm-page">
        <div className="card plan-locked-card crm-locked-card">
          <h2>CRM Comercial indisponível no plano atual</h2>
          <p>
            A Carteira de Clientes está disponível a partir do plano Básico.
            Faça upgrade para cadastrar clientes comerciais, acompanhar histórico
            de compras e organizar sua carteira.
          </p>
          <button type="button" onClick={() => navigate("/planos")}>
            Ver planos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Carteira de Clientes</h1>
          <p className="page-subtitle">
            Acompanhe clientes comerciais, histórico de compras e oportunidades de recompra.
          </p>
        </div>

        {podeUsarCRMBasico && (
          <button type="button" onClick={abrirNovoCliente}>
            <UserPlus size={18} />
            Novo cliente
          </button>
        )}
      </div>

      {!podeUsarCRMInteligente && (
        <div className="plan-locked-inline">
          <span>Recompra inteligente disponível no plano Profissional.</span>
          <button type="button" onClick={() => navigate("/planos")}>
            Ver planos
          </button>
        </div>
      )}

      {podeUsarCRMInteligente && !podeUsarCRMFollowUp && (
        <div className="plan-locked-inline">
          <span>Follow-up disponível no plano Profissional.</span>
          <button type="button" onClick={() => navigate("/planos")}>
            Ver planos
          </button>
        </div>
      )}

      {podeUsarCRMInteligente && (
      <div className="crm-summary-grid">
        <div className="card metric-card metric-blue">
          <p>Clientes ativos</p>
          <h2>{resumo.ativos}</h2>
          <small>Carteira atual</small>
        </div>

        <div className="card metric-card metric-amber">
          <p>Próximos da recompra</p>
          <h2>{resumo.proximos}</h2>
          <small>Até 3 dias</small>
        </div>

        <div className="card metric-card metric-red">
          <p>Atrasados</p>
          <h2>{resumo.atrasados}</h2>
          <small>Passaram da previsão</small>
        </div>

        <div className="card metric-card metric-purple">
          <p>Inativos</p>
          <h2>{resumo.inativos}</h2>
          <small>Mais de 30 dias após previsão</small>
        </div>

        <div className="card metric-card metric-green">
          <p>Ticket médio geral</p>
          <h2>{moedaBR(ticketMedioGeral)}</h2>
          <small>Pedidos da carteira</small>
        </div>

        <div className="card metric-card">
          <p>Receita da carteira</p>
          <h2>{moedaBR(resumo.receita)}</h2>
          <small>Total comprado</small>
        </div>

        {podeUsarCRMFollowUp && (
          <div className="card metric-card metric-amber">
            <p>Contatos de hoje</p>
            <h2>{resumo.contatosHoje}</h2>
            <small>Follow-up programado</small>
          </div>
        )}
      </div>
      )}

      <div className="card crm-filter-card">
        <div className="crm-filter-grid">
          <label className="crm-search-field">
            <Search size={18} aria-hidden="true" />
            <input
              placeholder="Buscar por nome, telefone, cidade ou documento"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>

          {podeUsarCRMInteligente && (
            <select
              value={filtroStatusRecompra}
              onChange={(e) => setFiltroStatusRecompra(e.target.value)}
            >
              <option value="">Status recompra</option>
              {STATUS_RECOMPRA.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          )}

          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Tipo de cliente</option>
            {TIPOS_CLIENTE.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>

          {podeUsarCRMFollowUp && (
            <select
              value={filtroRelacionamento}
              onChange={(e) => setFiltroRelacionamento(e.target.value)}
            >
              <option value="">Relacionamento</option>
              {STATUS_RELACIONAMENTO.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="btn-sm"
            onClick={() => {
              setBusca("");
              setFiltroStatusRecompra("");
              setFiltroTipo("");
              setFiltroRelacionamento("");
            }}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="card crm-table-card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>{renderCabecalhoOrdenavel("Cliente", "nome")}</th>
                <th>Telefone</th>
                <th>{renderCabecalhoOrdenavel("Tipo", "tipo")}</th>
                <th>{renderCabecalhoOrdenavel("Cidade/UF", "cidade")}</th>
                <th>{renderCabecalhoOrdenavel("Última compra", "ultimaCompra")}</th>
                {podeUsarCRMInteligente && (
                  <th>{renderCabecalhoOrdenavel("Frequência média", "frequenciaMediaDias")}</th>
                )}
                {podeUsarCRMInteligente && (
                  <th>{renderCabecalhoOrdenavel("Próxima compra", "proximaCompraPrevista")}</th>
                )}
                <th>{renderCabecalhoOrdenavel("Total comprado", "totalComprado")}</th>
                <th>{renderCabecalhoOrdenavel("Ticket médio", "ticketMedio")}</th>
                {podeUsarCRMInteligente && (
                  <th>{renderCabecalhoOrdenavel("Status recompra", "statusRecompra")}</th>
                )}
                {podeUsarCRMFollowUp && (
                  <th>{renderCabecalhoOrdenavel("Próxima ação", "proximaAcao")}</th>
                )}
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {clientesOrdenados.map((cliente) => {
                const metricas = cliente.metricas;

                return (
                  <tr key={cliente.id}>
                    <td>
                      <strong>{cliente.nome}</strong>
                      {cliente.ativo === false && (
                        <span className="crm-inactive-label">Desativado</span>
                      )}
                    </td>
                    <td>{cliente.telefone || "-"}</td>
                    <td>{cliente.tipo || "-"}</td>
                    <td>{[cliente.cidade, cliente.uf].filter(Boolean).join("/") || "-"}</td>
                    <td>{formatarData(metricas.dataUltimaCompra)}</td>
                    {podeUsarCRMInteligente && (
                      <td>
                        {metricas.frequenciaMediaDias === null
                          ? "Sem histórico suficiente"
                          : `${numeroBR(metricas.frequenciaMediaDias, 0)} dias`}
                      </td>
                    )}
                    {podeUsarCRMInteligente && (
                      <td>{formatarData(metricas.proximaCompraPrevista)}</td>
                    )}
                    <td>{moedaBR(metricas.totalComprado)}</td>
                    <td>{moedaBR(metricas.ticketMedio)}</td>
                    {podeUsarCRMInteligente && (
                      <td>
                        <span
                          className={`badge ${obterClasseStatusRecompra(
                            metricas.statusRecompra
                          )}`}
                        >
                          {metricas.statusRecompra}
                        </span>
                      </td>
                    )}
                    {podeUsarCRMFollowUp && (
                      <td>
                        {cliente.proximaAcao || "-"}
                        {cliente.dataProximaAcao && (
                          <small className="crm-next-action-date">
                            {formatarData(cliente.dataProximaAcao)}
                          </small>
                        )}
                      </td>
                    )}
                    <td>
                      <ActionMenu
                        label="Abrir ações do cliente"
                        items={[
                          {
                            label: "Editar cliente",
                            onClick: () => editarCliente(cliente),
                          },
                          {
                            label: "Ver histórico",
                            onClick: () => setClienteHistorico(cliente),
                          },
                          podeUsarCRMWhatsapp && {
                            label: "Chamar no WhatsApp",
                            disabled: !normalizarTelefone(cliente.telefone),
                            onClick: () => abrirWhatsapp(cliente),
                          },
                          {
                            label: "Desativar cliente",
                            danger: true,
                            disabled: cliente.ativo === false,
                            onClick: () => desativarCliente(cliente),
                          },
                          {
                            label: "Excluir cliente",
                            danger: true,
                            onClick: () => solicitarExclusaoCliente(cliente),
                          },
                        ].filter(Boolean)}
                      />
                    </td>
                  </tr>
                );
              })}

              {clientesOrdenados.length === 0 && (
                <tr>
                  <td colSpan={podeUsarCRMInteligente ? (podeUsarCRMFollowUp ? 12 : 11) : 8}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalAberto && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card crm-modal-card">
            <div className="crm-modal-header">
              <h3>{clienteEditandoId ? "Editar cliente" : "Novo cliente"}</h3>

              <button type="button" className="crm-icon-button" onClick={fecharModal}>
                <X size={18} />
              </button>
            </div>

            <div className="crm-form-grid">
              <label>
                Nome *
                <input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </label>

              <label>
                Telefone
                <input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                />
              </label>

              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>

              <label>
                Documento
                <input
                  value={form.documento}
                  onChange={(e) => setForm({ ...form, documento: e.target.value })}
                />
              </label>

              <label>
                Cidade
                <input
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                />
              </label>

              <label>
                UF
                <input
                  maxLength="2"
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value })}
                />
              </label>

              <label>
                Tipo
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  {TIPOS_CLIENTE.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </label>

              {clienteEditandoId && (
                <label className="crm-toggle-field">
                  <input
                    type="checkbox"
                    checked={form.ativo !== false}
                    onChange={(e) => {
                      const ativo = e.target.checked;

                      let proximoStatusRelacionamento = form.statusRelacionamento;

                      if (!ativo) {
                        proximoStatusRelacionamento = "Inativo";
                      } else if (proximoStatusRelacionamento === "Inativo") {
                        proximoStatusRelacionamento = "Ativo";
                      }

                      setForm({
                        ...form,
                        ativo,
                        statusRelacionamento: proximoStatusRelacionamento,
                      });
                    }}
                  />
                  <span>
                    Cliente ativo
                    <small>Desative para preservar histórico sem exibir na operação.</small>
                  </span>
                </label>
              )}

              {podeUsarCRMFollowUp && (
                <label>
                  Relacionamento
                  <select
                    value={form.statusRelacionamento}
                    onChange={(e) =>
                      setForm({ ...form, statusRelacionamento: e.target.value })
                    }
                  >
                    {STATUS_RELACIONAMENTO.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="crm-field-full">
                Endereço
                <input
                  value={form.endereco}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                />
              </label>

              {podeUsarCRMFollowUp && (
                <>
                  <label>
                    Próxima ação
                    <input
                      value={form.proximaAcao}
                      onChange={(e) => setForm({ ...form, proximaAcao: e.target.value })}
                    />
                  </label>

                  <label>
                    Data da próxima ação
                    <input
                      type="date"
                      value={form.dataProximaAcao}
                      onChange={(e) =>
                        setForm({ ...form, dataProximaAcao: e.target.value })
                      }
                    />
                  </label>

                  <label className="crm-field-full">
                    Observações
                    <textarea
                      rows="3"
                      value={form.observacoes}
                      onChange={(e) =>
                        setForm({ ...form, observacoes: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="sales-button-secondary" onClick={fecharModal}>
                Cancelar
              </button>
              <button type="button" onClick={salvarCliente}>
                Salvar cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {clienteExclusaoBloqueada && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card crm-delete-modal-card">
            <div className="crm-delete-modal-header">
              <span className="crm-delete-icon warning">
                <AlertTriangle size={24} />
              </span>
              <div>
                <h3>Exclusão bloqueada</h3>
                <p>{clienteExclusaoBloqueada.nome}</p>
              </div>
            </div>

            <div className="crm-delete-warning">
              Este cliente possui histórico comercial/financeiro. Utilize
              "Desativar cliente" para preservar relatórios e auditoria.
            </div>

            <div className="crm-delete-summary">
              <span>Vendas vinculadas</span>
              <strong>{clienteExclusaoBloqueada.movimentacao.compras}</strong>
              <span>Total comprado</span>
              <strong>{moedaBR(clienteExclusaoBloqueada.movimentacao.totalComprado)}</strong>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setClienteExclusaoBloqueada(null)}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {clienteExclusao && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card crm-delete-modal-card">
            <div className="crm-delete-modal-header">
              <span className="crm-delete-icon danger">
                <Trash2 size={24} />
              </span>
              <div>
                <h3>Excluir cliente</h3>
                <p>{clienteExclusao.nome}</p>
              </div>
            </div>

            <div className="crm-delete-warning danger">
              Esta ação é permanente. O cadastro será removido porque não existem vendas, total comprado ou histórico comercial vinculado.
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="sales-button-secondary"
                disabled={excluindoCliente}
                onClick={() => setClienteExclusao(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="sales-button-danger"
                disabled={excluindoCliente}
                onClick={confirmarExclusaoCliente}
              >
                {excluindoCliente ? "Excluindo..." : "Excluir cliente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {clienteHistorico && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card crm-history-modal">
            <div className="crm-modal-header">
              <div>
                <h3>Histórico de compras</h3>
                <p>{clienteHistorico.nome}</p>
              </div>

              <button
                type="button"
                className="crm-icon-button"
                onClick={() => setClienteHistorico(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Pedido</th>
                    <th>Total</th>
                    <th>Pagamento</th>
                    <th>Expedição</th>
                    <th>Itens</th>
                    <th>Lucro</th>
                    <th>Margem</th>
                  </tr>
                </thead>

                <tbody>
                  {clienteHistorico.metricas.compras.map((venda, index) => (
                    <tr key={venda.id || index}>
                      <td>{formatarData(venda.data)}</td>
                      <td>{venda.numeroPedido || `PED-${String(index + 1).padStart(4, "0")}`}</td>
                      <td>{moedaBR(venda.total || 0)}</td>
                      <td>{venda.statusPagamento || "pendente"}</td>
                      <td>{venda.statusExpedicao || "Pendente"}</td>
                      <td>{obterItensResumo(venda)}</td>
                      <td>{moedaBR(venda.lucro || 0)}</td>
                      <td>{numeroBR(venda.margem || 0, 2)}%</td>
                    </tr>
                  ))}

                  {clienteHistorico.metricas.compras.length === 0 && (
                    <tr>
                      <td colSpan="8">Este cliente ainda não possui compras.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {podeUsarCRMWhatsapp && (
              <div className="crm-history-actions">
                <button type="button" onClick={() => abrirWhatsapp(clienteHistorico)}>
                  <MessageCircle size={18} />
                  Chamar no WhatsApp
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
