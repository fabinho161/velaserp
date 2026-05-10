import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Users, ShieldCheck, Clock3 } from "lucide-react";
import ActionMenu from "../components/ActionMenu";
import { useConfirmacao } from "../context/useConfirmacao";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { usePlano } from "../hooks/usePlano";
import {
  PERFIS_EMPRESA,
  PERFIL_DONO_EMPRESA,
  getPerfilEmpresaConfig,
  normalizarRoleEmpresa,
} from "../config/perfisEmpresa";

const usuarioInicial = {
  nome: "",
  email: "",
  role: "visualizacao",
};

const formatarDataSistema = (valor) => {
  if (!valor) return "-";
  if (valor?.toDate) return valor.toDate().toLocaleDateString("pt-BR");
  if (valor instanceof Date) return valor.toLocaleDateString("pt-BR");

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "-" : data.toLocaleDateString("pt-BR");
};

const normalizarStatus = (status = "pendente") =>
  String(status || "pendente").trim().toLowerCase();

const getStatusBadgeClass = (status) => {
  const normalizado = normalizarStatus(status);

  if (normalizado === "ativo") return "badge-success";
  if (normalizado === "inativo") return "badge-danger";
  return "badge-warning";
};

const getStatusLabel = (status) => {
  const labels = {
    ativo: "Ativo",
    inativo: "Inativo",
    pendente: "Pendente",
  };

  return labels[normalizarStatus(status)] || "Pendente";
};

const getStatusEnvioConvite = (status) => {
  const labels = {
    enviado: "Enviado",
    erro: "Erro",
    nao_configurado: "Nao configurado",
  };

  return labels[String(status || "").trim()] || "Nao enviado";
};

const getStatusEnvioBadgeClass = (status) => {
  const normalizado = String(status || "").trim();

  if (normalizado === "enviado") return "badge-success";
  if (normalizado === "erro" || normalizado === "nao_configurado") return "badge-danger";
  return "badge-warning";
};

