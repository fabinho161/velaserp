import { useCallback, useEffect, useState } from "react";
import { ERPContext } from "./ERPContextBase";
import { useToast } from "./useToast";
import { auth, db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { assinaturaGratisPadrao, getPlanoConfig } from "../config/planos";

const assinaturaPadrao = assinaturaGratisPadrao;

export function ERPProvider({ children }) {
  const { showToast } = useToast();

  const [user, setUser] = useState(null);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [perfilCarregando, setPerfilCarregando] = useState(true);
  const [assinaturaUsuario, setAssinaturaUsuario] = useState(assinaturaPadrao);
  const [empresaId, setEmpresaId] = useState(null);
  const [empresas, setEmpresas] = useState([]);

  const [insumos, setInsumos] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [producoes, setProducoes] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [clientesComerciais, setClientesComerciais] = useState([]);
  const [configuracoes, setConfiguracoes] = useState({});

  // ================================
  // 🔹 AUTENTICAÇÃO
  // ================================
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((usuario) => {
      setUser(usuario);
      setPerfilUsuario(null);
      setPerfilCarregando(Boolean(usuario));
      setAssinaturaUsuario(assinaturaPadrao);
      setEmpresaId(null);
      setInsumos([]);
      setProdutos([]);
      setProducoes([]);
      setVendas([]);
      setDespesas([]);
      setClientesComerciais([]);
      setConfiguracoes({});

      if (!usuario) {
        setPerfilCarregando(false);
        return;
      }

      const prepararUsuario = async () => {
        try {
          const userRef = doc(db, "users", usuario.uid);
          const assinaturaRef = doc(db, "users", usuario.uid, "assinatura", "plano");
          const userSnapshot = await getDoc(userRef);

          if (!userSnapshot.exists()) {
            await setDoc(userRef, {
              email: usuario.email || "",
              nome: usuario.displayName || "",
              role: "cliente",
              criadoEm: new Date(),
            });
          } else {
            await setDoc(userRef, {
              email: usuario.email || "",
              nome: usuario.displayName || userSnapshot.data()?.nome || "",
            }, { merge: true });
          }

          const assinaturaSnapshot = await getDoc(assinaturaRef);

          if (!assinaturaSnapshot.exists()) {
            await setDoc(assinaturaRef, {
              ...assinaturaPadrao,
              atualizadoEm: new Date(),
            });
          }
        } catch (error) {
          console.error("Erro ao preparar perfil do usuário:", error);
        }
      };

      prepararUsuario();
    });

    return () => unsub();
  }, []);

  // ================================
  // 🔹 PERFIL E ASSINATURA DO USUÁRIO
  // ================================
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const assinaturaRef = doc(db, "users", user.uid, "assinatura", "plano");

    const unsubPerfil = onSnapshot(
      userRef,
      (snapshot) => {
        setPerfilUsuario(snapshot.exists() ? {
          id: snapshot.id,
          ...snapshot.data(),
        } : null);
        setPerfilCarregando(false);
      },
      (error) => {
        console.error("Erro ao ouvir perfil do usuário:", error);
        setPerfilCarregando(false);
      }
    );

    const unsubAssinatura = onSnapshot(
      assinaturaRef,
      (snapshot) => {
        setAssinaturaUsuario(snapshot.exists() ? {
          ...assinaturaPadrao,
          id: snapshot.id,
          ...snapshot.data(),
        } : assinaturaPadrao);
      },
      (error) => {
        console.error("Erro ao ouvir assinatura do usuário:", error);
        setAssinaturaUsuario(assinaturaPadrao);
      }
    );

    return () => {
      unsubPerfil();
      unsubAssinatura();
    };
  }, [user]);


// ================================
// 🔹 TROCAR EMPRESA ATIVA
// ================================
const trocarEmpresa = useCallback((id) => {
  setEmpresaId(id);
  setInsumos([]);
  setProdutos([]);
  setProducoes([]);
  setVendas([]);
  setDespesas([]);
  setClientesComerciais([]);
  setConfiguracoes({});
}, []);

