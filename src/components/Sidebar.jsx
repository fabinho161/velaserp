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

const NOME_SAAS = "Renovar ERP";

export default function Sidebar() {
  const { configuracoes, isAdminMaster, temPermissaoEmpresaAtual } = useERP();
  const location = useLocation();
  const {
    podeUsarCRMComercial,
    podeUsarRelatoriosAvancados,
    podeUsarVendas,
  } = usePlano();
  const [menuAberto, setMenuAberto] = useState(false);

  const podeVerMenu = (permissao, permitidoPorPlano = true) =>
    permitidoPorPlano && temPermissaoEmpresaAtual?.(permissao);
  const estaEmAdminSaaS = location.pathname.startsWith("/admin");

  const menuSections = [
    {
      title: "Principal",
      items: podeVerMenu(PERMISSOES_EMPRESA.dashboard)
        ? [{ path: "/", label: "Dashboard", icon: LayoutDashboard }]
        : [],
    },
    {
      title: "Operacao",
      items: [
        podeVerMenu(PERMISSOES_EMPRESA.insumos) &&
          { path: "/insumos", label: "Insumos", icon: Package },
        podeVerMenu(PERMISSOES_EMPRESA.produtos) &&
          { path: "/produtos", label: "Produtos", icon: Boxes },
        podeVerMenu(PERMISSOES_EMPRESA.producao) &&
          { path: "/producao", label: "Producao", icon: Factory },
        podeVerMenu(PERMISSOES_EMPRESA.estoque) &&
          { path: "/estoque", label: "Estoque", icon: Warehouse },
        podeVerMenu(PERMISSOES_EMPRESA.estoque) &&
          { path: "/perdas-doacoes", label: "Perdas e Doacoes", icon: Warehouse },
      ].filter(Boolean),
    },
    {
      title: "Comercial",
      items: [
        ...(podeVerMenu(PERMISSOES_EMPRESA.vendas, podeUsarVendas)
          ? [{ path: "/vendas", label: "Vendas", icon: ShoppingCart }]
          : []),
        ...(podeVerMenu(PERMISSOES_EMPRESA.crm, podeUsarCRMComercial)
          ? [{ path: "/clientes", label: "CRM", icon: Users }]
          : []),
      ],
    },
    {
      title: "Gestao",
      items: [
        ...(podeVerMenu(PERMISSOES_EMPRESA.financeiro)
          ? [{ path: "/financeiro", label: "Financeiro", icon: Wallet }]
          : []),
        ...(podeVerMenu(PERMISSOES_EMPRESA.fornecedores)
          ? [{ path: "/fornecedores", label: "Fornecedores", icon: Truck }]
          : []),
        ...(podeVerMenu(PERMISSOES_EMPRESA.relatorios, podeUsarRelatoriosAvancados)
          ? [{ path: "/relatorios", label: "Relatorios", icon: FileText }]
          : []),
      ],
    },
    {
      title: "Conta",
      items: [
        podeVerMenu(PERMISSOES_EMPRESA.planos) &&
          { path: "/planos", label: "Planos", icon: CreditCard },
        podeVerMenu(PERMISSOES_EMPRESA.configuracoes) &&
          { path: "/configuracoes", label: "Configuracoes", icon: Settings },
        podeVerMenu(PERMISSOES_EMPRESA.parametros) &&
          { path: "/parametros-empresa", label: "Parametros Empresa", icon: Settings },
        podeVerMenu(PERMISSOES_EMPRESA.usuariosEmpresa) &&
          { path: "/usuarios-empresa", label: "Usuarios da Empresa", icon: Users },
      ].filter(Boolean),
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
