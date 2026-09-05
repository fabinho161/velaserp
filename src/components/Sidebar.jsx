import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BookOpen,
  LifeBuoy,
  LayoutDashboard,
  Package,
  Boxes,
  Factory,
  Warehouse,
  ShoppingCart,
  Car,
  Wrench,
  ClipboardList,
  Users,
  Wallet,
  Truck,
  FileText,
  LogOut,
  Settings,
  ShieldCheck,
  CreditCard,
  Menu,
  X,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import EmpresaSwitcher from "./EmpresaSwitcher";
import saasLogo from "../assets/saas-logo.png";
import { useERP } from "../context/useERP";
import { usePlano } from "../hooks/usePlano";
import { PERMISSOES_EMPRESA } from "../config/perfisEmpresa";
import {
  normalizarSegmentoEmpresa,
  segmentoPossuiModulo,
} from "../config/segmentosEmpresa.js";

const NOME_SAAS = "Renovar ERP";

export default function Sidebar() {
  const {
    configuracoes,
    empresaId,
    empresaOwnerUid,
    empresas = [],
    isAdminMaster,
    temPermissaoEmpresaAtual,
    user,
  } = useERP();
  const location = useLocation();
  const {
    podeUsarCRMComercial,
    podeUsarRelatoriosAvancados,
    podeUsarVendas,
  } = usePlano();
  const [menuAberto, setMenuAberto] = useState(false);

  const podeVerMenu = (permissao, permitidoPorPlano = true) =>
    permitidoPorPlano && temPermissaoEmpresaAtual?.(permissao);
  const empresaAtual = empresas.find((empresa) =>
    empresa.id === empresaId &&
    (empresa.ownerUid || user?.uid) === (empresaOwnerUid || user?.uid)
  ) || null;
  const segmentoEmpresaAtual = normalizarSegmentoEmpresa(empresaAtual?.segmento);
  const isPrestacaoServicos = segmentoEmpresaAtual === "clientes";
  const itemPertenceAoSegmento = (item) =>
    !item?.modulo || segmentoPossuiModulo(empresaAtual?.segmento, item.modulo);
  const itensVisiveis = (items) => items.filter(Boolean).filter(itemPertenceAoSegmento);
  const estaEmAdminSaaS = location.pathname.startsWith("/admin");

  const menuSections = [
    {
      title: "Principal",
      items: itensVisiveis(
        podeVerMenu(PERMISSOES_EMPRESA.dashboard)
          ? [{ path: "/", label: "Dashboard", icon: LayoutDashboard, modulo: "dashboard" }]
          : []
      ),
    },
    {
      title: "Operacao",
      items: itensVisiveis([
        podeVerMenu(PERMISSOES_EMPRESA.insumos) &&
          { path: "/insumos", label: "Insumos", icon: Package, modulo: "insumos" },
        podeVerMenu(PERMISSOES_EMPRESA.produtos) &&
          { path: "/produtos", label: "Produtos", icon: Boxes, modulo: "produtos" },
        podeVerMenu(PERMISSOES_EMPRESA.producao) &&
          { path: "/producao", label: "Producao", icon: Factory, modulo: "producao" },
        podeVerMenu(PERMISSOES_EMPRESA.estoque) &&
          { path: "/estoque", label: "Estoque", icon: Warehouse, modulo: "estoque" },
        podeVerMenu(PERMISSOES_EMPRESA.veiculos) &&
          { path: "/veiculos", label: "Veiculos", icon: Car, modulo: "veiculos" },
        !isPrestacaoServicos &&
          podeVerMenu(PERMISSOES_EMPRESA.servicos) &&
          { path: "/servicos", label: "Serviços", icon: Wrench, modulo: "servicos" },
        podeVerMenu(PERMISSOES_EMPRESA.ordensServico) &&
          { path: "/ordens-servico", label: "Ordens de Servico", icon: ClipboardList, modulo: "ordensServico" },
        podeVerMenu(PERMISSOES_EMPRESA.vendas) &&
          { path: "/venda-pecas", label: "Venda de Peças", icon: ShoppingCart, modulo: "vendaPecas" },
        podeVerMenu(PERMISSOES_EMPRESA.estoque) &&
          { path: "/perdas-doacoes", label: "Perdas e Doacoes", icon: Warehouse, modulo: "perdasDoacoes" },
      ]),
    },
    {
      title: "Comercial",
      items: itensVisiveis([
        ...(podeVerMenu(PERMISSOES_EMPRESA.vendas, podeUsarVendas)
          ? [{ path: "/vendas", label: "Vendas", icon: ShoppingCart, modulo: "vendas" }]
          : []),
        ...(podeVerMenu(PERMISSOES_EMPRESA.crm, podeUsarCRMComercial)
          ? [{ path: "/clientes", label: "CRM", icon: Users, modulo: "clientes" }]
          : []),
        ...(isPrestacaoServicos && podeVerMenu(PERMISSOES_EMPRESA.servicos)
          ? [{ path: "/servicos", label: "Serviços", icon: Wrench, modulo: "servicos" }]
          : []),
      ]),
    },
    {
      title: "Gestao",
      items: itensVisiveis([
        ...(podeVerMenu(PERMISSOES_EMPRESA.financeiro)
          ? [{ path: "/financeiro", label: "Financeiro", icon: Wallet, modulo: "financeiro" }]
          : []),
        ...(podeVerMenu(PERMISSOES_EMPRESA.fornecedores)
          ? [{ path: "/fornecedores", label: "Fornecedores", icon: Truck, modulo: "fornecedores" }]
          : []),
        ...(podeVerMenu(PERMISSOES_EMPRESA.relatorios, podeUsarRelatoriosAvancados)
          ? [{ path: "/relatorios", label: "Relatorios", icon: FileText, modulo: "relatorios" }]
          : []),
      ]),
    },
    {
      title: "Conta",
      items: itensVisiveis([
        podeVerMenu(PERMISSOES_EMPRESA.planos) &&
          { path: "/planos", label: "Planos", icon: CreditCard },
        podeVerMenu(PERMISSOES_EMPRESA.configuracoes) &&
          { path: "/configuracoes", label: "Configuracoes", icon: Settings, modulo: "configuracoes" },
        podeVerMenu(PERMISSOES_EMPRESA.parametros) &&
          { path: "/parametros-empresa", label: "Parametros Empresa", icon: Settings },
        podeVerMenu(PERMISSOES_EMPRESA.usuariosEmpresa) &&
          { path: "/usuarios-empresa", label: "Usuarios da Empresa", icon: Users },
      ]),
    },
    {
      title: "Ajuda",
      items: [
        !estaEmAdminSaaS && {
          path: "/central-aprendizagem",
          label: "Central de Aprendizagem",
          icon: BookOpen,
        },
        {
          path: "/suporte",
          label: "Suporte",
          icon: LifeBuoy,
        },
      ].filter(Boolean),
    },
    {
      title: "Administracao",
      items: isAdminMaster
        ? [
            { path: "/admin/clientes", label: "Admin Clientes", icon: ShieldCheck },
            { path: "/admin/pagamentos", label: "Admin Pagamentos", icon: CreditCard },
          ]
        : [],
    },
  ].filter((section) => section.items.length > 0);

  const empresaConfig = configuracoes?.empresa;
  const nomeSistema =
    empresaConfig?.whiteLabel?.nomeSistema || empresaConfig?.nome || NOME_SAAS;

  const logoEmpresa = empresaConfig?.logoBase64 || saasLogo;

  useEffect(() => {
    document.body.classList.toggle("mobile-menu-open", menuAberto);

    const fecharComEscape = (event) => {
      if (event.key === "Escape") {
        setMenuAberto(false);
      }
    };

    window.addEventListener("keydown", fecharComEscape);

    return () => {
      document.body.classList.remove("mobile-menu-open");
      window.removeEventListener("keydown", fecharComEscape);
    };
  }, [menuAberto]);

  const sair = async () => {
    setMenuAberto(false);
    await signOut(auth);
  };

  const renderMenu = () => (
    <nav className="sidebar-menu">
      {menuSections.map((section) => (
        <div className="sidebar-section" key={section.title}>
          <span className="sidebar-section-title">{section.title}</span>

          <div className="sidebar-section-links">
            {section.items.map((menu) => {
              const Icon = menu.icon;

              return (
                <NavLink
                  key={menu.path}
                  to={menu.path}
                  end={menu.path === "/"}
                  className={({ isActive }) =>
                    isActive ? "sidebar-link active" : "sidebar-link"
                  }
                  onClick={() => setMenuAberto(false)}
                >
                  <Icon size={18} />
                  <span>{menu.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <header className="mobile-topbar">
        <div className="mobile-topbar-brand">
          <img src={logoEmpresa} alt={nomeSistema} className="mobile-topbar-logo" />

          <div>
            <strong>{nomeSistema}</strong>
            <span>ERP SaaS</span>
          </div>
        </div>

        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMenuAberto((aberto) => !aberto)}
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
        >
          {menuAberto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {menuAberto && (
        <button
          type="button"
          className="mobile-menu-overlay"
          aria-label="Fechar menu"
          onClick={() => setMenuAberto(false)}
        />
      )}

      <aside className={menuAberto ? "sidebar sidebar-open" : "sidebar"}>
        <div>
          <div className="sidebar-header">
            <img src={logoEmpresa} alt={nomeSistema} className="sidebar-logo-img" />

            <div className="sidebar-brand-text">
              <h2 className="sidebar-logo">{nomeSistema}</h2>
              <span className="sidebar-subtitle">ERP SaaS</span>
            </div>
          </div>

          <EmpresaSwitcher />

          {renderMenu()}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-label">Logado como</span>
            <strong>{auth.currentUser?.email || "Usuario"}</strong>
          </div>

          <button className="logout-button" onClick={sair}>
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
