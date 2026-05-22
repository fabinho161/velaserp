import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  AlertTriangle,
  Clock,
  Factory,
  ShoppingCart,
} from "lucide-react";

import { useERP } from "../context/useERP";
import { useTableSort } from "../hooks/useTableSort";
import { extrairNumeroPedido } from "../utils/sortUtils";

const MIN_CHART_WIDTH = 80;
const MIN_CHART_HEIGHT = 180;
const LIMITE_LABEL_PRODUTO_GRAFICO = 18;

const abreviarTexto = (texto, limite = LIMITE_LABEL_PRODUTO_GRAFICO) => {
  const valor = String(texto || "").trim();

  if (valor.length <= limite) return valor;

  return `${valor.slice(0, limite - 1)}…`;
};

const formatarQuantidade = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });

function ProducaoProdutoTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const dados = payload[0]?.payload || {};
  const unidade = dados.unidade ? ` ${dados.unidade}` : "";

  return (
    <div className="chart-tooltip">
      <strong>{dados.produto}</strong>
      <span>
        {formatarQuantidade(dados.quantidade)}
        {unidade} produzidos
      </span>
    </div>
  );
}

function ChartFrame({ children }) {
  const frameRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return undefined;

    let animationFrame = 0;
    const updateSize = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const { width, height } = element.getBoundingClientRect();
        setReady(width >= MIN_CHART_WIDTH && height >= MIN_CHART_HEIGHT);
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(animationFrame);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="chart-box" ref={frameRef}>
      {ready ? children : <div className="chart-placeholder">Carregando gráfico...</div>}
    </div>
  );
}

