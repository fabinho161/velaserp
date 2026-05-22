import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";
import { usePlano } from "../hooks/usePlano";
import { PERMISSOES_EMPRESA } from "../config/perfisEmpresa";


const EMPRESA_PADRAO = {
  nome: "",
  cnpj: "",
  cidade: "",
  telefone: "",
  email: "",
  logoUrl: "",
};

const FISCAL_PADRAO = {
  regimeTributario: "Nao informado",
  cnpj: "",
  inscricaoEstadual: "",
  inscricaoMunicipal: "",
  cnae: "",
  uf: "",
  municipio: "",
  ambienteFiscal: "Nao configurado",
  aliquotaIcmsPadrao: "",
  aliquotaPisPadrao: "",
  aliquotaCofinsPadrao: "",
  aliquotaIpiPadrao: "",
  observacoesFiscais: "",
};

const REGIMES_TRIBUTARIOS = [
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
  "MEI",
  "Nao informado",
];

const AMBIENTES_FISCAIS = ["Nao configurado", "Homologacao", "Producao"];

const normalizarAliquota = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return "";

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : "";
};


export default function Configuracoes() {
  const navigate = useNavigate();
  const {
    user,
    empresaId,
    configuracoes,
    salvarConfiguracao,
    temPermissaoEmpresaAtual,
  } = useERP();
  const { showToast } = useToast();
  const { podePersonalizarSistema } = usePlano();
  const podeEditarConfiguracoes = temPermissaoEmpresaAtual?.(
    PERMISSOES_EMPRESA.configuracoes
  );

  const [form, setForm] = useState(EMPRESA_PADRAO);
  const [fiscalForm, setFiscalForm] = useState(FISCAL_PADRAO);
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);
  const [salvandoFiscal, setSalvandoFiscal] = useState(false);

  // carregar dados existentes
  useEffect(() => {
    if (configuracoes?.empresa) {
      // Sincroniza o formulário quando a empresa ativa termina de carregar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        ...EMPRESA_PADRAO,
        ...configuracoes.empresa,
      });
    }
    if (configuracoes?.fiscal) {
      setFiscalForm({
        ...FISCAL_PADRAO,
        ...configuracoes.fiscal,
      });
    } else {
      setFiscalForm(FISCAL_PADRAO);
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

    if (!podeEditarConfiguracoes) {
      showToast("Voce nao tem permissao para editar configuracoes.", "warning");
      return;
    }

    const dadosBasicos = {
      nome: form.nome || "",
      cnpj: form.cnpj || "",
      cidade: form.cidade || "",
      telefone: form.telefone || "",
      email: form.email || "",
    };

    try {
      setSalvandoEmpresa(true);
      await salvarConfiguracao(
        "empresa",
        podePersonalizarSistema ? form : dadosBasicos
      );
      showToast("Configuracoes salvas com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao salvar configuracoes da empresa:", error);
      showToast("Nao foi possivel salvar as configuracoes.", "error");
    } finally {
      setSalvandoEmpresa(false);
    }
  };

  const salvarConfiguracoesFiscais = async () => {
    if (!user || !empresaId) return;

    if (!podeEditarConfiguracoes) {
      showToast("Voce nao tem permissao para editar configuracoes fiscais.", "warning");
      return;
    }

    const dadosFiscais = {
      regimeTributario: fiscalForm.regimeTributario || "Nao informado",
      cnpj: fiscalForm.cnpj || "",
      inscricaoEstadual: fiscalForm.inscricaoEstadual || "",
      inscricaoMunicipal: fiscalForm.inscricaoMunicipal || "",
      cnae: fiscalForm.cnae || "",
      uf: String(fiscalForm.uf || "").trim().toUpperCase(),
      municipio: fiscalForm.municipio || "",
      ambienteFiscal: fiscalForm.ambienteFiscal || "Nao configurado",
      aliquotaIcmsPadrao: normalizarAliquota(fiscalForm.aliquotaIcmsPadrao),
      aliquotaPisPadrao: normalizarAliquota(fiscalForm.aliquotaPisPadrao),
      aliquotaCofinsPadrao: normalizarAliquota(fiscalForm.aliquotaCofinsPadrao),
      aliquotaIpiPadrao: normalizarAliquota(fiscalForm.aliquotaIpiPadrao),
      observacoesFiscais: fiscalForm.observacoesFiscais || "",
    };

    try {
      setSalvandoFiscal(true);
      await salvarConfiguracao("fiscal", dadosFiscais);
      showToast("Configuracoes fiscais salvas com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao salvar configuracoes fiscais:", error);
      showToast("Nao foi possivel salvar as configuracoes fiscais.", "error");
    } finally {
      setSalvandoFiscal(false);
    }
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
        <h3>Configuracoes Fiscais</h3>
        <p className="config-section-description">
          Cadastre os dados fiscais basicos da empresa para preparar o ERP para relatorios tributarios futuros.
        </p>

        <div className="config-grid">
          <label>
            Regime tributario
            <select
              value={fiscalForm.regimeTributario}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, regimeTributario: e.target.value })
              }
            >
              {REGIMES_TRIBUTARIOS.map((regime) => (
                <option key={regime} value={regime}>
                  {regime}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ambiente fiscal
            <select
              value={fiscalForm.ambienteFiscal}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, ambienteFiscal: e.target.value })
              }
            >
              {AMBIENTES_FISCAIS.map((ambiente) => (
                <option key={ambiente} value={ambiente}>
                  {ambiente}
                </option>
              ))}
            </select>
          </label>

          <label>
            CNPJ
            <input
              placeholder="00.000.000/0001-00"
              value={fiscalForm.cnpj}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) => setFiscalForm({ ...fiscalForm, cnpj: e.target.value })}
            />
          </label>

          <label>
            Inscricao estadual
            <input
              placeholder="Ex: 123456789"
              value={fiscalForm.inscricaoEstadual}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, inscricaoEstadual: e.target.value })
              }
            />
          </label>

          <label>
            Inscricao municipal
            <input
              placeholder="Ex: 12345"
              value={fiscalForm.inscricaoMunicipal}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, inscricaoMunicipal: e.target.value })
              }
            />
          </label>

          <label>
            CNAE
            <input
              placeholder="Ex: 4789-0/99"
              value={fiscalForm.cnae}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) => setFiscalForm({ ...fiscalForm, cnae: e.target.value })}
            />
          </label>

          <label>
            UF
            <input
              placeholder="Ex: GO"
              maxLength={2}
              value={fiscalForm.uf}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) => setFiscalForm({ ...fiscalForm, uf: e.target.value })}
            />
          </label>

          <label>
            Municipio
            <input
              placeholder="Ex: Itumbiara"
              value={fiscalForm.municipio}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, municipio: e.target.value })
              }
            />
          </label>

          <label>
            Aliquota ICMS padrao (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 18"
              value={fiscalForm.aliquotaIcmsPadrao}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, aliquotaIcmsPadrao: e.target.value })
              }
            />
          </label>

          <label>
            Aliquota PIS padrao (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 0.65"
              value={fiscalForm.aliquotaPisPadrao}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, aliquotaPisPadrao: e.target.value })
              }
            />
          </label>

          <label>
            Aliquota COFINS padrao (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 3"
              value={fiscalForm.aliquotaCofinsPadrao}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, aliquotaCofinsPadrao: e.target.value })
              }
            />
          </label>

          <label>
            Aliquota IPI padrao (%)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 5"
              value={fiscalForm.aliquotaIpiPadrao}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, aliquotaIpiPadrao: e.target.value })
              }
            />
          </label>

          <label className="config-field-full">
            Observacoes fiscais
            <textarea
              rows="4"
              placeholder="Informacoes fiscais internas para uso futuro em relatorios tributarios."
              value={fiscalForm.observacoesFiscais}
              disabled={!podeEditarConfiguracoes || salvandoFiscal}
              onChange={(e) =>
                setFiscalForm({ ...fiscalForm, observacoesFiscais: e.target.value })
              }
            />
          </label>
        </div>

        <div className="config-card-actions">
          <button
            className="btn-primary"
            type="button"
            disabled={!podeEditarConfiguracoes || salvandoFiscal}
            onClick={salvarConfiguracoesFiscais}
          >
            {salvandoFiscal ? "Salvando..." : "Salvar Configuracoes Fiscais"}
          </button>
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
      <button
        className="btn-primary"
        type="button"
        disabled={!podeEditarConfiguracoes || salvandoEmpresa}
        onClick={salvar}
      >
        {salvandoEmpresa ? "Salvando..." : "Salvar Configuracoes"}
      </button>
    </div>
  </div>
  
);
}
