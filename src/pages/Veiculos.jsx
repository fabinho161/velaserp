import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Car, Filter, Gauge, Plus, Search, Users } from "lucide-react";
import ActionMenu from "../components/ActionMenu";
import { useConfirmacao } from "../context/useConfirmacao";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { db } from "../firebase";

const veiculoInicial = {
  placa: "",
  marca: "",
  modelo: "",
  ano: "",
  chassi: "",
  renavam: "",
  quilometragem: "",
  clienteId: "",
  clienteNome: "",
  observacoes: "",
  status: "ativo",
};

const PERFIS_ESCRITA_VEICULOS = new Set([
  "administrador_empresa",
  "comercial",
  "producao",
]);

const normalizarTexto = (valor) => String(valor || "").trim();
const normalizarBusca = (valor) => normalizarTexto(valor).toLowerCase();
const normalizarStatus = (status = "ativo") =>
  String(status || "ativo").trim().toLowerCase() === "inativo" ? "inativo" : "ativo";

const formatarQuilometragem = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return "-";

  const numero = Number(valor);
  return Number.isFinite(numero) ? `${numero.toLocaleString("pt-BR")} km` : "-";
};

const getStatusBadgeClass = (status) =>
  normalizarStatus(status) === "ativo" ? "badge-success" : "badge-danger";

const getStatusLabel = (status) =>
  normalizarStatus(status) === "ativo" ? "Ativo" : "Inativo";