// ================================
// 🔹 CRIAR NOVA EMPRESA
// ================================
const criarNovaEmpresa = async (nomeEmpresa) => {
  if (!user) return;

  if (!nomeEmpresa) {
    showToast("Informe o nome da empresa.", "warning");
    return;
  }

  const assinaturaAtual = {
    ...assinaturaPadrao,
    ...(assinaturaUsuario || {}),
  };

  const planoAtual = getPlanoConfig(assinaturaAtual.plano);
  const limiteEmpresas = planoAtual.empresas;
  const adminMaster = perfilUsuario?.role === "admin_master";

  if (
    !adminMaster &&
    (
      assinaturaAtual.status !== "active" ||
      (limiteEmpresas !== null && empresas.length >= limiteEmpresas)
    )
  ) {
    showToast("Limite de empresas atingido.", "warning");
    return;
  }

  try {
    const ref = collection(db, "users", user.uid, "empresas");

    const novaEmpresa = await addDoc(ref, {
      nome: nomeEmpresa,
      criadoEm: new Date(),
    });

    const empresaCriada = {
      id: novaEmpresa.id,
      nome: nomeEmpresa,
    };

    setEmpresas([...empresas, empresaCriada]);
    setEmpresaId(novaEmpresa.id);
    showToast("Empresa criada com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao criar empresa:", error);
    showToast("Erro ao criar empresa.", "error");
  }
};


  // ================================
  // 🔹 CRIAR / CARREGAR EMPRESA
  // ================================
    useEffect(() => {
      if (!user) return;

      const carregarEmpresas = async () => {
        try {
          const ref = collection(db, "users", user.uid, "empresas");
          const snapshot = await getDocs(ref);

          if (snapshot.empty) {
            const novaEmpresa = await addDoc(ref, {
              nome: "Minha Empresa",
              criadoEm: new Date(),
            });

            const empresaCriada = {
              id: novaEmpresa.id,
              nome: "Minha Empresa",
            };

            setEmpresas([empresaCriada]);
            setEmpresaId(novaEmpresa.id);
          } else {
            const lista = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));

            setEmpresas(lista);
            setEmpresaId(lista[0].id);
          }
        } catch (error) {
          console.error("Erro ao carregar empresas:", error);
          showToast("Erro ao carregar empresas.", "error");
        }
      };

      carregarEmpresas();
    }, [showToast, user]);

    
    // ================================
    // 🔹 APLICAR TEMA DAS CONFIGURAÇÕES
    // ================================

      useEffect(() => {
        const tema = configuracoes?.empresa?.tema;
        const root = document.documentElement;

        root.style.setProperty("--primary", tema?.corPrimaria || "#2563eb");
        root.style.setProperty("--sidebar", tema?.corSidebar || "#0f172a");
        root.style.setProperty("--button", tema?.corBotao || "#2563eb");

        if (configuracoes?.empresa) {
          localStorage.setItem(
            "renovarErpWhiteLabel",
            JSON.stringify(configuracoes.empresa)
          );
        }
      }, [configuracoes]);


    
  // ================================
  // 🔹 REFERÊNCIAS FIREBASE
  // ================================
  const getRef = useCallback((colecao) => {
    return collection(
      db,
      "users",
      user.uid,
      "empresas",
      empresaId,
      colecao
    );
  }, [empresaId, user]);

  const getDocRef = useCallback((colecao, id) => {
    return doc(
      db,
      "users",
      user.uid,
      "empresas",
      empresaId,
      colecao,
      id
    );
  }, [empresaId, user]);

  const getConfigRef = useCallback((chave) => {
    return doc(
      db,
      "users",
      user.uid,
      "empresas",
      empresaId,
      "configuracoes",
      chave
    );
  }, [empresaId, user]);

  // ================================
  // 🔹 MAPEADOR DE STATES
  // ================================

  // ================================
  // 🔹 CARREGAR COLEÇÃO
  // ================================
  useEffect(() => {
    if (!user || !empresaId) return;

    const ouvirColecao = (colecao, setState) =>
      onSnapshot(
        getRef(colecao),
        (snapshot) => {
          const lista = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          setState(lista);
        },
        (error) => {
          console.error(`Erro ao ouvir ${colecao}:`, error);
        }
      );

    const unsubscribers = [
      ouvirColecao("insumos", setInsumos),
      ouvirColecao("produtos", setProdutos),
      ouvirColecao("producoes", setProducoes),
      ouvirColecao("vendas", setVendas),
      ouvirColecao("despesas", setDespesas),
      ouvirColecao("clientesComerciais", setClientesComerciais),
      onSnapshot(
        getRef("configuracoes"),
        (snapshot) => {
          const lista = {};

          snapshot.docs.forEach((docSnap) => {
            lista[docSnap.id] = {
              id: docSnap.id,
              ...docSnap.data(),
            };
          });

          setConfiguracoes(lista);
        },
        (error) => {
          console.error("Erro ao ouvir configurações:", error);
        }
      ),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, empresaId, getRef]);

  const carregarConfiguracao = useCallback(async (chave) => {
    if (!user || !empresaId || !chave) return null;

    try {
      const snapshot = await getDoc(getConfigRef(chave));
      const data = snapshot.exists() ? snapshot.data() : null;

      setConfiguracoes((atual) => ({
        ...atual,
        [chave]: data,
      }));

      return data;
    } catch (error) {
      console.error(`Erro ao carregar configuração ${chave}:`, error);
      return null;
    }
  }, [empresaId, getConfigRef, user]);

  const salvarConfiguracao = useCallback(async (chave, data) => {
    if (!user || !empresaId || !chave) return;

    try {
      await setDoc(getConfigRef(chave), data, { merge: true });

      setConfiguracoes((atual) => ({
        ...atual,
        [chave]: {
          ...(atual[chave] || {}),
          ...data,
        },
      }));
    } catch (error) {
      console.error(`Erro ao salvar configuração ${chave}:`, error);
      showToast("Erro ao salvar configuração no Firebase. Veja o console.", "error");
    }
  }, [empresaId, getConfigRef, showToast, user]);

  // ================================
  // 🔹 CRUD GENÉRICO
  // ================================
  const addItem = useCallback(async (colecao, data) => {
    if (!user) {
      showToast("Usuário não logado.", "warning");
      return;
    }

    if (!empresaId) {
      showToast("Empresa ainda não carregou. Aguarde e tente novamente.", "warning");
      return;
    }

    try {
      const ref = getRef(colecao);
      await addDoc(ref, data);
    } catch (error) {
      console.error(`Erro ao adicionar em ${colecao}:`, error);
      showToast("Erro ao salvar no Firebase. Veja o console.", "error");
    }
  }, [empresaId, getRef, showToast, user]);

  const updateItem = useCallback(async (colecao, id, data) => {
    if (!user || !empresaId || !id) return;

    try {
      await updateDoc(getDocRef(colecao, id), data);
    } catch (error) {
      console.error(`Erro ao atualizar ${colecao}:`, error);
      showToast("Erro ao atualizar no Firebase. Veja o console.", "error");
    }
  }, [empresaId, getDocRef, showToast, user]);

  const deleteItem = useCallback(async (colecao, id) => {
    if (!user || !empresaId || !id) return;

    try {
      await deleteDoc(getDocRef(colecao, id));
    } catch (error) {
      console.error(`Erro ao excluir ${colecao}:`, error);
      showToast("Erro ao excluir no Firebase. Veja o console.", "error");
    }
  }, [empresaId, getDocRef, showToast, user]);

  // ================================
  // 🔹 MAPEADOR DE STATES
  // ================================

  return (
    <ERPContext.Provider
      value={{
        user,
        perfilUsuario,
        perfilCarregando,
        isAdminMaster: perfilUsuario?.role === "admin_master",
        assinaturaUsuario,
        assinaturaPadrao,
        empresaId,
        empresas,
        trocarEmpresa,
        criarNovaEmpresa,

        insumos,
        produtos,
        producoes,
        vendas,
        despesas,
        clientesComerciais,
        configuracoes,

        addItem,
        updateItem,
        deleteItem,
        carregarConfiguracao,
        salvarConfiguracao,
      }}
    >
      {children}
    </ERPContext.Provider>
  );
}
