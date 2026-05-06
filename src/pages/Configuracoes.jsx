import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { usePlano } from "../hooks/usePlano";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";


export default function Configuracoes() {
  const navigate = useNavigate();
  const { user, empresaId, configuracoes } = useERP();
  const { showToast } = useToast();
  const { podePersonalizarSistema } = usePlano();

  const [form, setForm] = useState({
    nome: "",
    cnpj: "",
    cidade: "",
    telefone: "",
    email: "",
    logoUrl: "",
  });

  // carregar dados existentes
  useEffect(() => {
    if (configuracoes?.empresa) {
      // Sincroniza o formulário quando a empresa ativa termina de carregar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(configuracoes.empresa);
    }
  }, [configuracoes]);

  // ================================
  // 🔹 UPLOAD DA LOGO
  // ================================
  const handleUploadLogo = (file) => {
    if (!file) return;

    if (!podePersonalizarSistema) {
      showToast("Personalização disponível no plano Premium.", "warning");
      return;
    }

    if (file.size > 500 * 1024) {
      showToast("Use uma imagem menor que 500KB.", "warning");
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      setForm((prev) => ({
        ...prev,
        logoBase64: reader.result,
        logoUrl: "",
      }));
    };

    reader.readAsDataURL(file);
  };

  // ================================
  // 🔹 SALVAR CONFIGURAÇÕES
  // ================================
  const salvar = async () => {
    if (!user || !empresaId) return;

    const refDoc = doc(
      db,
      "users",
      user.uid,
      "empresas",
      empresaId,
      "configuracoes",
      "empresa"
    );

    const dadosBasicos = {
      nome: form.nome || "",
      cnpj: form.cnpj || "",
      cidade: form.cidade || "",
      telefone: form.telefone || "",
      email: form.email || "",
    };

    await setDoc(
      refDoc,
      podePersonalizarSistema ? form : dadosBasicos,
      { merge: true }
    );

    showToast("Configurações salvas com sucesso!", "success");
    };

   return (
  <div className="config-page">
    <div className="config-header page-header">
      <div>
        <h1 className="page-title">Configurações da Empresa</h1>
        <p className="page-subtitle">
          Gerencie dados cadastrais, logo e identidade visual da empresa ativa.
        </p>
      </div>
    </div>

    <div className="config-layout">
      <div className="card config-section">
        <h3>Dados da Empresa</h3>
        <p className="config-section-description">
          Essas informações serão usadas nos relatórios, PDFs e documentos gerados pelo sistema.
        </p>

        <div className="config-grid">
          <label>
            Nome da empresa
            <input
              placeholder="Ex: Minha Empresa"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </label>

          <label>
            CNPJ
            <input
              placeholder="00.000.000/0001-00"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
            />
          </label>

          <label>
            Cidade / UF
            <input
              placeholder="Ex: Itumbiara-GO"
              value={form.cidade}
              onChange={(e) => setForm({ ...form, cidade: e.target.value })}
            />
          </label>

          <label>
            Telefone
            <input
              placeholder="(00) 00000-0000"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </label>

          <label>
            E-mail
            <input
              placeholder="contato@empresa.com.br"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="card config-section">
        <h3>Logo da Empresa</h3>
        <p className="config-section-description">
          A logo será exibida nos relatórios em PDF e poderá ser usada na identidade do sistema.
        </p>

        <div
          className={podePersonalizarSistema
            ? "config-logo-area"
            : "config-logo-area config-locked-area"}
          onClick={() => {
            if (!podePersonalizarSistema) {
              showToast("Personalização disponível no plano Premium.", "warning");
            }
          }}
        >
          {form.logoBase64 || form.logoUrl ? (
            <div className="config-logo-preview-box">
              <img
                src={form.logoBase64 || form.logoUrl}
                alt="Logo da empresa"
                className="config-logo-preview"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <div>
                <strong>Logo carregada</strong>
                <small>Imagem salva na configuração da empresa.</small>
              </div>
            </div>
          ) : (
            <div className="config-logo-empty">
              Nenhuma logo cadastrada
            </div>
          )}

          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            disabled={!podePersonalizarSistema}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              handleUploadLogo(file);
            }}
          />

        </div>
      </div>

      <div className="card config-section config-section-full">
        <h3>Personalização do Sistema</h3>
        <p className="config-section-description">
          Personalize o nome e as cores do sistema para a sua empresa.
        </p>

        {!podePersonalizarSistema && (
          <div className="plan-locked-inline">
            <span>Personalização disponível no plano Premium.</span>
            <button type="button" onClick={() => navigate("/planos")}>
              Ver planos
            </button>
          </div>
        )}

        <div className="config-grid">
          <label>
            Nome do sistema
            <input
              placeholder="Ex: Gestão Renovar"
              value={form.whiteLabel?.nomeSistema || ""}
              disabled={!podePersonalizarSistema}
              onClick={() => {
                if (!podePersonalizarSistema) {
                  showToast("Personalização disponível no plano Premium.", "warning");
                }
              }}
              onChange={(e) =>
                setForm({
                  ...form,
                  whiteLabel: {
                    ...form.whiteLabel,
                    nomeSistema: e.target.value,
                  },
                })
              }
            />
          </label>

          <label>
            Cor principal
            <div className="config-color-field">
              <input
                type="color"
                value={form.tema?.corPrimaria || "#2563eb"}
                disabled={!podePersonalizarSistema}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tema: { ...form.tema, corPrimaria: e.target.value },
                  })
                }
              />
              <span>{form.tema?.corPrimaria || "#2563eb"}</span>
            </div>
          </label>

          <label>
            Cor da lateral
            <div className="config-color-field">
              <input
                type="color"
                value={form.tema?.corSidebar || "#0f172a"}
                disabled={!podePersonalizarSistema}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tema: { ...form.tema, corSidebar: e.target.value },
                  })
                }
              />
              <span>{form.tema?.corSidebar || "#0f172a"}</span>
            </div>
          </label>

          <label>
            Cor dos botões
            <div className="config-color-field">
              <input
                type="color"
                value={form.tema?.corBotao || "#2563eb"}
                disabled={!podePersonalizarSistema}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tema: { ...form.tema, corBotao: e.target.value },
                  })
                }
              />
              <span>{form.tema?.corBotao || "#2563eb"}</span>
            </div>
          </label>
        </div>
      </div>
    </div>


    <div className="config-actions">
      <button className="btn-primary" onClick={salvar}>
        Salvar Configurações
      </button>
    </div>
  </div>
  
);
}
