import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { useToast } from "../context/useToast";
import { useTableSort } from "../hooks/useTableSort";
import ActionMenu from "../components/ActionMenu";
import { dataBR, moedaBR } from "../utils/formatters";
import {
  PLANOS,
  assinaturaGratisPadrao,
  getLimiteUsuariosEfetivo,
  normalizarLimiteUsuariosManual,
} from "../config/planos";

const assinaturaPadraoCliente = assinaturaGratisPadrao;
const planos = Object.keys(PLANOS);
const statusAssinatura = ["active", "inactive", "blocked"];
const formasPagamento = ["", "manual", "pix", "cartao", "boleto"];

const formatarDataSistema = (valor) => {
  if (!valor) return "-";

  if (typeof valor === "string") {
    return valor.includes("-") ? dataBR(valor) : valor;
  }

  if (valor?.toDate) {
    return valor.toDate().toLocaleDateString("pt-BR");
  }

  if (valor instanceof Date) {
    return valor.toLocaleDateString("pt-BR");
  }

  return "-";
};

const obterTempoSistema = (valor) => {
  if (!valor) return 0;

  if (typeof valor === "string") {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? 0 : data.getTime();
  }

  if (valor?.toDate) return valor.toDate().getTime();
  if (valor instanceof Date) return valor.getTime();

  return 0;
};

const prepararFormAssinatura = (assinatura = {}) => ({
  ...assinaturaPadraoCliente,
  ...assinatura,
  vencimento: assinatura.vencimento || "",
  valorPago:
    assinatura.valorPago === null || assinatura.valorPago === undefined
      ? ""
      : String(assinatura.valorPago),
  formaPagamento: assinatura.formaPagamento || "",
  observacao: assinatura.observacao || "",
  limiteUsuariosManual:
    assinatura.limiteUsuariosManual === null ||
    assinatura.limiteUsuariosManual === undefined
      ? ""
      : String(assinatura.limiteUsuariosManual),
  motivoLiberacaoUsuarios: assinatura.motivoLiberacaoUsuarios || "",
});

const normalizarValorPago = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return null;

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
};

const getLimitePlanoUsuarios = (plano) =>
  PLANOS[plano]?.usuarios ?? PLANOS.gratis.usuarios;