export default function Dashboard() {
  const { vendas, producoes, insumos, despesas } = useERP();
  const ordenacaoPedidos = useTableSort({
    chave: "",
    direcao: "asc",
  });


  const moeda = (valor) =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const formatarDataBR = (data) => {
    if (!data) return "-";
    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
  };

  const faturamento = vendas.reduce((t, v) => t + Number(v.total || 0), 0);
  const lucro = vendas.reduce((t, v) => t + Number(v.lucro || 0), 0);
  const totalPedidos = vendas.length;
  const ticketMedio = totalPedidos > 0 ? faturamento / totalPedidos : 0;

  const despesasTotal = despesas.reduce(
    (t, d) => t + Number(d.valor || 0),
    0
  );

  const saldo = faturamento - despesasTotal;

  const pedidosPendentes = vendas.filter(
    (v) => v.statusExpedicao !== "Entregue"
  ).length;

  const faturamentoPorDia = Object.values(
    vendas.reduce((acc, venda) => {
      const data = venda.data || "Sem data";

      if (!acc[data]) {
        acc[data] = {
          data,
          faturamento: 0,
          lucro: 0,
        };
      }

      acc[data].faturamento += Number(venda.total || 0);
      acc[data].lucro += Number(venda.lucro || 0);

      return acc;
    }, {})
  ).map((item) => ({
    ...item,
    dataBR: formatarDataBR(item.data),
  })).sort((a, b) => {
    const dataA = a.data === "Sem data" ? new Date(0) : new Date(a.data);
    const dataB = b.data === "Sem data" ? new Date(0) : new Date(b.data);

    return dataA - dataB;
  });

  const produtosVendidos = {};

  vendas.forEach((venda) => {
    const itensVenda =
      venda.itens && Array.isArray(venda.itens)
        ? venda.itens
        : venda.produto
        ? [
            {
              produto: venda.produto,
              quantidade: venda.quantidade,
              total: venda.total,
              lucro: venda.lucro,
            },
          ]
        : [];

    itensVenda.forEach((item) => {
      if (!produtosVendidos[item.produto]) {
        produtosVendidos[item.produto] = {
          produto: item.produto,
          quantidade: 0,
          faturamento: 0,
          lucro: 0,
        };
      }

      produtosVendidos[item.produto].quantidade += Number(item.quantidade || 0);
      produtosVendidos[item.produto].faturamento += Number(item.total || 0);
      produtosVendidos[item.produto].lucro += Number(item.lucro || 0);
    });
  });

  const rankingProdutos = Object.values(produtosVendidos).sort(
    (a, b) => b.lucro - a.lucro
  );

  const producaoPorProduto = Object.values(
    producoes.reduce((acc, producao) => {
      const produto =
        producao.produto ||
        [producao.codigo, producao.nomeProduto, producao.tipo]
          .filter(Boolean)
          .join(" - ") ||
        "Produto sem nome";
      const unidade =
        producao.unidade ||
        producao.unidadeProduto ||
        producao.unidadeMedida ||
        "";

      if (!acc[produto]) {
        acc[produto] = {
          produto,
          produtoCurto: abreviarTexto(produto),
          unidade,
          quantidade: 0,
        };
      }

      acc[produto].quantidade += Number(producao.quantidade || 0);

      if (!acc[produto].unidade && unidade) {
        acc[produto].unidade = unidade;
      }

      return acc;
    }, {})
  ).sort((a, b) => b.quantidade - a.quantidade);

  const estoqueInsumosZerados = insumos.filter(
    (i) => Number(i.estoque || 0) <= 0
  );

  const totalProduzido = producoes.reduce(
    (t, p) => t + Number(p.quantidade || 0),
    0
  );

  const ultimosPedidosBase = [...vendas].slice(-5).reverse();
  const ultimosPedidos = ordenacaoPedidos.ordenar(
    ultimosPedidosBase,
    (pedido, chave) => {
      const valores = {
        numeroPedido: extrairNumeroPedido(pedido.numeroPedido),
        cliente: pedido.cliente || "",
        data: pedido.data || "",
        total: Number(pedido.total || 0),
        lucro: Number(pedido.lucro || 0),
        statusExpedicao: pedido.statusExpedicao || "Pendente",
      };

      return valores[chave] ?? "";
    }
  );

  const renderCabecalhoOrdenavel = (label, chave, sort) => {
    const ativo = sort.ativo(chave);

    return (
      <button
        type="button"
        className={ativo ? "table-sort-button active" : "table-sort-button"}
        onClick={() => sort.ordenarPor(chave)}
      >
        <span>{label}</span>
        {ativo && <span aria-hidden="true">{sort.indicador(chave)}</span>}
      </button>
    );
  };

  const statusOperacional = [
    {
      label: "Total de pedidos",
      valor: totalPedidos,
      classe: "operational-neutral",
      Icone: ShoppingCart,
    },
    {
      label: "Pedidos pendentes",
      valor: pedidosPendentes,
      classe: "operational-warning",
      Icone: Clock,
    },
    {
      label: "Insumos zerados",
      valor: estoqueInsumosZerados.length,
      classe: "operational-danger",
      Icone: AlertTriangle,
    },
    {
      label: "Total produzido",
      valor: `${totalProduzido} un.`,
      classe: "operational-success",
      Icone: Factory,
    },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Executivo</h1>
          <p className="page-subtitle">
            Acompanhe vendas, produção, estoque e financeiro em uma visão rápida
            da operação.
          </p>
        </div>
      </div>

      <div className="summary-grid">
        <div className="card metric-card metric-green">
          <p>Faturamento</p>
          <h2>{moeda(faturamento)}</h2>
          <small>Total vendido</small>
        </div>

        <div className="card metric-card metric-purple">
          <p>Lucro</p>
          <h2>{moeda(lucro)}</h2>
          <small>Lucro acumulado</small>
        </div>

        <div
          className={`card metric-card ${saldo >= 0 ? "metric-blue" : "metric-red"}`}
        >
          <p>Saldo</p>
          <h2>
            {moeda(saldo)}
          </h2>
          <small>Faturamento - despesas</small>
        </div>

        <div className="card metric-card metric-amber">
          <p>Ticket Médio</p>
          <h2>{moeda(ticketMedio)}</h2>
          <small>Média por pedido</small>
        </div>
      </div>

      <div className="dashboard-chart-grid">
        <div className="card dashboard-chart-card">
          <h3>Faturamento por Dia</h3>

          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={faturamentoPorDia}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dataBR" />
                <YAxis />
                <Tooltip formatter={(value) => moeda(value)} />
                <Line type="monotone" dataKey="faturamento" stroke="#16a34a" />
                <Line type="monotone" dataKey="lucro" stroke="#7c3aed" />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <div className="card dashboard-chart-card">
          <h3>Produção por Produto</h3>

          {producaoPorProduto.length === 0 ? (
            <div className="chart-box">
              <div className="empty-state">Nenhuma produção registrada no período.</div>
            </div>
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={producaoPorProduto}
                  margin={{ top: 12, right: 12, left: 0, bottom: 34 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="produtoCurto"
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={68}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip content={<ProducaoProdutoTooltip />} />
                  <Bar
                    dataKey="quantidade"
                    fill="#2563eb"
                    name="Quantidade produzida"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </div>
      </div>

      <div className="dashboard-content-grid">
        <div className="card">
          <h3>Lucro por Produto</h3>

          <div className="product-profit-ranking">
            {rankingProdutos.length === 0 && (
              <div className="empty-state">Nenhum produto vendido no período.</div>
            )}

            {rankingProdutos.map((produto, index) => {
              const margemProduto =
                produto.faturamento > 0
                  ? (Number(produto.lucro || 0) / Number(produto.faturamento || 0)) * 100
                  : 0;
              const lucroNegativo = Number(produto.lucro || 0) < 0;

              return (
                <div key={produto.produto || index} className="product-profit-card">
                  <div className="product-profit-main">
                    <span className="product-profit-badge">{index + 1}º</span>

                    <div>
                      <strong>{produto.produto}</strong>
                      <small>{produto.quantidade} unidades vendidas</small>
                    </div>
                  </div>

                  <div className="product-profit-metrics">
                    <div>
                      <span>Faturamento</span>
                      <strong>{moeda(produto.faturamento)}</strong>
                    </div>

                    <div>
                      <span>Lucro</span>
                      <strong
                        className={
                          lucroNegativo
                            ? "product-profit-value negative"
                            : "product-profit-value positive"
                        }
                      >
                        {moeda(produto.lucro)}
                      </strong>
                    </div>

                    <div>
                      <span>Margem</span>
                      <strong>{margemProduto.toFixed(2)}%</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3>Status Operacional</h3>

          <div className="operational-grid">
            {statusOperacional.map(({ label, valor, classe, Icone }) => (
              <div key={label} className={`operational-card ${classe}`}>
                <div className="operational-icon">
                  <Icone size={20} aria-hidden="true" />
                </div>

                <div>
                  <strong className="operational-value">{valor}</strong>
                  <span className="operational-label">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Últimos Pedidos</h3>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>{renderCabecalhoOrdenavel("Nº Pedido", "numeroPedido", ordenacaoPedidos)}</th>
                <th>{renderCabecalhoOrdenavel("Cliente", "cliente", ordenacaoPedidos)}</th>
                <th>{renderCabecalhoOrdenavel("Data", "data", ordenacaoPedidos)}</th>
                <th>{renderCabecalhoOrdenavel("Total", "total", ordenacaoPedidos)}</th>
                <th>{renderCabecalhoOrdenavel("Lucro", "lucro", ordenacaoPedidos)}</th>
                <th>{renderCabecalhoOrdenavel("Status", "statusExpedicao", ordenacaoPedidos)}</th>
              </tr>
            </thead>

            <tbody>
              {ultimosPedidos.map((pedido, index) => (
                <tr key={pedido.id || index}>
                  <td>{pedido.numeroPedido || "-"}</td>
                  <td>{pedido.cliente}</td>
                  <td>{formatarDataBR(pedido.data)}</td>
                  <td>{moeda(pedido.total)}</td>
                  <td>{moeda(pedido.lucro)}</td>
                  <td>
                    <span
                      className={
                        pedido.statusExpedicao === "Entregue"
                          ? "badge badge-success"
                          : "badge badge-warning"
                      }
                    >
                      {pedido.statusExpedicao || "Pendente"}
                    </span>
                  </td>
                </tr>
              ))}

              {ultimosPedidos.length === 0 && (
                <tr>
                  <td colSpan="6">Nenhum pedido registrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
