import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import Sidebar from "./components/Sidebar";
import AdminRoute from "./components/AdminRoute";
import PlanoRoute from "./components/PlanoRoute";
import EmpresaPermissionRoute from "./components/EmpresaPermissionRoute";
import SegmentoRoute from "./components/SegmentoRoute";
import { ERPProvider } from "./context/ERPContext";
import Login from "./pages/Login";
import { usePlano } from "./hooks/usePlano";
import { PERMISSOES_EMPRESA } from "./config/perfisEmpresa";

import Dashboard from "./pages/Dashboard";
import Producao from "./pages/Producao";
import Estoque from "./pages/Estoque";
import PerdasDoacoes from "./pages/PerdasDoacoes";
import Vendas from "./pages/Vendas";
import VendaPecas from "./pages/VendaPecas";
import Financeiro from "./pages/Financeiro";
import Relatorios from "./pages/Relatorios";
import Produtos from "./pages/Produtos";
import Insumos from "./pages/Insumos";
import Fornecedores from "./pages/Fornecedores";
import Veiculos from "./pages/Veiculos";
import Servicos from "./pages/Servicos";
import OrdensServico from "./pages/OrdensServico";
import ClientesCRM from "./pages/ClientesCRM";
import Configuracoes from "./pages/Configuracoes";
import AdminClientes from "./pages/AdminClientes";
import AdminPagamentos from "./pages/AdminPagamentos";
import Planos from "./pages/Planos";
import ParametrosEmpresa from "./pages/ParametrosEmpresa";
import PagamentoRetorno from "./pages/PagamentoRetorno";
import UsuariosEmpresa from "./pages/UsuariosEmpresa";
import AceitarConvite from "./pages/AceitarConvite";
import CentralAprendizagem from "./pages/CentralAprendizagem";
import Suporte from "./pages/Suporte";

function AuthenticatedApp() {
  const {
    podeUsarVendas,
    podeUsarCRMComercial,
    podeUsarRelatoriosAvancados,
  } = usePlano();

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={(
              <SegmentoRoute modulo="dashboard">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.dashboard}>
                  <Dashboard />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/producao"
            element={(
              <SegmentoRoute modulo="producao">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.producao}>
                  <Producao />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/estoque"
            element={(
              <SegmentoRoute modulo="estoque">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.estoque}>
                  <Estoque />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/perdas-doacoes"
            element={(
              <SegmentoRoute modulo="perdasDoacoes">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.estoque}>
                  <PerdasDoacoes />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/vendas"
            element={(
              <SegmentoRoute modulo="vendas">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.vendas}>
                  <PlanoRoute
                    permitido={podeUsarVendas}
                    titulo="Vendas indisponiveis no plano atual"
                    descricao="O modulo de Vendas entra a partir do plano Basico, junto com a operacao comercial e o CRM basico."
                    planoMinimo="Plano Basico"
                  >
                    <Vendas />
                  </PlanoRoute>
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/venda-pecas"
            element={(
              <SegmentoRoute modulo="vendaPecas">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.vendas}>
                  <VendaPecas />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/clientes"
            element={(
              <SegmentoRoute modulo="clientes">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.crm}>
                  <PlanoRoute
                    permitido={podeUsarCRMComercial}
                    titulo="CRM indisponivel no plano atual"
                    descricao="A carteira de clientes entra a partir do plano Basico, com cadastro de clientes e historico simples."
                    planoMinimo="Plano Basico"
                  >
                    <ClientesCRM />
                  </PlanoRoute>
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/financeiro"
            element={(
              <SegmentoRoute modulo="financeiro">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.financeiro}>
                  <Financeiro />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/fornecedores"
            element={(
              <SegmentoRoute modulo="fornecedores">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.fornecedores}>
                  <Fornecedores />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/veiculos"
            element={(
              <SegmentoRoute modulo="veiculos">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.veiculos}>
                  <Veiculos />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/servicos"
            element={(
              <SegmentoRoute modulo="servicos">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.servicos}>
                  <Servicos />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/ordens-servico"
            element={(
              <SegmentoRoute modulo="ordensServico">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.ordensServico}>
                  <OrdensServico />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/relatorios"
            element={(
              <SegmentoRoute modulo="relatorios">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.relatorios}>
                  <PlanoRoute
                    permitido={podeUsarRelatoriosAvancados}
                    titulo="Relatorios avancados indisponiveis"
                    descricao="A central de relatorios avancados e recursos premium fica disponivel no plano Premium."
                    planoMinimo="Plano Premium"
                  >
                    <Relatorios />
                  </PlanoRoute>
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/produtos"
            element={(
              <SegmentoRoute modulo="produtos">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.produtos}>
                  <Produtos />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/insumos"
            element={(
              <SegmentoRoute modulo="insumos">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.insumos}>
                  <Insumos />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/planos"
            element={(
              <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.planos}>
                <Planos />
              </EmpresaPermissionRoute>
            )}
          />
          <Route path="/pagamento/sucesso" element={<PagamentoRetorno status="sucesso" />} />
          <Route path="/pagamento/pendente" element={<PagamentoRetorno status="pendente" />} />
          <Route path="/pagamento/erro" element={<PagamentoRetorno status="erro" />} />
          <Route
            path="/configuracoes"
            element={(
              <SegmentoRoute modulo="configuracoes">
                <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.configuracoes}>
                  <Configuracoes />
                </EmpresaPermissionRoute>
              </SegmentoRoute>
            )}
          />
          <Route
            path="/parametros-empresa"
            element={(
              <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.parametros}>
                <ParametrosEmpresa />
              </EmpresaPermissionRoute>
            )}
          />
          <Route
            path="/usuarios-empresa"
            element={(
              <EmpresaPermissionRoute permissao={PERMISSOES_EMPRESA.usuariosEmpresa}>
                <UsuariosEmpresa />
              </EmpresaPermissionRoute>
            )}
          />
          <Route
            path="/central-aprendizagem"
            element={(
              <EmpresaPermissionRoute>
                <CentralAprendizagem />
              </EmpresaPermissionRoute>
            )}
          />
          <Route path="/suporte" element={<Suporte />} />
          <Route path="/admin" element={<Navigate to="/admin/clientes" replace />} />
          <Route
            path="/admin/clientes"
            element={(
              <AdminRoute>
                <AdminClientes />
              </AdminRoute>
            )}
          />
          <Route
            path="/admin/pagamentos"
            element={(
              <AdminRoute>
                <AdminPagamentos />
              </AdminRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (usuario) => {
      setUser(usuario || null);
    });

    return () => unsub();
  }, []);

  if (user === undefined) {
    return <div className="app-loading">Carregando...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/aceitar-convite/:token" element={<AceitarConvite />} />
        <Route
          path="*"
          element={
            user ? (
              <ERPProvider>
                <AuthenticatedApp />
              </ERPProvider>
            ) : (
              <Login />
            )
          }
        />
      </Routes>
    </Router>
  );
}