export default function AdminClientes() {
  const { showToast } = useToast();
  const [clientes, setClientes] = useState([]);
  const [formularios, setFormularios] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [salvandoUid, setSalvandoUid] = useState(null);
  const [clienteLimite, setClienteLimite] = useState(null);
  const [limiteForm, setLimiteForm] = useState({
    limiteUsuariosManual: "",
    motivoLiberacaoUsuarios: "",
  });
  const [salvandoLimite, setSalvandoLimite] = useState(false);
  const ordenacaoClientes = useTableSort({
    chave: "cliente",
    direcao: "asc",
  });

  // ================================
  // 🔹 CARREGAR CLIENTES DO SAAS
  // ================================
  const carregarClientes = useCallback(async () => {
    setCarregando(true);

    try {
      const usersSnapshot = await getDocs(collection(db, "users"));

      const lista = await Promise.all(
        usersSnapshot.docs.map(async (userDoc) => {
          const uid = userDoc.id;
          const dadosUsuario = userDoc.data();
          const assinaturaRef = doc(db, "users", uid, "assinatura", "plano");

          const [assinaturaSnapshot, empresasSnapshot] = await Promise.all([
            getDoc(assinaturaRef).catch(() => null),
            getDocs(collection(db, "users", uid, "empresas")).catch(() => null),
          ]);

          const assinatura = assinaturaSnapshot?.exists()
            ? assinaturaSnapshot.data()
            : assinaturaPadraoCliente;

          return {
            uid,
            ...dadosUsuario,
            assinatura: prepararFormAssinatura(assinatura),
            quantidadeEmpresas: empresasSnapshot?.size ?? "-",
          };
        })
      );

      const formulariosIniciais = lista.reduce((acc, cliente) => {
        acc[cliente.uid] = prepararFormAssinatura(cliente.assinatura);
        return acc;
      }, {});

      setClientes(lista);
      setFormularios(formulariosIniciais);
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
      showToast("Erro ao carregar clientes.", "error");
    } finally {
      setCarregando(false);
    }
  }, [showToast]);

  useEffect(() => {
    // Carrega os usuários quando a área Admin é aberta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarClientes();
  }, [carregarClientes]);

  // ================================
  // 🔹 EDIÇÃO INLINE DA ASSINATURA
  // ================================
  const atualizarCampo = (uid, campo, valor) => {
    setFormularios((atual) => ({
      ...atual,
      [uid]: {
        ...atual[uid],
        [campo]: valor,
      },
    }));
  };

  // ================================
  // 🔹 SALVAR PLANO MANUALMENTE
  // ================================
  const salvarPlano = async (cliente) => {
    const form = prepararFormAssinatura(formularios[cliente.uid]);
    const assinaturaRef = doc(db, "users", cliente.uid, "assinatura", "plano");

    setSalvandoUid(cliente.uid);

    try {
      await setDoc(assinaturaRef, {
        plano: form.plano,
        status: form.status,
        vencimento: form.vencimento || null,
        ativadoManual: true,
        formaPagamento: form.formaPagamento || "manual",
        valorPago: normalizarValorPago(form.valorPago),
        observacao: form.observacao || "",
        atualizadoEm: new Date(),
      }, { merge: true });

      showToast("Plano atualizado com sucesso.", "success");
      await carregarClientes();
    } catch (error) {
      console.error("Erro ao atualizar plano:", error);
      showToast("Erro ao atualizar plano.", "error");
    } finally {
      setSalvandoUid(null);
    }
  };

  const abrirModalLimiteUsuarios = (cliente) => {
    const assinatura = prepararFormAssinatura(
      formularios[cliente.uid] || cliente.assinatura
    );

    setClienteLimite(cliente);
    setLimiteForm({
      limiteUsuariosManual: assinatura.limiteUsuariosManual || "",
      motivoLiberacaoUsuarios: assinatura.motivoLiberacaoUsuarios || "",
    });
  };

  const fecharModalLimite = () => {
    if (salvandoLimite) return;

    setClienteLimite(null);
    setLimiteForm({
      limiteUsuariosManual: "",
      motivoLiberacaoUsuarios: "",
    });
  };

  const limparLimiteUsuarios = () => {
    setLimiteForm({
      limiteUsuariosManual: "",
      motivoLiberacaoUsuarios: "",
    });
  };

  const salvarLimiteUsuarios = async () => {
    if (!clienteLimite) return;

    const limiteRaw = String(limiteForm.limiteUsuariosManual || "").trim();
    const limiteNumero = limiteRaw === "" ? 0 : Number(limiteRaw);

    if (!Number.isFinite(limiteNumero) || limiteNumero < 0) {
      showToast("Informe um limite manual valido, sem numero negativo.", "warning");
      return;
    }

    const limiteManual = normalizarLimiteUsuariosManual(limiteNumero);
    const assinaturaRef = doc(db, "users", clienteLimite.uid, "assinatura", "plano");

    setSalvandoLimite(true);

    try {
      await setDoc(assinaturaRef, {
        limiteUsuariosManual: limiteManual,
        motivoLiberacaoUsuarios: limiteManual
          ? String(limiteForm.motivoLiberacaoUsuarios || "").trim()
          : "",
        limiteUsuariosAtualizadoPor: auth.currentUser?.uid || "",
        limiteUsuariosAtualizadoEm: new Date(),
        atualizadoEm: new Date(),
      }, { merge: true });

      showToast(
        limiteManual
          ? "Limite manual de usuarios atualizado com sucesso."
          : "Limite manual de usuarios removido com sucesso.",
        "success"
      );
      setClienteLimite(null);
      setLimiteForm({
        limiteUsuariosManual: "",
        motivoLiberacaoUsuarios: "",
      });
      await carregarClientes();
    } catch (error) {
      console.error("Erro ao atualizar limite de usuarios:", error);
      showToast("Erro ao atualizar limite de usuarios.", "error");
    } finally {
      setSalvandoLimite(false);
    }
  };

  const totais = useMemo(() => {
    return clientes.reduce((acc, cliente) => {
      const status = cliente.assinatura?.status || "active";
      const plano = cliente.assinatura?.plano || "gratis";

      acc.total += 1;
      acc[status] = (acc[status] || 0) + 1;
      acc.planos[plano] = (acc.planos[plano] || 0) + 1;

      return acc;
    }, {
      total: 0,
      active: 0,
      inactive: 0,
      blocked: 0,
      planos: {},
    });
  }, [clientes]);

  const clientesOrdenados = ordenacaoClientes.ordenar(
    clientes,
    (cliente, chave) => {
      const form = formularios[cliente.uid] || assinaturaPadraoCliente;
      const valores = {
        cliente: cliente.email || cliente.nome || cliente.displayName || "",
        role: cliente.role || "cliente",
        empresas:
          cliente.quantidadeEmpresas === "-"
            ? -1
            : Number(cliente.quantidadeEmpresas || 0),
        criadoEm: obterTempoSistema(cliente.criadoEm),
        plano: form.plano || "",
        status: form.status || "",
        vencimento: form.vencimento || "",
        formaPagamento: form.formaPagamento || "",
        valorPago: normalizarValorPago(form.valorPago) ?? 0,
        limiteUsuariosPlano: getLimitePlanoUsuarios(form.plano),
        limiteUsuariosManual:
          normalizarLimiteUsuariosManual(form.limiteUsuariosManual) || 0,
        limiteUsuariosEfetivo:
          getLimiteUsuariosEfetivo(form.plano, form.limiteUsuariosManual) || 0,
        observacao: form.observacao || "",
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

  return (
    <div className="admin-page">
      <div className="admin-header page-header">
        <div>
          <h1 className="page-title">Admin Master</h1>
          <p className="page-subtitle">
            Gerencie clientes, planos, status de acesso e liberações manuais do Renovar ERP.
          </p>
        </div>

        <button onClick={carregarClientes} disabled={carregando}>
          Atualizar lista
        </button>
      </div>

      <div className="admin-summary-grid">
        <div className="card admin-metric admin-metric-blue">
          <p>Clientes</p>
          <h2>{totais.total}</h2>
          <small>Usuários cadastrados</small>
        </div>

        <div className="card admin-metric admin-metric-green">
          <p>Ativos</p>
          <h2>{totais.active}</h2>
          <small>Assinaturas liberadas</small>
        </div>

        <div className="card admin-metric admin-metric-amber">
          <p>Inativos</p>
          <h2>{totais.inactive}</h2>
          <small>Aguardando liberação</small>
        </div>

        <div className="card admin-metric admin-metric-red">
          <p>Bloqueados</p>
          <h2>{totais.blocked}</h2>
          <small>Acesso bloqueado</small>
        </div>
      </div>

      <div className="card admin-table-card">
        <h3>Clientes do SaaS</h3>

        {carregando ? (
          <p className="admin-muted">Carregando clientes...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{renderCabecalhoOrdenavel("Cliente", "cliente", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Role", "role", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Empresas", "empresas", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Criado em", "criadoEm", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Plano", "plano", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Status", "status", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Vencimento", "vencimento", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Pagamento", "formaPagamento", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Valor", "valorPago", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Limite plano", "limiteUsuariosPlano", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Limite manual", "limiteUsuariosManual", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Limite efetivo", "limiteUsuariosEfetivo", ordenacaoClientes)}</th>
                <th>{renderCabecalhoOrdenavel("Observação", "observacao", ordenacaoClientes)}</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {clientesOrdenados.map((cliente) => {
                const form = formularios[cliente.uid] || assinaturaPadraoCliente;
                const limitePlanoUsuarios = getLimitePlanoUsuarios(form.plano);
                const limiteManualUsuarios = normalizarLimiteUsuariosManual(
                  form.limiteUsuariosManual
                );
                const limiteEfetivoUsuarios = getLimiteUsuariosEfetivo(
                  form.plano,
                  form.limiteUsuariosManual
                );

                return (
                  <tr key={cliente.uid}>
                    <td>
                      <strong>{cliente.email || "E-mail não informado"}</strong>
                      <small className="admin-client-name">
                        {cliente.nome || cliente.displayName || "Nome não informado"}
                      </small>
                    </td>

                    <td>
                      <span className="admin-pill">{cliente.role || "cliente"}</span>
                    </td>

                    <td>{cliente.quantidadeEmpresas}</td>
                    <td>{formatarDataSistema(cliente.criadoEm)}</td>

                    <td>
                      <select
                        value={form.plano}
                        onChange={(e) => atualizarCampo(cliente.uid, "plano", e.target.value)}
                      >
                        {planos.map((plano) => (
                          <option key={plano} value={plano}>
                            {plano}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <select
                        value={form.status}
                        onChange={(e) => atualizarCampo(cliente.uid, "status", e.target.value)}
                      >
                        {statusAssinatura.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <input
                        type="date"
                        value={form.vencimento || ""}
                        onChange={(e) => atualizarCampo(cliente.uid, "vencimento", e.target.value)}
                      />
                    </td>

                    <td>
                      <select
                        value={form.formaPagamento}
                        onChange={(e) => atualizarCampo(cliente.uid, "formaPagamento", e.target.value)}
                      >
                        {formasPagamento.map((forma) => (
                          <option key={forma} value={forma}>
                            {forma || "sem forma definida"}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={form.valorPago ?? ""}
                        onChange={(e) => atualizarCampo(cliente.uid, "valorPago", e.target.value)}
                      />
                      <small className="admin-muted">
                        {form.valorPago === "" ? "Sem valor informado" : moedaBR(form.valorPago)}
                      </small>
                    </td>

                    <td>{limitePlanoUsuarios}</td>

                    <td>
                      {limiteManualUsuarios ? (
                        <span className="admin-user-limit-manual">
                          {limiteManualUsuarios}
                        </span>
                      ) : (
                        <span className="admin-muted">Sem override</span>
                      )}
                    </td>

                    <td>
                      <strong>{limiteEfetivoUsuarios}</strong>
                    </td>

                    <td>
                      <textarea
                        value={form.observacao}
                        onChange={(e) => atualizarCampo(cliente.uid, "observacao", e.target.value)}
                        placeholder="Observação interna"
                      />
                    </td>

                    <td>
                      <ActionMenu
                        label="Abrir ações do cliente"
                        items={[
                          {
                            label:
                              salvandoUid === cliente.uid
                                ? "Salvando..."
                                : "Salvar plano",
                            disabled: salvandoUid === cliente.uid,
                            onClick: () => salvarPlano(cliente),
                          },
                          {
                            label: "Ajustar limite de usuarios",
                            onClick: () => abrirModalLimiteUsuarios(cliente),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}

              {clientes.length === 0 && (
                <tr>
                  <td colSpan="14">Nenhum cliente encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {clienteLimite && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card admin-user-limit-modal">
            <h3>Ajustar limite de usuarios</h3>
            <p className="admin-user-limit-subtitle">
              {clienteLimite.email || clienteLimite.nome || clienteLimite.uid}
            </p>

            {(() => {
              const assinatura = prepararFormAssinatura(
                formularios[clienteLimite.uid] || clienteLimite.assinatura
              );
              const limitePlanoUsuarios = getLimitePlanoUsuarios(assinatura.plano);
              const limiteManualUsuarios = normalizarLimiteUsuariosManual(
                limiteForm.limiteUsuariosManual
              );
              const limiteEfetivoUsuarios = getLimiteUsuariosEfetivo(
                assinatura.plano,
                limiteForm.limiteUsuariosManual
              );

              return (
                <>
                  <div className="admin-user-limit-grid">
                    <div>
                      <span>Plano atual</span>
                      <strong>{assinatura.plano}</strong>
                    </div>
                    <div>
                      <span>Limite do plano</span>
                      <strong>{limitePlanoUsuarios}</strong>
                    </div>
                    <div>
                      <span>Limite manual</span>
                      <strong>{limiteManualUsuarios || "Sem override"}</strong>
                    </div>
                    <div>
                      <span>Limite efetivo</span>
                      <strong>{limiteEfetivoUsuarios}</strong>
                    </div>
                  </div>

                  <label>
                    Limite manual de usuarios
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={limiteForm.limiteUsuariosManual}
                      onChange={(e) =>
                        setLimiteForm({
                          ...limiteForm,
                          limiteUsuariosManual: e.target.value,
                        })
                      }
                      placeholder="Ex: 5"
                    />
                  </label>

                  <label>
                    Motivo da liberacao
                    <textarea
                      rows="3"
                      value={limiteForm.motivoLiberacaoUsuarios}
                      onChange={(e) =>
                        setLimiteForm({
                          ...limiteForm,
                          motivoLiberacaoUsuarios: e.target.value,
                        })
                      }
                      placeholder="Ex: liberacao comercial aprovada pelo suporte"
                    />
                  </label>
                </>
              );
            })()}

            <div className="modal-actions">
              <button
                type="button"
                className="confirm-secondary"
                onClick={fecharModalLimite}
                disabled={salvandoLimite}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="confirm-secondary"
                onClick={limparLimiteUsuarios}
                disabled={salvandoLimite}
              >
                Limpar limite manual
              </button>
              <button
                type="button"
                onClick={salvarLimiteUsuarios}
                disabled={salvandoLimite}
              >
                {salvandoLimite ? "Salvando..." : "Salvar limite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
