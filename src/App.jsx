import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import Sidebar from "./components/Sidebar";
import AdminRoute from "./components/AdminRoute";
import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import Producao from "./pages/Producao";
import Estoque from "./pages/Estoque";
import Vendas from "./pages/Vendas";
import Financeiro from "./pages/Financeiro";
import Relatorios from "./pages/Relatorios";
import Produtos from "./pages/Produtos";
import Insumos from "./pages/Insumos";
import ClientesCRM from "./pages/ClientesCRM";
import Configuracoes from "./pages/Configuracoes";
import AdminClientes from "./pages/AdminClientes";
import AdminPagamentos from "./pages/AdminPagamentos";
import Planos from "./pages/Planos";
import PagamentoRetorno from "./pages/PagamentoRetorno";

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

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
      <div className="app-layout">
        <Sidebar />

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/producao" element={<Producao />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/vendas" element={<Vendas />} />
            <Route path="/clientes" element={<ClientesCRM />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/insumos" element={<Insumos />} />
            <Route path="/planos" element={<Planos />} />
            <Route path="/pagamento/sucesso" element={<PagamentoRetorno status="sucesso" />} />
            <Route path="/pagamento/pendente" element={<PagamentoRetorno status="pendente" />} />
            <Route path="/pagamento/erro" element={<PagamentoRetorno status="erro" />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
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
          </Routes>
        </main>
      </div>
    </Router>
  );
}
