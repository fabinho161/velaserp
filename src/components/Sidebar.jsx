import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Factory,
  Warehouse,
  ShoppingCart,
  Users,
  Wallet,
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

const NOME_SAAS = "Renovar ERP";

export default function Sidebar() {
  const { configuracoes, isAdminMaster } = useERP();
  const {
    podeUsarCRMComercial,
    podeUsarRelatoriosAvancados,
    podeUsarVendas,
  } = usePlano();
  const [menuAberto, setMenuAberto] = useState(false);

  const menuSections = [
    {
      title: "Principal",
      items: [{ path: "/", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
      title: "Operação",
      items: [
        { path: "/insumos", label: "Insumos", icon: Package },
        { path: "/produtos", label: "Produtos", icon: Boxes },
        { path: "/producao", label: "Produção", icon: Factory },
        { path: "/estoque", label: "Estoque", icon: Warehouse },
      ],
    },
    {
      title: "Comercial",
      items: [
        ...(podeUsarVendas
          ? [{ path: "/vendas", label: "Vendas", icon: ShoppingCart }]
          : []),
        ...(podeUsarCRMComercial
          ? [{ path: "/clientes", label: "CRM", icon: Users }]
          : []),
      ],
    },
    {
      title: "Gestão",
      items: [
        { path: "/financeiro", label: "Financeiro", icon: Wallet },
        ...(podeUsarRelatoriosAvancados
          ? [{ path: "/relatorios", label: "Relatórios", icon: FileText }]
          : []),
      ],
    },
    {
      title: "Conta",
      items: [
        { path: "/planos", label: "Planos", icon: CreditCard },
        { path: "/configuracoes", label: "Configurações", icon: Settings },
        { path: "/parametros-empresa", label: "Parâmetros Empresa", icon: Settings },
        { path: "/parametros-empresa", label: "Parâmetros Empresa", icon: Settings },
      ],
    },
    {
      title: "Administração",
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
            <strong>{auth.currentUser?.email || "Usuário"}</strong>
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