export default function Veiculos() {
  const {
    clientesComerciais = [],
    empresaId,
    empresaOwnerUid,
    isAdminMaster,
    perfilEmpresaAtual,
    user,
  } = useERP();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();

  const [veiculos, setVeiculos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [veiculoEditando, setVeiculoEditando] = useState(null);
  const [form, setForm] = useState(veiculoInicial);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const ownerUid = empresaOwnerUid || user?.uid || null;
  const podeEscreverVeiculos =
    isAdminMaster || PERFIS_ESCRITA_VEICULOS.has(perfilEmpresaAtual);

  const veiculosRef = useMemo(() => {
    if (!user || !empresaId || !ownerUid) return null;

    return collection(db, "users", ownerUid, "empresas", empresaId, "veiculos");
  }, [empresaId, ownerUid, user]);

  useEffect(() => {
    if (!veiculosRef) {
      return undefined;
    }

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
        setCarregando(false);
      },
      (error) => {
        console.error("Erro ao carregar veiculos:", error);
        showToast("Nao foi possivel carregar veiculos.", "error");
        setVeiculos([]);
        setCarregando(false);
      }
    );

    return () => unsubscribe();
  }, [showToast, veiculosRef]);

  const clientesParaSelecao = useMemo(() => {
    const clientes = clientesComerciais
      .filter((cliente) => cliente.ativo !== false || cliente.id === form.clienteId)
      .sort((a, b) =>
        String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
          numeric: true,
          sensitivity: "base",
        })
      );

    return clientes;
  }, [clientesComerciais, form.clienteId]);

  const veiculosFiltrados = useMemo(() => {
    const termo = normalizarBusca(busca);

    return veiculos.filter((veiculo) => {
      const status = normalizarStatus(veiculo.status);
      const confereStatus = filtroStatus === "todos" || status === filtroStatus;
      const texto = [
        veiculo.placa,
        veiculo.marca,
        veiculo.modelo,
        veiculo.clienteNome,
      ]
        .map(normalizarBusca)
        .join(" ");

      return confereStatus && (!termo || texto.includes(termo));
    });
  }, [busca, filtroStatus, veiculos]);

  const totalVeiculos = veiculos.length;
  const veiculosAtivos = veiculos.filter(
    (veiculo) => normalizarStatus(veiculo.status) === "ativo"
  ).length;
  const veiculosInativos = totalVeiculos - veiculosAtivos;

  const abrirNovoVeiculo = () => {
    if (!podeEscreverVeiculos) {
      showToast("Voce nao tem permissao para cadastrar veiculos.", "warning");
      return;
    }

    setVeiculoEditando(null);
    setForm(veiculoInicial);
    setModalAberto(true);
  };

  const abrirEdicaoVeiculo = (veiculo) => {
    if (!podeEscreverVeiculos) return;

    setVeiculoEditando(veiculo);
    setForm({
      placa: veiculo.placa || "",
      marca: veiculo.marca || "",
      modelo: veiculo.modelo || "",
      ano: veiculo.ano || "",
      chassi: veiculo.chassi || "",
      renavam: veiculo.renavam || "",
      quilometragem: veiculo.quilometragem ?? "",
      clienteId: veiculo.clienteId || "",
      clienteNome: veiculo.clienteNome || "",
      observacoes: veiculo.observacoes || "",
      status: normalizarStatus(veiculo.status),
    });
    setModalAberto(true);
  };

  const resetarModal = () => {
    setModalAberto(false);
    setVeiculoEditando(null);
    setForm(veiculoInicial);
  };

  const fecharModalSemDescartar = () => {
    if (salvando) return;
    setModalAberto(false);
  };

  const cancelarModal = () => {
    if (salvando) return;
    resetarModal();
  };

  const atualizarCampo = (campo, valor) => {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  };

  const montarPayloadVeiculo = () => {
    const clienteSelecionado = clientesComerciais.find(
      (cliente) => cliente.id === form.clienteId
    );
    const anoTratado = normalizarTexto(form.ano);
    const quilometragemTratada = normalizarTexto(form.quilometragem);

    return {
      placa: normalizarTexto(form.placa).toUpperCase(),
      marca: normalizarTexto(form.marca),
      modelo: normalizarTexto(form.modelo),
      ano: anoTratado ? Number(anoTratado) : "",
      chassi: normalizarTexto(form.chassi),
      renavam: normalizarTexto(form.renavam),
      quilometragem: quilometragemTratada ? Number(quilometragemTratada) : "",
      clienteId: clienteSelecionado?.id || "",
      clienteNome: clienteSelecionado?.nome || "",
      observacoes: normalizarTexto(form.observacoes),
      status: normalizarStatus(form.status),
      atualizadoEm: serverTimestamp(),
    };
  };

  const salvarVeiculo = async () => {
    if (!veiculosRef || !user || !empresaId) {
      showToast("Empresa ainda nao carregou. Aguarde e tente novamente.", "warning");
      return;
    }

    if (!podeEscreverVeiculos) {
      showToast("Voce nao tem permissao para salvar veiculos.", "warning");
      return;
    }

    if (!normalizarTexto(form.placa) || !normalizarTexto(form.marca) || !normalizarTexto(form.modelo)) {
      showToast("Preencha os campos obrigatórios.", "warning");
      return;
    }

    const anoTratado = normalizarTexto(form.ano);
    const anoNumero = Number(anoTratado);
    const anoLimite = new Date().getFullYear() + 1;

    if (
      anoTratado &&
      (!Number.isInteger(anoNumero) || anoNumero < 1900 || anoNumero > anoLimite)
    ) {
      showToast("Informe um ano de veiculo valido.", "warning");
      return;
    }

    const quilometragemTratada = normalizarTexto(form.quilometragem);
    const quilometragemNumero = Number(quilometragemTratada);

    if (
      quilometragemTratada &&
      (!Number.isFinite(quilometragemNumero) || quilometragemNumero < 0)
    ) {
      showToast("Informe uma quilometragem numerica maior ou igual a zero.", "warning");
      return;
    }

    setSalvando(true);

    try {
      const payload = montarPayloadVeiculo();

      if (veiculoEditando?.id) {
        await updateDoc(doc(veiculosRef, veiculoEditando.id), payload);
        showToast("Alterações salvas com sucesso.", "success");
      } else {
        await addDoc(veiculosRef, {
          ...payload,
          status: "ativo",
          criadoEm: serverTimestamp(),
        });
        showToast("Cadastro realizado com sucesso.", "success");
      }

      resetarModal();
    } catch (error) {
      console.error("Erro ao salvar veiculo:", error);
      showToast("Não foi possível salvar. Tente novamente.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusVeiculo = async (veiculo) => {
    if (!podeEscreverVeiculos || !veiculosRef || !veiculo?.id) return;

    const statusAtual = normalizarStatus(veiculo.status);
    const proximoStatus = statusAtual === "ativo" ? "inativo" : "ativo";
    const confirmado = await confirmar(
      `Deseja marcar ${veiculo.placa || "este veiculo"} como ${getStatusLabel(proximoStatus)}?`
    );

    if (!confirmado) return;

    try {
      await updateDoc(doc(veiculosRef, veiculo.id), {
        status: proximoStatus,
        atualizadoEm: serverTimestamp(),
      });
      showToast("Alterações salvas com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao alterar status do veiculo:", error);
      showToast("Não foi possível concluir a operação.", "error");
    }
  };

  return (
    <div className="page fornecedores-page">
      <div className="page-header">
        <div>
          <span className="badge badge-info fornecedores-eyebrow">
            <Car size={14} />
            Oficina
          </span>
          <h1 className="page-title">Veiculos</h1>
          <p className="page-subtitle">
            Cadastre os veiculos vinculados aos clientes da empresa ativa.
          </p>
        </div>

        {podeEscreverVeiculos && (
          <button type="button" onClick={abrirNovoVeiculo}>
            <Plus size={18} />
            Novo veiculo
          </button>
        )}
      </div>

      <div className="summary-grid fornecedores-summary">
        <div className="card metric-card metric-blue">
          <p>Veiculos cadastrados</p>
          <h2>{totalVeiculos}</h2>
          <small>Empresa ativa</small>
        </div>

        <div className="card metric-card metric-green">
          <p>Veiculos ativos</p>
          <h2>{veiculosAtivos}</h2>
          <small>Disponiveis para oficina</small>
        </div>

        <div className="card metric-card metric-amber">
          <p>Veiculos inativos</p>
          <h2>{veiculosInativos}</h2>
          <small>Preservados no cadastro</small>
        </div>
      </div>

      <section className="card fornecedores-card">
        <div className="fornecedores-card-header">
          <div className="fornecedores-title-block">
            <span className="fornecedores-main-icon">
              <Gauge size={22} />
            </span>

            <div>
              <span className="badge badge-purple">Veiculos</span>
              <h3>Cadastro da oficina</h3>
              <p>Dados basicos para ordens de servico futuras.</p>
            </div>
          </div>
        </div>

        <div className="fornecedores-toolbar">
          <label className="fornecedores-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Buscar por placa, marca, modelo ou cliente..."
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
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
          </label>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando veiculos...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Veiculo</th>
                  <th>Ano</th>
                  <th>Cliente</th>
                  <th>Quilometragem</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>

              <tbody>
                {veiculosFiltrados.map((veiculo) => (
                  <tr key={veiculo.id}>
                    <td>
                      <strong>{veiculo.placa || "-"}</strong>
                    </td>
                    <td>
                      <div className="fornecedores-cell-main">
                        <strong>{[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ") || "-"}</strong>
                        <small>{veiculo.chassi || "Chassi nao informado"}</small>
                      </div>
                    </td>
                    <td>{veiculo.ano || "-"}</td>
                    <td>{veiculo.clienteNome || "Sem cliente"}</td>
                    <td>{formatarQuilometragem(veiculo.quilometragem)}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(veiculo.status)}`}>
                        {getStatusLabel(veiculo.status)}
                      </span>
                    </td>
                    <td>
                      {podeEscreverVeiculos ? (
                        <ActionMenu
                          label="Abrir acoes do veiculo"
                          items={[
                            {
                              label: "Editar veiculo",
                              onClick: () => abrirEdicaoVeiculo(veiculo),
                            },
                            {
                              label:
                                normalizarStatus(veiculo.status) === "ativo"
                                  ? "Inativar veiculo"
                                  : "Ativar veiculo",
                              danger: normalizarStatus(veiculo.status) === "ativo",
                              onClick: () => alternarStatusVeiculo(veiculo),
                            },
                          ]}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}

                {veiculosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan="7">Nenhum veiculo encontrado.</td>
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
            className="modal-card fornecedores-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="fornecedores-modal-header">
              <div>
                <span className="badge badge-info">
                  <Users size={14} />
                  {veiculoEditando ? "Editar cadastro" : "Novo cadastro"}
                </span>
                <h3>{veiculoEditando ? "Editar veiculo" : "Novo veiculo"}</h3>
                <p>Dados principais para identificar o veiculo na oficina.</p>
              </div>
            </div>

            <div className="fornecedores-form-grid">
              <label>
                Placa *
                <input
                  value={form.placa}
                  onChange={(event) => atualizarCampo("placa", event.target.value)}
                  placeholder="ABC1D23"
                />
              </label>

              <label>
                Marca *
                <input
                  value={form.marca}
                  onChange={(event) => atualizarCampo("marca", event.target.value)}
                  placeholder="Ex: Fiat"
                />
              </label>

              <label>
                Modelo *
                <input
                  value={form.modelo}
                  onChange={(event) => atualizarCampo("modelo", event.target.value)}
                  placeholder="Ex: Strada"
                />
              </label>

              <label>
                Ano
                <input
                  type="number"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  value={form.ano}
                  onChange={(event) => atualizarCampo("ano", event.target.value)}
                  placeholder="2024"
                />
              </label>

              <label>
                Cliente
                <select
                  value={form.clienteId}
                  onChange={(event) => atualizarCampo("clienteId", event.target.value)}
                >
                  <option value="">Sem cliente</option>
                  {clientesParaSelecao.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nome || "Cliente sem nome"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Quilometragem
                <input
                  type="number"
                  min="0"
                  value={form.quilometragem}
                  onChange={(event) => atualizarCampo("quilometragem", event.target.value)}
                  placeholder="0"
                />
              </label>

              <label>
                Chassi
                <input
                  value={form.chassi}
                  onChange={(event) => atualizarCampo("chassi", event.target.value)}
                  placeholder="Chassi"
                />
              </label>

              <label>
                Renavam
                <input
                  value={form.renavam}
                  onChange={(event) => atualizarCampo("renavam", event.target.value)}
                  placeholder="Renavam"
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) => atualizarCampo("status", event.target.value)}
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>

              <label className="fornecedores-form-wide">
                Observacoes
                <textarea
                  value={form.observacoes}
                  onChange={(event) => atualizarCampo("observacoes", event.target.value)}
                  placeholder="Informacoes gerais sobre o veiculo"
                  rows={4}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="confirm-secondary" onClick={cancelarModal}>
                Cancelar
              </button>
              <button type="button" onClick={salvarVeiculo} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar veiculo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
