import { useCallback, useEffect, useState } from "react";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { useConfirmacao } from "../context/useConfirmacao";
import { useTableSort } from "../hooks/useTableSort";
import ActionMenu from "../components/ActionMenu";
import { moedaBR, numeroBR, dataBR } from "../utils/formatters";
import { useParametros } from "../hooks/useParametros";
import {
  normalizarUnidade,
  obterUnidadesCompativeis,
  prepararCompraInsumo,
} from "../utils/unidadesMedida";

export default function Insumos() {
  // ================================
  // 🔹 CONTEXTO GLOBAL
  // ================================
  const {
    insumos,
    producoes,
    perdasDoacoes = [],
    addItem,
    updateItem,
    deleteItem,
  } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();
  const { unidadesMedida = [] } = useParametros();

  const unidadesAtivas = unidadesMedida.filter((unidade) => unidade.ativo);

  // ================================
  // 🔹 FORMULÁRIO DE INSUMO
  // ================================
  const [novoInsumo, setNovoInsumo] = useState({
    nome: "",
    unidade: unidadesAtivas[0]?.id || "kg",
  });

  // ================================
  // 🔹 FORMULÁRIO DE COMPRA
  // ================================
  const [novaCompra, setNovaCompra] = useState({
    insumoIndex: "",
    data: "",
    quantidade: "",
    unidadeCompra: "",
    valorTotal: "",
  });

  // ================================
  // 🔹 CONTROLES DE EDIÇÃO
  // ================================
  const [editInsumoIndex, setEditInsumoIndex] = useState(null);

  const [editCompra, setEditCompra] = useState({
    insumoIndex: null,
    compraIndex: null,
  });

  const ordenacaoInsumos = useTableSort({
    chave: "nome",
    direcao: "asc",
  });

  const insumoCompraSelecionado =
    novaCompra.insumoIndex !== "" ? insumos[Number(novaCompra.insumoIndex)] : null;

  const unidadeEstoqueCompra = normalizarUnidade(insumoCompraSelecionado?.unidade);

  const unidadesCompraCompativeis = unidadeEstoqueCompra
    ? obterUnidadesCompativeis(unidadeEstoqueCompra, unidadesAtivas)
    : [];

  const unidadeCompraJaListada = unidadesCompraCompativeis.some(
    (unidade) => normalizarUnidade(unidade.id) === unidadeEstoqueCompra
  );

  const unidadesCompraDisponiveis =
    unidadeEstoqueCompra && !unidadeCompraJaListada
      ? [
          {
            id: unidadeEstoqueCompra,
            nome: unidadeEstoqueCompra,
            ativo: true,
          },
          ...unidadesCompraCompativeis,
        ]
      : unidadesCompraCompativeis;

  const obterRotuloUnidade = (unidadeId) => {
    const idNormalizado = normalizarUnidade(unidadeId);
    const unidade = unidadesMedida.find(
      (item) => normalizarUnidade(item?.id) === idNormalizado
    );

    return unidade?.nome || idNormalizado;
  };

  // ================================
  // 🔹 CUSTO MÉDIO
  // ================================
  const calcularCustoMedio = (compras = []) => {
    const qtdTotal = compras.reduce(
      (total, compra) => total + Number(compra.quantidade || 0),
      0
    );

    const valorTotal = compras.reduce(
      (total, compra) => total + Number(compra.valorTotal || 0),
      0
    );

    return qtdTotal > 0 ? valorTotal / qtdTotal : 0;
  };

  // ================================
  // 🔹 TOTAL COMPRADO
  // ================================
  const calcularTotalComprado = useCallback((compras = []) => {
    return compras.reduce(
      (total, compra) => total + Number(compra.quantidade || 0),
      0
    );
  }, []);

  // ================================
  // 🔹 TOTAL CONSUMIDO NA PRODUÇÃO
  // ================================
  const calcularTotalConsumido = useCallback((nomeInsumo) => {
    let totalConsumido = 0;

    producoes.forEach((producao) => {
      producao.consumos?.forEach((consumo) => {
        if (consumo.nome === nomeInsumo) {
          totalConsumido += Number(consumo.quantidadeTotal || 0);
        }
      });
    });

    return totalConsumido;
  }, [producoes]);

  const calcularTotalBaixado = useCallback((insumo) => {
    return (perdasDoacoes || []).reduce((total, registro) => {
      const tipoItem = String(registro.tipoItem || "produto").toLowerCase();
      const status = String(registro.status || "ativo").toLowerCase();

      if (tipoItem !== "insumo" || status === "cancelado") return total;

      const mesmoId = insumo.id && registro.insumoId === insumo.id;
      const mesmoNome =
        String(registro.insumoNome || "").trim().toLowerCase() ===
        String(insumo.nome || "").trim().toLowerCase();

      return mesmoId || mesmoNome
        ? total + Number(registro.quantidade || 0)
        : total;
    }, 0);
  }, [perdasDoacoes]);

  // ================================
  // 🔹 ESTOQUE REAL AUTOMÁTICO
  // Compras - Consumo das Produções
  // ================================
  const calcularEstoqueReal = useCallback((insumo) => {
    const totalComprado = calcularTotalComprado(insumo.compras || []);
    const totalConsumido = calcularTotalConsumido(insumo.nome);
    const totalBaixado = calcularTotalBaixado(insumo);

    return totalComprado - totalConsumido - totalBaixado;
  }, [calcularTotalBaixado, calcularTotalComprado, calcularTotalConsumido]);

  // ================================
  // 🔹 RECALCULAR ESTOQUE AUTOMATICAMENTE
  // Sem botão. Sempre que compras ou produções mudarem,
  // o estoque dos insumos é atualizado.
  // ================================
  useEffect(() => {
  const listaRecalculada = insumos.map((insumo) => {
    const estoqueReal = calcularEstoqueReal(insumo);

    return {
      ...insumo,
      estoque: estoqueReal,
    };
  });

  const mudou = listaRecalculada.some(
    (insumo, index) =>
      Number(insumo.estoque || 0).toFixed(6) !==
      Number(insumos[index]?.estoque || 0).toFixed(6)
  );

    if (mudou) {
      listaRecalculada.forEach((insumo, index) => {
        const atual = insumos[index];

        if (
          atual?.id &&
          Number(insumo.estoque || 0).toFixed(6) !==
            Number(atual.estoque || 0).toFixed(6)
        ) {
          updateItem("insumos", atual.id, {
            estoque: insumo.estoque,
          });
        }
      });
    }
  }, [calcularEstoqueReal, insumos, updateItem]);

  // ================================
  // 🔹 LIMPAR FORMULÁRIO DE INSUMO
  // ================================
  const limparInsumo = () => {
    setNovoInsumo({
      nome: "",
      unidade: unidadesAtivas[0]?.id || "kg",
    });

    setEditInsumoIndex(null);
  };

  // ================================
  // 🔹 LIMPAR FORMULÁRIO DE COMPRA
  // ================================
  const limparCompra = () => {
    setNovaCompra({
      insumoIndex: "",
      data: "",
      quantidade: "",
      unidadeCompra: "",
      valorTotal: "",
    });

    setEditCompra({
      insumoIndex: null,
      compraIndex: null,
    });
  };

  // ================================
  // 🔹 SALVAR / ATUALIZAR INSUMO
  // ================================
  const salvarInsumo = async () => {
  if (!novoInsumo.nome || !novoInsumo.unidade) {
    showToast("Informe o nome e a unidade do insumo.", "warning");
    return;
  }

  if (editInsumoIndex !== null) {
    const insumo = insumos[editInsumoIndex];

    await updateItem("insumos", insumo.id, {
      nome: novoInsumo.nome,
      unidade: novoInsumo.unidade,
    });
  } else {
    await addItem("insumos", {
      nome: novoInsumo.nome,
      unidade: novoInsumo.unidade,
      estoque: 0,
      compras: [],
    });
    }

    limparInsumo();
    };

  // ================================
  // 🔹 EDITAR INSUMO
  // ================================
  const editarInsumo = (index) => {
    const insumo = insumos[index];

    setNovoInsumo({
      nome: insumo.nome,
      unidade: insumo.unidade,
    });

    setEditInsumoIndex(index);
  };

  // ================================
  // 🔹 EXCLUIR INSUMO
  // ================================
  const excluirInsumo = async (index) => {
  const confirmado = await confirmar(
        "Deseja excluir este insumo e todo o histórico de compras?"
    );

    if (!confirmado) return;

    const insumo = insumos[index];

    await deleteItem("insumos", insumo.id);

    if (editInsumoIndex === index) {
        limparInsumo();
    }
    };

  // ================================
  // 🔹 SALVAR / ATUALIZAR COMPRA
  // ================================
  const salvarCompra = async () => {
    if (
      novaCompra.insumoIndex === "" ||
      !novaCompra.data ||
      !novaCompra.quantidade ||
      !novaCompra.unidadeCompra ||
      !novaCompra.valorTotal
    ) {
      showToast("Preencha todos os dados da compra.", "warning");
      return;
    }

    const insumoIndex = Number(novaCompra.insumoIndex);
    const insumo = insumos[insumoIndex];

    if (!insumo) {
      showToast("Selecione um insumo válido.", "warning");
      return;
    }

    const compraPreparada = prepararCompraInsumo({
      data: novaCompra.data,
      quantidade: novaCompra.quantidade,
      valorTotal: novaCompra.valorTotal,
      unidadeCompra: novaCompra.unidadeCompra,
      unidadeEstoque: insumo.unidade,
      unidades: unidadesAtivas,
    });

    if (!compraPreparada.ok) {
      const mensagens = {
        quantidade_invalida: "Informe uma quantidade válida.",
        quantidade_negativa: "Informe uma quantidade válida.",
        quantidade_normalizada_invalida: "Informe uma quantidade válida.",
        valor_total_invalido: "Informe um valor total válido.",
        unidade_invalida: "Unidade da compra incompatível com a unidade do insumo.",
        unidade_desconhecida: "Unidade da compra incompatível com a unidade do insumo.",
        grupo_conversao_invalido: "Unidade da compra incompatível com a unidade do insumo.",
        fator_base_invalido: "Unidade da compra incompatível com a unidade do insumo.",
        unidades_incompativeis: "Unidade da compra incompatível com a unidade do insumo.",
      };

      showToast(
        mensagens[compraPreparada.motivo] ||
          "Unidade da compra incompatível com a unidade do insumo.",
        "warning"
      );
      return;
    }

    const listaAtualizada = insumos.map((insumo) => ({
      ...insumo,
      compras: [...(insumo.compras || [])],
    }));

    if (
      editCompra.insumoIndex !== null &&
      editCompra.compraIndex !== null
    ) {
      listaAtualizada[editCompra.insumoIndex].compras[editCompra.compraIndex] =
        compraPreparada.compra;
    } else {
      listaAtualizada[insumoIndex].compras.push(compraPreparada.compra);
    }

    await updateItem("insumos", insumo.id, {
    compras: listaAtualizada[insumoIndex].compras,
    });
    limparCompra();
  };

  // ================================
  // 🔹 EDITAR COMPRA
  // ================================
  const editarCompra = (insumoIndex, compraIndex) => {
    const insumo = insumos[insumoIndex];
    const compra = insumo.compras[compraIndex];
    const unidadeEstoque = normalizarUnidade(compra.unidadeEstoque || insumo.unidade);

    setNovaCompra({
      insumoIndex,
      data: compra.data,
      quantidade: compra.quantidadeInformada ?? compra.quantidade,
      unidadeCompra: normalizarUnidade(compra.unidadeCompra || unidadeEstoque),
      valorTotal: compra.valorTotal,
    });

    setEditCompra({
      insumoIndex,
      compraIndex,
    });
  };

  // ================================
  // 🔹 EXCLUIR COMPRA
  // ================================
    const excluirCompra = async (insumoIndex, compraIndex) => {
    const confirmado = await confirmar("Deseja excluir esta compra?");
    if (!confirmado) return;

    const insumo = insumos[insumoIndex];

    const comprasAtualizadas = (insumo.compras || []).filter(
        (_, index) => index !== compraIndex
    );

    await updateItem("insumos", insumo.id, {
        compras: comprasAtualizadas,
    });

    limparCompra();
    };

  // ================================
  // 🔹 RESUMOS
  // ================================
  const valorTotalEstoque = insumos.reduce((total, insumo) => {
    const custoMedio = calcularCustoMedio(insumo.compras || []);
    const estoque = Number(insumo.estoque || 0);

    return total + estoque * custoMedio;
  }, 0);

  const totalInsumos = insumos.length;

  const insumosBaixos = insumos.filter(
    (insumo) => Number(insumo.estoque || 0) <= 0
  ).length;

  const insumosOrdenados = ordenacaoInsumos.ordenar(
    insumos.map((insumo, index) => {
      const totalComprado = calcularTotalComprado(insumo.compras || []);
      const totalConsumido = calcularTotalConsumido(insumo.nome);
      const estoqueAtual = Number(insumo.estoque || 0);
      const custoMedio = calcularCustoMedio(insumo.compras || []);
      const valorEstoque = estoqueAtual * custoMedio;
      const estoqueBaixo = estoqueAtual <= 0;

      return {
        insumo,
        index,
        totalComprado,
        totalConsumido,
        estoqueAtual,
        custoMedio,
        valorEstoque,
        status: estoqueBaixo ? "Baixo" : "OK",
      };
    }),
    (item, chave) => {
      const valores = {
        nome: item.insumo.nome || "",
        unidade: item.insumo.unidade || "",
        totalComprado: item.totalComprado,
        totalConsumido: item.totalConsumido,
        estoqueAtual: item.estoqueAtual,
        custoMedio: item.custoMedio,
        valorEstoque: item.valorEstoque,
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
  // 🔹 RENDERIZAÇÃO
  // ================================
  return (
    <div>
      <h1 className="page-title">Insumos</h1>

      {/* ================================
          🔹 CARDS RESUMO
      ================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "18px",
          marginBottom: "25px",
        }}
      >
        <div className="card" style={{ borderLeft: "5px solid #2563eb" }}>
          <p style={{ color: "#64748b" }}>Insumos cadastrados</p>
          <h2 style={{ color: "#2563eb" }}>{totalInsumos}</h2>
          <small>Matérias-primas e custos</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #16a34a" }}>
          <p style={{ color: "#64748b" }}>Valor em estoque</p>
          <h2 style={{ color: "#16a34a" }}>
            R$ {numeroBR(valorTotalEstoque,2)}
          </h2>
          <small>Baseado no custo médio</small>
        </div>

        <div className="card" style={{ borderLeft: "5px solid #dc2626" }}>
          <p style={{ color: "#64748b" }}>Insumos zerados</p>
          <h2 style={{ color: "#dc2626" }}>{insumosBaixos}</h2>
          <small>Estoque igual ou abaixo de zero</small>
        </div>
      </div>

      {/* ================================
          🔹 CADASTRO / EDIÇÃO DE INSUMO
      ================================= */}
      <div className="card">
        <h3>{editInsumoIndex !== null ? "Editar Insumo" : "Novo Insumo"}</h3>

        <div className="form-grid">
          <input
            placeholder="Nome do insumo"
            value={novoInsumo.nome}
            onChange={(e) =>
              setNovoInsumo({ ...novoInsumo, nome: e.target.value })
            }
          />

          <select
            value={novoInsumo.unidade}
            onChange={(e) =>
              setNovoInsumo({ ...novoInsumo, unidade: e.target.value })
            }
          >
            {unidadesAtivas.map((unidade) => (
              <option key={unidade.id} value={unidade.id}>
                {unidade.nome}
              </option>
            ))}
          </select>

          <button onClick={salvarInsumo}>
            {editInsumoIndex !== null ? "Atualizar Insumo" : "Adicionar Insumo"}
          </button>

          {editInsumoIndex !== null && (
            <button onClick={limparInsumo}>Cancelar</button>
          )}
        </div>
      </div>

      <br />

      {/* ================================
          🔹 REGISTRO / EDIÇÃO DE COMPRA
      ================================= */}
      <div className="card">
        <h3>
          {editCompra.compraIndex !== null
            ? "Editar Compra"
            : "Registrar Compra"}
        </h3>

        <div className="form-grid">
          <select
            value={novaCompra.insumoIndex}
            onChange={(e) => {
              const insumoSelecionado = insumos[Number(e.target.value)];
              const unidadeCompra = normalizarUnidade(insumoSelecionado?.unidade);

              setNovaCompra({
                ...novaCompra,
                insumoIndex: e.target.value,
                unidadeCompra,
              });
            }}
            disabled={editCompra.compraIndex !== null}
          >
            <option value="">Selecione o insumo</option>

            {insumos.map((insumo, index) => (
              <option key={index} value={index}>
                {insumo.nome}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={novaCompra.data}
            onChange={(e) =>
              setNovaCompra({ ...novaCompra, data: e.target.value })
            }
          />

          <input
            type="number"
            step="0.001"
            placeholder="Quantidade comprada"
            value={novaCompra.quantidade}
            onChange={(e) =>
              setNovaCompra({ ...novaCompra, quantidade: e.target.value })
            }
          />

          <select
            value={novaCompra.unidadeCompra}
            onChange={(e) =>
              setNovaCompra({ ...novaCompra, unidadeCompra: e.target.value })
            }
            disabled={!insumoCompraSelecionado}
          >
            <option value="">Unidade da compra</option>
            {unidadesCompraDisponiveis.map((unidade) => (
              <option key={unidade.id} value={normalizarUnidade(unidade.id)}>
                {unidade.nome || unidade.id}
              </option>
            ))}
          </select>

          <input
            type="number"
            step="0.01"
            placeholder="Valor total da compra"
            value={novaCompra.valorTotal}
            onChange={(e) =>
              setNovaCompra({ ...novaCompra, valorTotal: e.target.value })
            }
          />

          <button onClick={salvarCompra}>
            {editCompra.compraIndex !== null
              ? "Atualizar Compra"
              : "Adicionar Compra"}
          </button>

          {editCompra.compraIndex !== null && (
            <button onClick={limparCompra}>Cancelar</button>
          )}
        </div>
      </div>

      <br />

      {/* ================================
          🔹 TABELA PRINCIPAL DE INSUMOS
      ================================= */}
      <div className="card">
        <h3>Estoque de Insumos</h3>

        <div className="table-wrapper">
          <table>
          <thead>
            <tr>
              <th>{renderCabecalhoOrdenavel("Insumo", "nome", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Unidade", "unidade", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Total Comprado", "totalComprado", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Total Consumido", "totalConsumido", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Estoque Atual", "estoqueAtual", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Custo Médio", "custoMedio", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Valor em Estoque", "valorEstoque", ordenacaoInsumos)}</th>
              <th>{renderCabecalhoOrdenavel("Status", "status", ordenacaoInsumos)}</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {insumosOrdenados.map(({
              insumo,
              index,
              totalComprado,
              totalConsumido,
              estoqueAtual,
              custoMedio,
              valorEstoque,
            }) => {
              const estoqueBaixo = estoqueAtual <= 0;

              return (
                <tr key={index}>
                  <td>{insumo.nome}</td>
                  <td>{insumo.unidade}</td>

                  <td>
                    {numeroBR(totalComprado, 3)} {insumo.unidade}
                  </td>

                  <td>
                    {numeroBR(totalConsumido, 3)} {insumo.unidade}
                  </td>

                  <td style={{ color: estoqueBaixo ? "#dc2626" : "#16a34a" }}>
                    {numeroBR(estoqueAtual, 3)} {insumo.unidade}
                  </td>

                  <td>
                    R$ {numeroBR(custoMedio, 2)} / {insumo.unidade}
                  </td>

                  <td>R$ {numeroBR(valorEstoque, 2)}</td>

                  <td>
                    <span
                      style={{
                        padding: "5px 10px",
                        borderRadius: "20px",
                        background: estoqueBaixo ? "#fee2e2" : "#dcfce7",
                        color: estoqueBaixo ? "#991b1b" : "#166534",
                      }}
                    >
                      {estoqueBaixo ? "Baixo" : "OK"}
                    </span>
                  </td>

                  <td>
                    <ActionMenu
                      label="Abrir ações do insumo"
                      items={[
                        {
                          label: "Editar insumo",
                          onClick: () => editarInsumo(index),
                        },
                        {
                          label: "Excluir insumo",
                          danger: true,
                          onClick: () => excluirInsumo(index),
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}

            {insumos.length === 0 && (
              <tr>
                <td colSpan="9">Nenhum insumo cadastrado.</td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      <br />

      {/* ================================
          🔹 HISTÓRICO DE COMPRAS
      ================================= */}
      <div className="card">
        <h3>Histórico de Compras</h3>
<br />
        {insumos.map((insumo, insumoIndex) => (
          <div key={insumoIndex} style={{ marginBottom: "30px" }}>
            <h4>{insumo.nome}</h4>

            <div className="table-wrapper">
              <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Quantidade</th>
                  <th>Valor Total</th>
                  <th>Custo Unitário</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {insumo.compras?.map((compra, compraIndex) => {
                  const quantidadeExibida =
                    compra.quantidadeInformada ?? compra.quantidade;
                  const unidadeExibida =
                    compra.unidadeCompra || compra.unidadeEstoque || insumo.unidade;
                  const unidadeCusto = compra.unidadeEstoque || insumo.unidade;

                  return (
                  <tr key={compraIndex}>
                    <td>{dataBR(compra.data)}</td>

                    
                      <td>
                      {numeroBR(quantidadeExibida, 3)} {obterRotuloUnidade(unidadeExibida)}
                    </td>

                    <td>
                      {moedaBR(compra.valorTotal)}
                    </td>

                    <td>
                      {Number(compra.quantidade) > 0
                        ? `${moedaBR(compra.valorTotal / compra.quantidade)} / ${unidadeCusto}`
                        : moedaBR(0)}
                    </td>

                    <td>
                      <ActionMenu
                        label="Abrir ações da compra"
                        items={[
                          {
                            label: "Editar compra",
                            onClick: () =>
                              editarCompra(insumoIndex, compraIndex),
                          },
                          {
                            label: "Excluir compra",
                            danger: true,
                            onClick: () =>
                              excluirCompra(insumoIndex, compraIndex),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                  );
                })}

                {(!insumo.compras || insumo.compras.length === 0) && (
                  <tr>
                    <td colSpan="5">Nenhuma compra registrada.</td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
