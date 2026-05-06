import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase";
import { useToast } from "../context/useToast";
import saasLogo from "../assets/saas-logo.png";

const NOME_SAAS = "Renovar ERP";

export default function Login() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [modoCadastro, setModoCadastro] = useState(false);

  // ================================
  // Autenticacao
  // ================================
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (modoCadastro) {
        await createUserWithEmailAndPassword(auth, email, senha);
        showToast("Conta criada com sucesso!", "success");
      } else {
        await signInWithEmailAndPassword(auth, email, senha);
      }
    } catch (error) {
      console.error(error);
      showToast(`Erro: ${error.message}`, "error");
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

          <button type="submit" className="login-submit">
            {modoCadastro ? "Criar conta" : "Entrar"}
          </button>

          <button
            type="button"
            className="login-mode-button"
            onClick={() => setModoCadastro(!modoCadastro)}
          >
            {modoCadastro ? "Já tenho conta" : "Criar conta"}
          </button>
        </form>
      </section>
    </div>
  );
}
