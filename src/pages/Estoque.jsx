import { useEffect, useState } from "react";
import { useERP } from "../context/useERP";
import { useTableSort } from "../hooks/useTableSort";
import ActionMenu from "../components/ActionMenu";
import { numeroBR } from "../utils/formatters";
import { calcularEstoqueProdutos } from "../utils/estoqueProdutos";

const ESTOQUE_MINIMO_CONFIG = "estoqueMinimoProdutos";

const lerEstoqueMinimoLocal = () => {
  try {
    const localRaw = localStorage.getItem(ESTOQUE_MINIMO_CONFIG);
    return localRaw ? JSON.parse(localRaw) || {} : {};
  } catch (error) {
    console.error("Erro ao ler estoque mínimo local:", error);
    return {};
  }
};

export default function Estoque() {
  // ================================
  // 🔹 CONTEXTO GLOBAL
  // ================================
  const {
    empresaId,
    insumos,
    producoes,
    vendas,
    configuracoes,
    carregarConfiguracao,
    salvarConfiguracao,
  } = useERP();

  // ================================
  // 🔹 ESTOQUE MÍNIMO PERSISTENTE
  // ================================
  const [estoqueMinimoLocal, setEstoqueMinimoLocal] = useState({});
  const [carregandoMinimo, setCarregandoMinimo] = useState(true);
  const [editandoMinimo, setEditandoMinimo] = useState(null);
  const ordenacaoInsumos = useTableSort({
    chave: "insumo",
    direcao: "asc",
  });
  const ordenacaoProdutos = useTableSort({
    chave: "produto",
    direcao: "asc",
  });
  const configEstoqueMinimo = configuracoes?.[ESTOQUE_MINIMO_CONFIG];
  const estoqueMinimo = configEstoqueMinimo?.valores || estoqueMinimoLocal;

  useEffect(() => {
    if (!empresaId || !carregarConfiguracao || !salvarConfiguracao) return;

    let cancelado = false;

    const carregarEstoqueMinimo = async () => {
      setCarregandoMinimo(true);

      const configFirebase = await carregarConfiguracao(ESTOQUE_MINIMO_CONFIG);
      const minimoFirebase = configFirebase?.valores || {};

      if (Object.keys(minimoFirebase).length > 0) {
        if (!cancelado) {
          setEstoqueMinimoLocal(minimoFirebase);
          setCarregandoMinimo(false);
        }
        return;
      }

      const minimoLocal = lerEstoqueMinimoLocal();

      if (Object.keys(minimoLocal).length > 0) {
        await salvarConfiguracao(ESTOQUE_MINIMO_CONFIG, {
          valores: minimoLocal,
          migradoDoLocalStorageEm: new Date().toISOString(),
        });

        localStorage.removeItem(ESTOQUE_MINIMO_CONFIG);
      }

      if (!cancelado) {
        setEstoqueMinimoLocal(minimoLocal);
        setCarregandoMinimo(false);
      }
    };

    carregarEstoqueMinimo().catch((error) => {
      console.error("Erro ao carregar estoque mínimo:", error);
      if (!cancelado) setCarregandoMinimo(false);
    });

    return () => {
      cancelado = true;
    };
  }, [carregarConfiguracao, empresaId, salvarConfiguracao]);

  // ================================
  // 🔹 FORMATAR MOEDA
  // ================================
  const moeda = (valor) => {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  // ================================
  // 🔹 CUSTO MÉDIO DOS INSUMOS
  // ================================
  const calcularCustoMedio = (compras = []) => {
    const qtd = compras.reduce(
      (total, compra) => total + Number(compra.quantidade || 0),
      0
    );

    const valor = compras.reduce(
      (total, compra) => total + Number(compra.valorTotal || 0),
      0
    );

    return qtd > 0 ? valor / qtd : 0;
  };

  // ================================
  // 🔹 ESTOQUE DE PRODUTOS ACABADOS
  // Estoque = Produzido - Vendido
  // ================================
  const produtosEstoque = calcularEstoqueProdutos({ producoes, vendas });

  // ================================
  // 🔹 RESUMOS
  // ================================
  const valorTotalInsumos = insumos.reduce((total, insumo) => {
    const custoMedio = calcularCustoMedio(insumo.compras || []);
    return total + Number(insumo.estoque || 0) * custoMedio;
  }, 0);

  const valorTotalProdutos = produtosEstoque.reduce(
    (total, produto) => total + Number(produto.valorEstoque || 0),
    0
  );

  const produtosBaixos = produtosEstoque.filter((produto) => {
    const minimo = Number(estoqueMinimo[produto.produto] || 0);
    return minimo > 0 && produto.saldo <= minimo;
  });

  const insumosZerados = insumos.filter(
    (insumo) => Number(insumo.estoque || 0) <= 0
  );

  const insumosEstoqueOrdenados = ordenacaoInsumos.ordenar(
    insumos.map((insumo, index) => {
      const estoqueAtual = Number(insumo.estoque || 0);
      const custoMedio = calcularCustoMedio(insumo.compras || []);
      const valorEstoque = estoqueAtual * custoMedio;
      const baixo = estoqueAtual <= 0;

      return {
        insumo,
        index,
        estoqueAtual,
        custoMedio,
        valorEstoque,
        status: baixo ? "Baixo" : "OK",
      };
    }),
    (item, chave) => {
      const valores = {
        insumo: item.insumo.nome || "",
        estoqueAtual: item.estoqueAtual,
        custoMedio: item.custoMedio,
        valorEstoque: item.valorEstoque,
        status: item.status,
      };

      return valores[chave] ?? "";
    }
  );

  const produtosEstoqueOrdenados = ordenacaoProdutos.ordenar(
    produtosEstoque.map((produto, index) => {
      const minimo = Number(estoqueMinimo[produto.produto] || 0);
      const emAlerta = minimo > 0 && produto.saldo <= minimo;

      return {
        produto,
        index,
        minimo,
        status: emAlerta ? "Baixo" : "OK",
      };
    }),
    (item, chave) => {
      const valores = {
        produto: item.produto.produto || "",
        produzido: Number(item.produto.produzido || 0),
        vendido: Number(item.produto.vendido || 0),
        saldo: Number(item.produto.saldo || 0),
        custoMedio: Number(item.produto.custoMedio || 0),
        valorEstoque: Number(item.produto.valorEstoque || 0),
        minimo: item.minimo,
        status: item.status,
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

  // ================================
  // 🔹 SALVAR ESTOQUE MÍNIMO
  // ================================
  const salvarEstoqueMinimo = async (produto, valor) => {
    const valoresAtualizados = {
      ...estoqueMinimo,
      [produto]: Number(valor || 0),
    };

    setEstoqueMinimoLocal(valoresAtualizados);
    await salvarConfiguracao(ESTOQUE_MINIMO_CONFIG, {
      valores: valoresAtualizados,
      atualizadoEm: new Date().toISOString(),
    });

    setEditandoMinimo(null);
  };

  // ================================
  // 🔹 RENDERIZAÇÃO
  // ================================
  return (
    <div>
      <h1 className="page-title">Estoque</h1>

      {/* ================================
          🔹 CARDS RESUMO
      ================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "18px",
          marginBottom: "25px",
        }}
      >
        <div className="card" style={{ borderLeft: "5px solid #2563eb" }}>
          <p style={{ color: "#64748b" }}>Valor em Insumos</p>
          <h2 style={{ color: "#2563eb" }}>{moeda(valorTotalInsumos)}</h2>
          <small>Matéria-prima em estoque</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #16a34a" }}>
          <p style={{ color: "#64748b" }}>Valor Produto Acabado</p>
          <h2 style={{ color: "#16a34a" }}>{moeda(valorTotalProdutos)}</h2>
          <small>Produtos prontos</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #dc2626" }}>
          <p style={{ color: "#64748b" }}>Produtos em Alerta</p>
          <h2 style={{ color: "#dc2626" }}>{produtosBaixos.length}</h2>
          <small>Abaixo do mínimo</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #f59e0b" }}>
          <p style={{ color: "#64748b" }}>Insumos Zerados</p>
          <h2 style={{ color: "#f59e0b" }}>{insumosZerados.length}</h2>
          <small>Estoque igual ou abaixo de zero</small>
        </div>
      </div>

      {/* ================================
          🔹 ALERTAS
      ================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px",
          marginBottom: "25px",
        }}
      >
        <div className="card">
          <h3>Alertas de Produtos</h3>

          {carregandoMinimo ? (
            <p style={{ color: "#64748b", marginTop: "10px" }}>
              Carregando estoque mínimo...
            </p>
          ) : produtosBaixos.length > 0 ? (
            produtosBaixos.map((produto, index) => (
              <div
                key={index}
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  padding: "10px",
                  borderRadius: "8px",
                  marginTop: "10px",
                }}
              >
                ⚠ {produto.produto} — saldo: {produto.saldo} / mínimo:{" "}
                {estoqueMinimo[produto.produto]}
              </div>
            ))
          ) : (
            <p style={{ color: "#16a34a", marginTop: "10px" }}>
              ✅ Nenhum produto abaixo do estoque mínimo.
            </p>
          )}
        </div>

        <div className="card">
          <h3>Alertas de Insumos</h3>

          {insumosZerados.length > 0 ? (
            insumosZerados.map((insumo, index) => (
              <div
                key={index}
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  padding: "10px",
                  borderRadius: "8px",
                  marginTop: "10px",
                }}
              >
                ⚠ {insumo.nome} — estoque:{" "}
                {numeroBR(insumo.estoque || 0, 3)} {insumo.unidade}
              </div>
            ))
          ) : (
            <p style={{ color: "#16a34a", marginTop: "10px" }}>
              ✅ Nenhum insumo zerado.
            </p>
          )}
        </div>
      </div>

      {/* ================================
          🔹 ESTOQUE DE INSUMOS
      ================================= */}
      <div className="card">
        <h3>Estoque de Insumos</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Insumo", "insumo", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Estoque", "estoqueAtual", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Custo Médio", "custoMedio", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Valor em Estoque", "valorEstoque", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Status", "status", ordenacaoInsumos)}</th>
            </tr>
          </thead>

          <tbody>
            {insumosEstoqueOrdenados.map(({
              insumo,
              index,
              estoqueAtual,
              custoMedio,
              valorEstoque,
              status,
            }) => {
              const baixo = status === "Baixo";

              return (
                <tr key={index}>
                  <td>{insumo.nome}</td>

                  <td style={{ color: baixo ? "#dc2626" : "#16a34a" }}>
                    {numeroBR(estoqueAtual, 3)} {insumo.unidade}
                  </td>

                  <td>
                    {moeda(custoMedio)} / {insumo.unidade}
                  </td>

                  <td>{moeda(valorEstoque)}</td>

                  <td>
                    <span
                      style={{
                        padding: "5px 10px",
                        borderRadius: "20px",
                        background: baixo ? "#fee2e2" : "#dcfce7",
                        color: baixo ? "#991b1b" : "#166534",
                      }}
                    >
                      {baixo ? "Baixo" : "OK"}
                    </span>
                  </td>
                </tr>
              );
            })}

            {insumos.length === 0 && (
              <tr>
                <td colSpan="5">Nenhum insumo cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <br />

      {/* ================================
          🔹 ESTOQUE DE PRODUTOS ACABADOS
      ================================= */}
      <div className="card">
        <h3>Estoque de Produtos Acabados</h3>

        <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Produto", "produto", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Produzido", "produzido", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Vendido", "vendido", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Saldo", "saldo", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Custo Médio", "custoMedio", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Valor em Estoque", "valorEstoque", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Estoque Mínimo", "minimo", ordenacaoProdutos)}</th>
              <th>{renderCabecalhoOrdenavel("Status", "status", ordenacaoProdutos)}</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {produtosEstoqueOrdenados.map(({ produto, index, minimo, status }) => {
              const emAlerta = status === "Baixo";

              return (
                <tr key={index}>
                  <td>{produto.produto}</td>
                  <td>{produto.produzido}</td>
                  <td>{produto.vendido}</td>

                  <td style={{ color: emAlerta ? "#dc2626" : "#16a34a" }}>
                    {produto.saldo}
                  </td>

                  <td>{moeda(produto.custoMedio)}</td>
                  <td>{moeda(produto.valorEstoque)}</td>

                  <td>
                    {carregandoMinimo ? (
                      "Carregando..."
                    ) : editandoMinimo === produto.produto ? (
                      <input
                        type="number"
                        defaultValue={minimo}
                        autoFocus
                        onBlur={(e) =>
                          salvarEstoqueMinimo(produto.produto, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            salvarEstoqueMinimo(
                              produto.produto,
                              e.target.value
                            );
                          }
                        }}
                      />
                    ) : (
                      minimo
                    )}
                  </td>

                  <td>
                    <span
                      style={{
                        padding: "5px 10px",
                        borderRadius: "20px",
                        background: emAlerta ? "#fee2e2" : "#dcfce7",
                        color: emAlerta ? "#991b1b" : "#166534",
                      }}
                    >
                      {emAlerta ? "Baixo" : "OK"}
                    </span>
                  </td>

                  <td>
                    <ActionMenu
                      label="Abrir ações do estoque"
                      items={[
                        {
                          label: "Editar mínimo",
                          disabled: carregandoMinimo,
                          onClick: () => setEditandoMinimo(produto.produto),
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}

            {produtosEstoque.length === 0 && (
              <tr>
                <td colSpan="9">Nenhuma produção registrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
