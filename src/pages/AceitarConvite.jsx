import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { CheckCircle2, Clock3, LogOut, ShieldAlert } from "lucide-react";
import { auth, db } from "../firebase";
import Login from "./Login";
import { getPerfilEmpresaConfig, normalizarRoleEmpresa } from "../config/perfisEmpresa";
import { useToast } from "../context/useToast";

const dataSistema = (valor) => {
  if (!valor) return null;
  if (valor?.toDate) return valor.toDate();
  if (valor instanceof Date) return valor;

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

const formatarDataHora = (valor) => {
  const data = dataSistema(valor);

  if (!data) return "-";

  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const emailNormalizado = (email) => String(email || "").trim().toLowerCase();
const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:10000";

export default function AceitarConvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [usuarioAuth, setUsuarioAuth] = useState(undefined);
  const [convite, setConvite] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuario) => {
      setUsuarioAuth(usuario || null);
    });

    return () => unsubscribe();
  }, []);

  const carregarConvite = useCallback(async () => {
    if (!token) {
      setErro("Link de convite invalido.");
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro("");

    try {
      const conviteRef = doc(db, "convitesEmpresa", token);
      const conviteSnapshot = await getDoc(conviteRef);

      if (!conviteSnapshot.exists()) {
        setErro("Convite nao encontrado.");
        setConvite(null);
        setEmpresa(null);
        return;
      }

      const dadosConvite = {
        id: conviteSnapshot.id,
        ...conviteSnapshot.data(),
      };
      const expiraEm = dataSistema(dadosConvite.expiraEm);

      if (dadosConvite.status !== "pendente") {
        setErro("Este convite ja foi usado, cancelado ou esta indisponivel.");
      } else if (!expiraEm || expiraEm.getTime() < Date.now()) {
        setErro("Este convite expirou. Solicite um novo link ao administrador da empresa.");
      }

      if (!dadosConvite.ownerUid || !dadosConvite.empresaId) {
        setErro("Convite sem empresa valida.");
        setConvite(dadosConvite);
        setEmpresa(null);
        return;
      }

      setEmpresa(
        dadosConvite.nomeEmpresa
          ? { id: dadosConvite.empresaId, nome: dadosConvite.nomeEmpresa }
          : null
      );
      setConvite(dadosConvite);
    } catch (error) {
      console.error("Erro ao carregar convite:", error);
      setErro("Nao foi possivel carregar o convite.");
      setConvite(null);
      setEmpresa(null);
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    // Carrega o convite publico quando a rota abre.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarConvite();
  }, [carregarConvite]);

  const emailConfere = useMemo(() => {
    if (!usuarioAuth || !convite) return false;
    return emailNormalizado(usuarioAuth.email) === emailNormalizado(convite.email);
  }, [convite, usuarioAuth]);

  const aceitarConvite = async () => {
    if (!usuarioAuth || !convite || !token) return;

    if (!emailConfere) {
      showToast("Entre com o mesmo e-mail do convite para aceitar o acesso.", "warning");
      return;
    }

    setAceitando(true);

    try {
      const idToken = await usuarioAuth.getIdToken(true);
      const response = await fetch(`${API_URL}/api/convites/aceitar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Nao foi possivel aceitar o convite.");
      }

      localStorage.setItem(
        `renovarEmpresaAtiva_${usuarioAuth.uid}`,
        data.empresaId || convite.empresaId
      );
      showToast("Convite aceito com sucesso.", "success");
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Erro ao aceitar convite:", error);
      showToast(error.message || "Nao foi possivel aceitar o convite.", "error");
      setErro(error.message || "Nao foi possivel aceitar o convite.");
      await carregarConvite();
    } finally {
      setAceitando(false);
    }
  };

  const sairDaConta = async () => {
    await signOut(auth);
  };

  const perfilLabel = convite
    ? getPerfilEmpresaConfig(normalizarRoleEmpresa(convite)).label
    : "Perfil nao informado";

  return (
    <div className="invite-page">
      <section className="invite-card card">
        <div className="invite-header">
          <span className="badge badge-info">
            <Clock3 size={14} />
            Convite de acesso
          </span>
          <h1>Aceitar convite</h1>
          <p>
            Entre com o e-mail convidado para vincular seu acesso a empresa correta.
          </p>
        </div>

        {carregando || usuarioAuth === undefined ? (
          <div className="empty-state">Carregando convite...</div>
        ) : (
          <>
            {erro && (
              <div className="invite-alert">
                <ShieldAlert size={18} />
                <span>{erro}</span>
              </div>
            )}

            {convite && (
              <div className="invite-details">
                <div>
                  <span>Empresa</span>
                  <strong>{empresa?.nome || "Empresa nao encontrada"}</strong>
                </div>
                <div>
                  <span>Convidado</span>
                  <strong>{convite.nome || "Usuario convidado"}</strong>
                </div>
                <div>
                  <span>E-mail do convite</span>
                  <strong>{convite.email}</strong>
                </div>
                <div>
                  <span>Perfil</span>
                  <strong>{perfilLabel}</strong>
                </div>
                <div>
                  <span>Expira em</span>
                  <strong>{formatarDataHora(convite.expiraEm)}</strong>
                </div>
              </div>
            )}

            {!usuarioAuth && convite && (
              <div className="invite-login-box">
                <div className="invite-guidance">
                  <strong>Faça login ou crie sua conta</strong>
                  <span>
                    Use exatamente o e-mail {convite.email}. Depois do login, esta mesma
                    pagina liberara o botao de aceite.
                  </span>
                </div>
                <div className="invite-login-shell">
                  <Login />
                </div>
              </div>
            )}

            {usuarioAuth && convite && (
              <div className="invite-auth-box">
                <div>
                  <span>Conta conectada</span>
                  <strong>{usuarioAuth.email}</strong>
                </div>

                {!emailConfere ? (
                  <>
                    <p>
                      Este convite pertence a {convite.email}. Saia desta conta e entre
                      com o e-mail correto para continuar.
                    </p>
                    <button type="button" className="confirm-secondary" onClick={sairDaConta}>
                      <LogOut size={16} />
                      Sair desta conta
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={aceitarConvite}
                    disabled={Boolean(erro) || aceitando}
                  >
                    <CheckCircle2 size={18} />
                    {aceitando ? "Aceitando..." : "Aceitar convite"}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
