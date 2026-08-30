import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useToast } from "../context/useToast";
import { SEGMENTOS_EMPRESA, SEGMENTO_EMPRESA_PADRAO } from "../config/segmentosEmpresa.js";
import saasLogo from "../assets/saas-logo.png";

const NOME_SAAS = "Renovar ERP";
const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:10000";
const EVENTO_PRIMEIRA_EMPRESA_CRIADA = "renovarPrimeiraEmpresaCriada";
const LABELS_SEGMENTO_CADASTRO = {
  comercio: "Comércio",
  industria: "Indústria",
  oficina: "Oficina",
  clientes: "Prestação de Serviços",
};
const OPCOES_SEGMENTO_CADASTRO = Object.values(SEGMENTOS_EMPRESA).map((segmento) => ({
  id: segmento.id,
  nome: LABELS_SEGMENTO_CADASTRO[segmento.id] || segmento.nome,
}));
const segmentoCadastroValido = (segmento) =>
  OPCOES_SEGMENTO_CADASTRO.some((opcao) => opcao.id === segmento);
const marcarOnboardingEmpresaPendente = async (usuario, pendente) => {
  await setDoc(
    doc(db, "users", usuario.uid),
    {
      email: usuario.email || "",
      nome: usuario.displayName || "",
      role: "cliente",
      onboardingEmpresaPendente: pendente,
      atualizadoEm: new Date(),
      ...(pendente ? { criadoEm: new Date() } : {}),
    },
    { merge: true }
  );
};

export default function Login() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [segmentoEmpresa, setSegmentoEmpresa] = useState(SEGMENTO_EMPRESA_PADRAO);
  const [modoCadastro, setModoCadastro] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const criarPrimeiraEmpresa = async ({ usuario, nome, segmento }) => {
    const idToken = await usuario.getIdToken(true);
    const response = await fetch(`${API_URL}/api/empresas`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nome, segmento }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false || data.success === false) {
      throw new Error(data.error || "Nao foi possivel criar a primeira empresa.");
    }

    return data.empresa;
  };

  // ================================
  // Autenticacao
  // ================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (carregando) return;

    const emailTratado = email.trim();
    const nomeEmpresaTratado = nomeEmpresa.trim();

    if (modoCadastro && !nomeEmpresaTratado) {
      showToast("Informe o nome da empresa.", "warning");
      return;
    }

    if (modoCadastro && !segmentoCadastroValido(segmentoEmpresa)) {
      showToast("Selecione um tipo de negócio válido.", "warning");
      return;
    }

    setCarregando(true);

    try {
      if (modoCadastro) {
        const credencial = await createUserWithEmailAndPassword(auth, emailTratado, senha);

        await marcarOnboardingEmpresaPendente(credencial.user, true);

        await criarPrimeiraEmpresa({
          usuario: credencial.user,
          nome: nomeEmpresaTratado,
          segmento: segmentoEmpresa,
        });

        await marcarOnboardingEmpresaPendente(credencial.user, false);
        window.dispatchEvent(new Event(EVENTO_PRIMEIRA_EMPRESA_CRIADA));
        showToast("Conta criada com sucesso!", "success");
      } else {
        await signInWithEmailAndPassword(auth, emailTratado, senha);
      }
    } catch (error) {
      console.error(error);
      if (modoCadastro && auth.currentUser) {
        showToast(
          "Conta criada, mas nao foi possivel criar a primeira empresa. Tente criar a empresa manualmente.",
          "error"
        );
        return;
      }

      showToast(`Erro: ${error.message}`, "error");
    } finally {
      setCarregando(false);
    }
  };

  const recuperarSenha = async () => {
    const emailInformado = email.trim();

    if (!emailInformado) {
      showToast("Informe seu e-mail para recuperar a senha.", "warning");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, emailInformado);
      showToast("Enviamos um link de recuperação para seu e-mail.", "success");
    } catch (error) {
      console.error(error);

      if (error.code === "auth/invalid-email") {
        showToast("Informe um e-mail válido.", "warning");
        return;
      }

      showToast("Não foi possível enviar o link de recuperação. Tente novamente.", "error");
    }
  };

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-content">
          <img src={saasLogo} alt={NOME_SAAS} className="login-brand-logo" />

          <div>
            <span className="login-brand-kicker">Gestão inteligente para pequenas operações</span>
            <h1>{NOME_SAAS}</h1>
            <p>
              Controle produção, vendas, estoque e financeiro em uma plataforma simples,
              organizada e pronta para acompanhar o crescimento da sua empresa.
            </p>
          </div>

          <div className="login-brand-highlights" aria-label="Recursos do sistema">
            <span>Multiempresa</span>
            <span>Relatórios e PDFs</span>
            <span>Planos SaaS</span>
          </div>
        </div>

        <div className="login-illustration" aria-hidden="true">
          <div className="login-illustration-card login-illustration-card-main">
            <span />
            <strong />
            <small />
          </div>
          <div className="login-illustration-grid">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card-header">
            <img src={saasLogo} alt={NOME_SAAS} />
            <div>
              <span>{NOME_SAAS}</span>
              <h2>{modoCadastro ? "Criar conta" : "Entrar na conta"}</h2>
            </div>
          </div>

          <p className="login-card-subtitle">
            {modoCadastro
              ? "Crie seu acesso para começar a organizar sua operação."
              : "Acesse o painel para continuar sua rotina de gestão."}
          </p>

          <label>
            E-mail
            <input
              type="email"
              placeholder="seuemail@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              placeholder="Sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </label>

          {modoCadastro && (
            <>
              <label>
                Nome da empresa
                <input
                  type="text"
                  placeholder="Ex: Oficina São José"
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  required
                />
              </label>

              <label>
                Tipo do negócio
                <select
                  value={segmentoEmpresa}
                  onChange={(e) => setSegmentoEmpresa(e.target.value)}
                  required
                >
                  {OPCOES_SEGMENTO_CADASTRO.map((segmento) => (
                    <option key={segmento.id} value={segmento.id}>
                      {segmento.nome}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <div className="login-options">
            <label className="login-checkbox">
              <input type="checkbox" defaultChecked />
              <span>Manter conectado</span>
            </label>

            <button
              type="button"
              className="login-forgot-button"
              onClick={recuperarSenha}
            >
              Esqueci minha senha
            </button>
          </div>

          <button type="submit" className="login-submit" disabled={carregando}>
            {carregando
              ? modoCadastro ? "Criando conta..." : "Entrando..."
              : modoCadastro ? "Criar conta" : "Entrar"}
          </button>

          <button
            type="button"
            className="login-mode-button"
            disabled={carregando}
            onClick={() => setModoCadastro(!modoCadastro)}
          >
            {modoCadastro ? "Já tenho conta" : "Criar conta"}
          </button>
        </form>
      </section>
    </div>
  );
}