export default function UsuariosEmpresa() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirmar } = useConfirmacao();
  const {
    user,
    isAdminMaster,
    usuariosEmpresa = [],
    usuariosEmpresaCarregando,
    usuarioEmpresaAtual,
    podeGerenciarUsuariosEmpresa,
    criarUsuarioEmpresa,
    atualizarUsuarioEmpresa,
    desativarUsuarioEmpresa,
    renovarConviteUsuarioEmpresa,
    enviarConviteEmailUsuarioEmpresa,
    excluirUsuarioEmpresa,
  } = useERP();
  const {
    limiteUsuariosEfetivo,
    limiteUsuariosManual,
    limiteUsuariosPlano,
    planoAtual,
  } = usePlano();

  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [form, setForm] = useState(usuarioInicial);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [enviandoEmailId, setEnviandoEmailId] = useState(null);

  const usuariosOrdenados = useMemo(
    () =>
      [...usuariosEmpresa].sort((a, b) => {
        if (a.dono && !b.dono) return -1;
        if (!a.dono && b.dono) return 1;
        return String(a.nome || a.email || "").localeCompare(
          String(b.nome || b.email || ""),
          "pt-BR",
          { numeric: true, sensitivity: "base" }
        );
      }),
    [usuariosEmpresa]
  );

  const totalUsuarios = Math.max(usuariosEmpresa.length, 1);
  const usuariosAtivos = usuariosEmpresa.filter(
    (usuarioEmpresa) => normalizarStatus(usuarioEmpresa.status) === "ativo"
  ).length;
  const convitesPendentes = usuariosEmpresa.filter(
    (usuarioEmpresa) => normalizarStatus(usuarioEmpresa.status) === "pendente"
  ).length;
  const limiteAtingido =
    limiteUsuariosEfetivo !== null &&
    totalUsuarios >= Number(limiteUsuariosEfetivo || 0);
  const podeCriarUsuario =
    (isAdminMaster || podeGerenciarUsuariosEmpresa) && !limiteAtingido;

  const limparFormulario = () => {
    setForm(usuarioInicial);
    setUsuarioEditando(null);
  };

  const fecharModais = () => {
    if (salvando) return;
    setModalNovoAberto(false);
    limparFormulario();
  };

  const abrirNovoUsuario = () => {
    if (!podeGerenciarUsuariosEmpresa && !isAdminMaster) {
      showToast("Voce nao tem permissao para gerenciar usuarios.", "warning");
      return;
    }

    if (limiteAtingido) {
      showToast(
        isAdminMaster
          ? "Limite atingido. Ajuste o limite manual em Admin Clientes, se necessario."
          : "Limite de usuarios atingido para este plano. Entre em contato para liberar usuarios adicionais.",
        "warning"
      );
      return;
    }

    limparFormulario();
    setModalNovoAberto(true);
  };

  const salvarNovoUsuario = async () => {
    setSalvando(true);

    try {
      const criado = await criarUsuarioEmpresa(form);

      if (criado) {
        fecharModais();
      }
    } finally {
      setSalvando(false);
    }
  };

  const montarLinkConvite = (token) => {
    if (!token) return "";
    return `${window.location.origin}/aceitar-convite/${token}`;
  };

  const copiarTexto = async (texto) => {
    if (!texto) return false;

    if (!navigator.clipboard?.writeText) {
      showToast("Seu navegador nao permitiu copiar automaticamente.", "warning");
      return false;
    }

    await navigator.clipboard.writeText(texto);
    return true;
  };

  const copiarLinkConvite = async (usuarioEmpresa) => {
    const link = montarLinkConvite(usuarioEmpresa.conviteToken);

    if (!link) {
      showToast("Este convite ainda nao possui link. Gere um novo link.", "warning");
      return;
    }

    const copiado = await copiarTexto(link);

    if (copiado) {
      showToast("Link do convite copiado.", "success");
    }
  };

  const renovarLinkConvite = async (usuarioEmpresa) => {
    const token = await renovarConviteUsuarioEmpresa(usuarioEmpresa.id);

    if (token) {
      const copiado = await copiarTexto(montarLinkConvite(token));

      if (copiado) {
        showToast("Novo link gerado e copiado.", "success");
      }
    }
  };

  const enviarConviteEmail = async (usuarioEmpresa) => {
    setEnviandoEmailId(usuarioEmpresa.id);

    try {
      await enviarConviteEmailUsuarioEmpresa(usuarioEmpresa.id);
    } finally {
      setEnviandoEmailId(null);
    }
  };

  const abrirEdicaoPerfil = (usuarioEmpresa) => {
    setUsuarioEditando(usuarioEmpresa);
    setForm({
      nome: usuarioEmpresa.nome || "",
      email: usuarioEmpresa.email || "",
      role: normalizarRoleEmpresa(usuarioEmpresa),
    });
  };

  const salvarPerfil = async () => {
    if (!usuarioEditando) return;

    if (usuarioEditando.dono && form.role !== PERFIL_DONO_EMPRESA) {
      showToast("O dono da empresa deve permanecer como administrador.", "warning");
      return;
    }

    setSalvando(true);

    try {
      const atualizado = await atualizarUsuarioEmpresa(usuarioEditando.id, {
        role: normalizarRoleEmpresa(form.role),
      });

      if (atualizado) {
        showToast("Perfil atualizado com sucesso.", "success");
        fecharModais();
      }
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusUsuario = async (usuarioEmpresa) => {
    if (usuarioEmpresa.dono) {
      showToast("O dono da empresa nao pode ser desativado.", "warning");
      return;
    }

    if (usuarioEmpresa.uidAuth && usuarioEmpresa.uidAuth === user?.uid) {
      showToast("Voce nao pode desativar seu proprio usuario.", "warning");
      return;
    }

    const statusAtual = normalizarStatus(usuarioEmpresa.status);

    if (statusAtual === "pendente") {
      showToast("Convites pendentes devem ser ativados pelo fluxo de convite/login.", "warning");
      return;
    }

    const proximoStatus = statusAtual === "ativo" ? "inativo" : "ativo";
    const confirmado = await confirmar(
      `Deseja marcar ${usuarioEmpresa.nome || usuarioEmpresa.email} como ${getStatusLabel(proximoStatus)}?`
    );

    if (!confirmado) return;

    if (proximoStatus === "inativo") {
      await desativarUsuarioEmpresa(usuarioEmpresa.id);
      return;
    }

    await atualizarUsuarioEmpresa(usuarioEmpresa.id, {
      status: "ativo",
      convitePendente: false,
    });
  };

  const excluirConvite = async (usuarioEmpresa) => {
    if (usuarioEmpresa.dono) {
      showToast("O dono da empresa nao pode ser removido.", "warning");
      return;
    }

    if (normalizarStatus(usuarioEmpresa.status) !== "pendente") {
      showToast("Apenas convites pendentes podem ser cancelados.", "warning");
      return;
    }

    const confirmado = await confirmar(
      `Deseja cancelar o convite de ${usuarioEmpresa.nome || usuarioEmpresa.email}?`
    );

    if (!confirmado) return;

    const excluido = await excluirUsuarioEmpresa(usuarioEmpresa.id);

    if (excluido) {
      showToast("Convite cancelado com sucesso.", "success");
    }
  };

  if (!podeGerenciarUsuariosEmpresa && !isAdminMaster) {
    return (
      <div className="users-company-page">
        <div className="card plan-locked-card module-locked-card">
          <div className="module-locked-icon">
            <ShieldCheck size={24} />
          </div>
          <span className="module-locked-badge">Permissao restrita</span>
          <h2>Usuarios da Empresa</h2>
          <p>Voce nao tem permissao para gerenciar usuarios nesta empresa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users-company-page">
      <div className="page-header users-company-header">
        <div>
          <h1 className="page-title">Usuarios da Empresa</h1>
          <p className="page-subtitle">
            Gerencie convites, perfis e acessos da empresa ativa sem afetar a
            administracao global do Renovar ERP.
          </p>
        </div>

        <button type="button" onClick={abrirNovoUsuario} disabled={!podeCriarUsuario}>
          <UserPlus size={18} />
          Novo usuario
        </button>
      </div>

      {limiteAtingido && (
        <div className="plan-locked-inline users-company-limit-alert">
          <span>
            {isAdminMaster
              ? "Limite atingido. Ajuste o limite manual em Admin Clientes, se necessario."
              : "Limite de usuarios atingido para este plano. Entre em contato para liberar usuarios adicionais."}
          </span>
          <button type="button" onClick={() => navigate("/planos")}>
            Ver planos
          </button>
        </div>
      )}

      <div className="summary-grid users-company-summary">
        <div className="card metric-card metric-blue">
          <p>Usuarios usados</p>
          <h2>{totalUsuarios}</h2>
          <small>Inclui o dono da conta</small>
        </div>

        <div className="card metric-card metric-purple">
          <p>Limite efetivo</p>
          <h2>{limiteUsuariosEfetivo === null ? "Livre" : limiteUsuariosEfetivo}</h2>
          <small>
            Plano {planoAtual}
            {limiteUsuariosManual
              ? ` | manual ${limiteUsuariosManual} sobre plano ${limiteUsuariosPlano}`
              : ""}
          </small>
        </div>

        <div className="card metric-card metric-green">
          <p>Usuarios ativos</p>
          <h2>{usuariosAtivos}</h2>
          <small>Acesso liberado</small>
        </div>

        <div className="card metric-card metric-amber">
          <p>Convites pendentes</p>
          <h2>{convitesPendentes}</h2>
          <small>Aguardando ativacao</small>
        </div>
      </div>

      <div className="card users-company-table-card">
        <div className="users-company-table-header">
          <div>
            <h3>Equipe da empresa</h3>
            <p>Perfis aplicados apenas dentro da empresa ativa.</p>
          </div>
          <span>{usuariosOrdenados.length} registro(s)</span>
        </div>

        {usuariosEmpresaCarregando ? (
          <div className="empty-state">Carregando usuarios...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>UID Auth</th>
                  <th>Criado em</th>
                  <th>Expira em</th>
                  <th>E-mail</th>
                  <th>Acoes</th>
                </tr>
              </thead>

              <tbody>
                {usuariosOrdenados.map((usuarioEmpresa) => {
                  const perfilConfig = getPerfilEmpresaConfig(
                    normalizarRoleEmpresa(usuarioEmpresa)
                  );
                  const statusAtual = normalizarStatus(usuarioEmpresa.status);
                  const usuarioAtual =
                    usuarioEmpresa.uidAuth &&
                    usuarioEmpresa.uidAuth === usuarioEmpresaAtual?.uidAuth;
                  const ultimoEnvio = usuarioEmpresa.ultimoEnvioConvite || {};
                  const enviandoEmail = enviandoEmailId === usuarioEmpresa.id;

                  return (
                    <tr key={usuarioEmpresa.id}>
                      <td>
                        <div className="users-company-user-cell">
                          <strong>{usuarioEmpresa.nome || "Usuario sem nome"}</strong>
                          <small>{usuarioEmpresa.email || "E-mail nao informado"}</small>
                          {usuarioEmpresa.dono && (
                            <span className="badge badge-info">Dono da empresa</span>
                          )}
                          {usuarioAtual && (
                            <span className="badge badge-purple">Voce</span>
                          )}
                        </div>
                      </td>
                      <td>{perfilConfig.label}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(statusAtual)}`}>
                          {getStatusLabel(statusAtual)}
                        </span>
                      </td>
                      <td>
                        <span className="users-company-auth-id">
                          {usuarioEmpresa.uidAuth || "Convite pendente"}
                        </span>
                      </td>
                      <td>{formatarDataSistema(usuarioEmpresa.criadoEm)}</td>
                      <td>
                        {statusAtual === "pendente"
                          ? formatarDataSistema(usuarioEmpresa.conviteExpiraEm)
                          : "-"}
                      </td>
                      <td>
                        {statusAtual === "pendente" ? (
                          <div className="users-company-email-status">
                            <span className={`badge ${getStatusEnvioBadgeClass(ultimoEnvio.statusEnvio)}`}>
                              {getStatusEnvioConvite(ultimoEnvio.statusEnvio)}
                            </span>
                            <small>{formatarDataSistema(ultimoEnvio.enviadoEm)}</small>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <ActionMenu
                          label="Abrir acoes do usuario"
                          items={[
                            {
                              label: enviandoEmail
                                ? "Enviando e-mail..."
                                : "Enviar convite por e-mail",
                              disabled: statusAtual !== "pendente" || enviandoEmail,
                              onClick: () => enviarConviteEmail(usuarioEmpresa),
                            },
                            {
                              label: "Copiar link do convite",
                              disabled: statusAtual !== "pendente",
                              onClick: () => copiarLinkConvite(usuarioEmpresa),
                            },
                            {
                              label: "Gerar novo link",
                              disabled: statusAtual !== "pendente" || usuarioEmpresa.dono,
                              onClick: () => renovarLinkConvite(usuarioEmpresa),
                            },
                            {
                              label: "Editar perfil",
                              onClick: () => abrirEdicaoPerfil(usuarioEmpresa),
                            },
                            {
                              label:
                                statusAtual === "ativo"
                                  ? "Desativar usuario"
                                  : "Ativar usuario",
                              disabled:
                                usuarioEmpresa.dono ||
                                statusAtual === "pendente" ||
                                usuarioAtual,
                              onClick: () => alternarStatusUsuario(usuarioEmpresa),
                            },
                            {
                              label: "Cancelar convite",
                              danger: true,
                              disabled: statusAtual !== "pendente" || usuarioEmpresa.dono,
                              onClick: () => excluirConvite(usuarioEmpresa),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}

                {usuariosOrdenados.length === 0 && (
                  <tr>
                    <td colSpan="8">Nenhum usuario cadastrado nesta empresa.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalNovoAberto && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card users-company-modal">
            <div className="users-company-modal-header">
              <div>
                <span className="badge badge-info">
                  <Clock3 size={14} />
                  Convite pendente
                </span>
                <h3>Novo usuario</h3>
                <p>O usuario sera salvo como convite pendente.</p>
              </div>
            </div>

            <div className="users-company-form-grid">
              <label>
                Nome
                <input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Nome do usuario"
                />
              </label>

              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="usuario@empresa.com"
                />
              </label>

              <label>
                Perfil
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {Object.entries(PERFIS_EMPRESA).map(([key, perfil]) => (
                    <option key={key} value={key}>
                      {perfil.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="confirm-secondary" onClick={fecharModais}>
                Cancelar
              </button>
              <button type="button" onClick={salvarNovoUsuario} disabled={salvando}>
                {salvando ? "Salvando..." : "Criar convite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {usuarioEditando && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card users-company-modal">
            <div className="users-company-modal-header">
              <div>
                <span className="badge badge-purple">
                  <Users size={14} />
                  Perfil de acesso
                </span>
                <h3>Editar perfil</h3>
                <p>{usuarioEditando.nome || usuarioEditando.email}</p>
              </div>
            </div>

            <div className="users-company-form-grid">
              <label>
                Perfil
                <select
                  value={form.role}
                  disabled={usuarioEditando.dono}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {Object.entries(PERFIS_EMPRESA).map(([key, perfil]) => (
                    <option key={key} value={key}>
                      {perfil.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {usuarioEditando.dono && (
              <div className="users-company-owner-note">
                O dono da empresa permanece sempre como Administrador da Empresa.
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="confirm-secondary" onClick={fecharModais}>
                Cancelar
              </button>
              <button type="button" onClick={salvarPerfil} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar perfil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
