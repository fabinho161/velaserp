import { useCallback, useEffect, useMemo, useState } from "react";
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
  writeBatch,
} from "firebase/firestore";
import {
  assinaturaGratisPadrao,
  getLimiteUsuariosEfetivo,
  getPlanoConfig,
} from "../config/planos";
import {
  PERFIL_EMPRESA_PADRAO,
  PERFIL_DONO_EMPRESA,
  PERMISSOES_EMPRESA,
  getPermissoesPerfilEmpresa,
  normalizarRoleEmpresa,
  perfilEmpresaSomenteLeitura,
  temPermissaoEmpresa,
} from "../config/perfisEmpresa";

const assinaturaPadrao = assinaturaGratisPadrao;
const DIAS_EXPIRACAO_CONVITE = 7;
const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:10000";

const COLECOES_POR_PERMISSAO = [
  ["insumos", PERMISSOES_EMPRESA.insumos],
  ["produtos", PERMISSOES_EMPRESA.produtos],
  ["producoes", PERMISSOES_EMPRESA.producao],
  ["vendas", PERMISSOES_EMPRESA.vendas],
  ["despesas", PERMISSOES_EMPRESA.financeiro],
  ["clientesComerciais", PERMISSOES_EMPRESA.crm],
];

const STATUS_USUARIO_EMPRESA_BLOQUEADO = new Set(["inativo", "removido"]);

const gerarTokenConvite = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replaceAll("-", "");
  }

  const bytes = new Uint8Array(24);
  globalThis.crypto?.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const criarDatasConvite = () => {
  const criadoEm = new Date();
  const expiraEm = new Date(criadoEm);
  expiraEm.setDate(expiraEm.getDate() + DIAS_EXPIRACAO_CONVITE);

  return { criadoEm, expiraEm };
};

const montarIndiceConvite = ({
  token,
  ownerUid,
  empresaId,
  usuarioEmpresaId,
  nome,
  email,
  role,
  perfil,
  profile,
  nomeEmpresa,
  criadoEm,
  expiraEm,
}) => ({
  token,
  ownerUid,
  empresaId,
  usuarioEmpresaId,
  nome,
  email,
  role: normalizarRoleEmpresa(role || perfil || profile),
  nomeEmpresa: nomeEmpresa || "",
  status: "pendente",
  criadoEm,
  expiraEm,
});

const montarDadosDonoEmpresa = (usuario, dadosAtuais = {}) => ({
  nome: usuario.displayName || dadosAtuais.nome || usuario.email || "Dono da conta",
  email: usuario.email || dadosAtuais.email || "",
  role: PERFIL_DONO_EMPRESA,
  status: "ativo",
  uidAuth: usuario.uid,
  atualizadoEm: new Date(),
  criadoPor: dadosAtuais.criadoPor || usuario.uid,
  convitePendente: false,
  dono: true,
});

const garantirUsuarioDonoEmpresa = async ({ ownerUid, empresaId, usuario }) => {
  if (!ownerUid || !empresaId || !usuario?.uid || ownerUid !== usuario.uid) return;

  const usuarioEmpresaRef = doc(
    db,
    "users",
    ownerUid,
    "empresas",
    empresaId,
    "usuariosEmpresa",
    usuario.uid
  );
  const snapshot = await getDoc(usuarioEmpresaRef);
  const dadosAtuais = snapshot.exists() ? snapshot.data() : {};

  await setDoc(
    usuarioEmpresaRef,
    {
      ...montarDadosDonoEmpresa(usuario, dadosAtuais),
      criadoEm: dadosAtuais.criadoEm || new Date(),
    },
    { merge: true }
  );
};

export function ERPProvider({ children }) {
  const { showToast } = useToast();

  const [user, setUser] = useState(null);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [perfilCarregando, setPerfilCarregando] = useState(true);
  const [assinaturaUsuario, setAssinaturaUsuario] = useState(assinaturaPadrao);
  const [empresaId, setEmpresaId] = useState(null);
  const [empresaOwnerUid, setEmpresaOwnerUid] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState([]);
  const [usuariosEmpresaCarregando, setUsuariosEmpresaCarregando] = useState(false);

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
      setEmpresaOwnerUid(null);
      setUsuariosEmpresa([]);
      setInsumos([]);
      setProdutos([]);
      setProducoes([]);
      setVendas([]);
      setDespesas([]);
      setClientesComerciais([]);
      setConfiguracoes({});

      if (!usuario) {
        setPerfilCarregando(false);
        setUsuariosEmpresaCarregando(false);
        localStorage.removeItem("renovarEmpresaAtiva");
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

          const empresasRef = collection(db, "users", usuario.uid, "empresas");
          const vinculosRef = collection(db, "usuariosPorAuth", usuario.uid, "empresas");
          const [assinaturaSnapshot, empresasSnapshot, vinculosSnapshot] = await Promise.all([
            getDoc(assinaturaRef),
            getDocs(empresasRef),
            getDocs(vinculosRef),
          ]);
          const possuiEmpresaPropria = empresasSnapshot.docs.some((docSnap) => {
            const dados = docSnap.data();
            return !dados?.ownerUid || dados.ownerUid === usuario.uid;
          });
          const possuiSomenteVinculoConvite =
            !possuiEmpresaPropria &&
            (
              !vinculosSnapshot.empty ||
              empresasSnapshot.docs.some((docSnap) => docSnap.data()?.ownerUid !== usuario.uid)
            );

          if (!assinaturaSnapshot.exists() && !possuiSomenteVinculoConvite) {
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
      if (!id) return;

      if (user?.uid) {
        localStorage.setItem(`renovarEmpresaAtiva_${user.uid}`, id);
      }

      const empresaSelecionada = empresas.find((empresa) => empresa.id === id);

      setUsuariosEmpresaCarregando(true);
      setEmpresaId(id);
      setEmpresaOwnerUid(empresaSelecionada?.ownerUid || user?.uid || null);
      setUsuariosEmpresa([]);
      setInsumos([]);
      setProdutos([]);
      setProducoes([]);
      setVendas([]);
      setDespesas([]);
      setClientesComerciais([]);
      setConfiguracoes({});
    }, [empresas, user]);

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

    await garantirUsuarioDonoEmpresa({
      ownerUid: user.uid,
      empresaId: novaEmpresa.id,
      usuario: user,
    });

    const empresaCriada = {
      id: novaEmpresa.id,
      nome: nomeEmpresa,
      ownerUid: user.uid,
    };

    setEmpresas([...empresas, empresaCriada]);
    setUsuariosEmpresaCarregando(true);
    setEmpresaId(novaEmpresa.id);
    setEmpresaOwnerUid(user.uid);
    localStorage.setItem(`renovarEmpresaAtiva_${user.uid}`, novaEmpresa.id);
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

      let cancelado = false;

      const carregarEmpresas = async () => {
        try {
          const vinculosRef = collection(db, "usuariosPorAuth", user.uid, "empresas");
          const ref = collection(db, "users", user.uid, "empresas");
          const vinculosSnapshot = await getDocs(vinculosRef);
          const snapshot = await getDocs(ref);

          if (snapshot.empty && vinculosSnapshot.empty) {
            const novaEmpresa = await addDoc(ref, {
              nome: "Minha Empresa",
              criadoEm: new Date(),
            });

            const empresaCriada = {
              id: novaEmpresa.id,
              nome: "Minha Empresa",
              ownerUid: user.uid,
            };

            await garantirUsuarioDonoEmpresa({
              ownerUid: user.uid,
              empresaId: novaEmpresa.id,
              usuario: user,
            });

            if (cancelado) return;

            setEmpresas([empresaCriada]);
            setUsuariosEmpresaCarregando(true);
            setEmpresaId(novaEmpresa.id);
            setEmpresaOwnerUid(user.uid);
            localStorage.setItem(`renovarEmpresaAtiva_${user.uid}`, novaEmpresa.id);
          } else {
            const mapaEmpresas = new Map();

            snapshot.docs.forEach((docSnap) => {
              const dados = docSnap.data();
              mapaEmpresas.set(docSnap.id, {
                id: docSnap.id,
                ...dados,
                ownerUid: dados?.ownerUid || user.uid,
              });
            });

            vinculosSnapshot.docs.forEach((docSnap) => {
              const dados = docSnap.data();

              mapaEmpresas.set(docSnap.id, {
                id: docSnap.id,
                ...dados,
                ownerUid: dados?.ownerUid || user.uid,
              });
            });

            const lista = Array.from(mapaEmpresas.values());

            await Promise.all(
              lista.map((empresa) =>
                garantirUsuarioDonoEmpresa({
                  ownerUid: empresa.ownerUid,
                  empresaId: empresa.id,
                  usuario: user,
                })
              )
            );

            if (cancelado) return;

            setEmpresas(lista);

            const empresaSalva = localStorage.getItem(`renovarEmpresaAtiva_${user.uid}`);
            const empresaSalvaValida = empresaSalva
              ? lista.find((empresa) => empresa.id === empresaSalva)
              : null;
            const empresaSelecionada = empresaSalvaValida || lista[0];

            setUsuariosEmpresaCarregando(true);
            setEmpresaId(empresaSelecionada.id);
            setEmpresaOwnerUid(empresaSelecionada.ownerUid || user.uid);
            localStorage.setItem(`renovarEmpresaAtiva_${user.uid}`, empresaSelecionada.id);
          }
        } catch (error) {
          console.error("Erro ao carregar empresas:", error);
          showToast("Erro ao carregar empresas.", "error");
        }
      };

      carregarEmpresas();

      return () => {
        cancelado = true;
      };
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
      empresaOwnerUid || user.uid,
      "empresas",
      empresaId,
      colecao
    );
  }, [empresaId, empresaOwnerUid, user]);

  const getDocRef = useCallback((colecao, id) => {
    return doc(
      db,
      "users",
      empresaOwnerUid || user.uid,
      "empresas",
      empresaId,
      colecao,
      id
    );
  }, [empresaId, empresaOwnerUid, user]);

  const getConfigRef = useCallback((chave) => {
    return doc(
      db,
      "users",
      empresaOwnerUid || user.uid,
      "empresas",
      empresaId,
      "configuracoes",
      chave
    );
  }, [empresaId, empresaOwnerUid, user]);

  const getUsuariosEmpresaRef = useCallback(() => {
    if (!user || !empresaId) return null;

    return collection(
      db,
      "users",
      empresaOwnerUid || user.uid,
      "empresas",
      empresaId,
      "usuariosEmpresa"
    );
  }, [empresaId, empresaOwnerUid, user]);

  const getUsuarioEmpresaDocRef = useCallback((id) => {
    if (!user || !empresaId || !id) return null;

    return doc(
      db,
      "users",
      empresaOwnerUid || user.uid,
      "empresas",
      empresaId,
      "usuariosEmpresa",
      id
    );
  }, [empresaId, empresaOwnerUid, user]);

  // ================================
  // 🔹 MAPEADOR DE STATES
  // ================================

  // ================================
  // 🔹 CARREGAR COLEÇÃO
  // ================================
  useEffect(() => {
    if (!user || !empresaId) return;

    const usuarioVinculado = usuariosEmpresa.find(
      (usuarioEmpresa) => usuarioEmpresa.uidAuth === user.uid
    );
    const usuarioDono =
      (empresaOwnerUid || user.uid) === user.uid
        ? {
            role: PERFIL_DONO_EMPRESA,
            status: "ativo",
          }
        : null;
    const usuarioAtual = usuarioVinculado || usuarioDono;

    if (usuariosEmpresaCarregando || !usuarioAtual) return;

    const perfilAtual = normalizarRoleEmpresa(usuarioAtual);
    const permissoesPorColecao = new Map(COLECOES_POR_PERMISSAO);
    const settersPorColecao = {
      insumos: setInsumos,
      produtos: setProdutos,
      producoes: setProducoes,
      vendas: setVendas,
      despesas: setDespesas,
      clientesComerciais: setClientesComerciais,
    };

    Object.entries(settersPorColecao).forEach(([colecao, setState]) => {
      const permissao = permissoesPorColecao.get(colecao);

      if (
        STATUS_USUARIO_EMPRESA_BLOQUEADO.has(
          String(usuarioAtual.status || "").trim().toLowerCase()
        ) ||
        (permissao && !temPermissaoEmpresa(perfilAtual, permissao))
      ) {
        setState([]);
      }
    });

    if (
      STATUS_USUARIO_EMPRESA_BLOQUEADO.has(
        String(usuarioAtual.status || "").trim().toLowerCase()
      )
    ) {
      return;
    }

    const ouvirColecao = (colecao, setState) => {
      const permissao = permissoesPorColecao.get(colecao);

      if (permissao && !temPermissaoEmpresa(perfilAtual, permissao)) {
        return () => {};
      }

      return onSnapshot(
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
    };

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
  }, [
    user,
    empresaId,
    empresaOwnerUid,
    getRef,
    usuariosEmpresa,
    usuariosEmpresaCarregando,
  ]);

  useEffect(() => {
    const usuariosEmpresaRef = getUsuariosEmpresaRef();

    if (!user || !empresaId || !usuariosEmpresaRef) {
      return undefined;
    }

    const unsubscribe = onSnapshot(
      usuariosEmpresaRef,
      (snapshot) => {
        const lista = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        setUsuariosEmpresa(lista);
        setUsuariosEmpresaCarregando(false);
      },
      (error) => {
        console.error("Erro ao ouvir usuÃ¡rios da empresa:", error);
        setUsuariosEmpresa([]);
        setUsuariosEmpresaCarregando(false);
      }
    );

    return () => unsubscribe();
  }, [empresaId, getUsuariosEmpresaRef, user]);

  const usuarioEmpresaAtual = useMemo(() => {
    if (!user) return null;

    const usuarioVinculado = usuariosEmpresa.find(
      (usuarioEmpresa) => usuarioEmpresa.uidAuth === user.uid
    );

    if (usuarioVinculado) return usuarioVinculado;

    if ((empresaOwnerUid || user.uid) === user.uid) {
      return {
        id: user.uid,
        nome: user.displayName || user.email || "Dono da conta",
        email: user.email || "",
        role: PERFIL_DONO_EMPRESA,
        status: "ativo",
        uidAuth: user.uid,
        convitePendente: false,
        dono: true,
      };
    }

    return null;
  }, [empresaOwnerUid, user, usuariosEmpresa]);

  const perfilEmpresaAtual = normalizarRoleEmpresa(
    usuarioEmpresaAtual || PERFIL_EMPRESA_PADRAO
  );
  const permissoesEmpresaAtual = useMemo(
    () => getPermissoesPerfilEmpresa(perfilEmpresaAtual),
    [perfilEmpresaAtual]
  );
  const usuarioEmpresaInativo = STATUS_USUARIO_EMPRESA_BLOQUEADO.has(
    String(usuarioEmpresaAtual?.status || "").trim().toLowerCase()
  );
  const usuarioEmpresaSomenteLeitura = perfilEmpresaSomenteLeitura(perfilEmpresaAtual);

  const podeGerenciarUsuariosEmpresa = useMemo(
    () => !usuarioEmpresaInativo && temPermissaoEmpresa(perfilEmpresaAtual, "usuarios_empresa"),
    [perfilEmpresaAtual, usuarioEmpresaInativo]
  );

  const temPermissaoEmpresaAtual = useCallback((permissao) => {
    if (perfilUsuario?.role === "admin_master") return true;
    if (usuarioEmpresaInativo) return false;
    return temPermissaoEmpresa(perfilEmpresaAtual, permissao);
  }, [perfilEmpresaAtual, perfilUsuario, usuarioEmpresaInativo]);

  const enviarConviteEmailPorToken = useCallback(async (token, opcoes = {}) => {
    if (!user || !token) return false;

    try {
      const usuarioAuth = auth.currentUser;

      if (!usuarioAuth) {
        throw new Error("Usuario autenticado nao encontrado.");
      }

      const idToken = await usuarioAuth.getIdToken(true);

      const response = await fetch(`${API_URL}/api/convites/enviar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Nao foi possivel enviar o convite por email.");
      }

      if (!opcoes.silencioso) {
        showToast("Convite enviado por email com sucesso.", "success");
      }

      return true;
    } catch (error) {
      console.error("Erro ao enviar convite por email:", error);

      if (!opcoes.silenciosoErro) {
        showToast(error.message || "Erro ao enviar convite por email.", "error");
      }

      return false;
    }
  }, [showToast, user]);

  const criarUsuarioEmpresa = useCallback(async ({ nome, email, role, perfil }) => {
    const usuariosEmpresaRef = getUsuariosEmpresaRef();

    if (!user || !empresaId || !usuariosEmpresaRef) {
      showToast("Empresa ainda não carregou. Aguarde e tente novamente.", "warning");
      return false;
    }

    const nomeTratado = String(nome || "").trim();
    const emailTratado = String(email || "").trim().toLowerCase();
    const roleTratado = normalizarRoleEmpresa(role || perfil);

    if (!nomeTratado || !emailTratado || !roleTratado) {
      showToast("Preencha nome, e-mail e perfil do usuário.", "warning");
      return false;
    }

    const assinaturaAtual = {
      ...assinaturaPadrao,
      ...(assinaturaUsuario || {}),
    };
    const limiteUsuarios = getLimiteUsuariosEfetivo(
      assinaturaAtual.plano,
      assinaturaAtual.limiteUsuariosManual
    );
    const adminMaster = perfilUsuario?.role === "admin_master";
    const totalUsuarios = Math.max(
      usuariosEmpresa.filter(
        (usuarioEmpresa) =>
          String(usuarioEmpresa.status || "").trim().toLowerCase() !== "removido"
      ).length,
      1
    );

    if (!adminMaster && limiteUsuarios !== null && totalUsuarios >= limiteUsuarios) {
      showToast("Limite de usuários atingido para este plano. Entre em contato para liberar usuários adicionais.", "warning");
      return false;
    }

    const emailDuplicado = usuariosEmpresa.some(
      (usuarioEmpresa) =>
        String(usuarioEmpresa.status || "").trim().toLowerCase() !== "removido" &&
        String(usuarioEmpresa.email || "").trim().toLowerCase() === emailTratado
    );

    if (emailDuplicado) {
      showToast("Já existe um usuário com este e-mail nesta empresa.", "warning");
      return false;
    }

    const ownerUid = empresaOwnerUid || user.uid;
    const empresaAtual = empresas.find((empresa) => empresa.id === empresaId);
    const usuarioEmpresaRef = doc(usuariosEmpresaRef);
    const conviteToken = gerarTokenConvite();
    const { criadoEm, expiraEm } = criarDatasConvite();
    const conviteRef = doc(db, "convitesEmpresa", conviteToken);
    const dadosUsuarioEmpresa = {
      nome: nomeTratado,
      email: emailTratado,
      role: roleTratado,
      status: "pendente",
      uidAuth: null,
      criadoEm,
      atualizadoEm: criadoEm,
      criadoPor: user.uid,
      convitePendente: true,
      conviteToken,
      conviteCriadoEm: criadoEm,
      conviteExpiraEm: expiraEm,
      conviteAceitoEm: null,
      dono: false,
    };

    const batch = writeBatch(db);

    batch.set(usuarioEmpresaRef, dadosUsuarioEmpresa);
    batch.set(
      conviteRef,
      montarIndiceConvite({
        token: conviteToken,
        ownerUid,
        empresaId,
        usuarioEmpresaId: usuarioEmpresaRef.id,
        nome: nomeTratado,
        email: emailTratado,
        role: roleTratado,
        nomeEmpresa: empresaAtual?.nome || "",
        criadoEm,
        expiraEm,
      })
    );

    await batch.commit();

    const emailEnviado = await enviarConviteEmailPorToken(conviteToken, {
      silencioso: true,
      silenciosoErro: true,
    });

    showToast(
      emailEnviado
        ? "Convite criado e enviado por email com sucesso."
        : "Convite criado. O email nao foi enviado automaticamente; copie o link ou tente enviar novamente.",
      emailEnviado ? "success" : "warning"
    );
    return true;
  }, [
    assinaturaUsuario,
    empresaOwnerUid,
    empresaId,
    enviarConviteEmailPorToken,
    empresas,
    getUsuariosEmpresaRef,
    perfilUsuario,
    showToast,
    user,
    usuariosEmpresa,
  ]);

  const atualizarUsuarioEmpresa = useCallback(async (id, dados) => {
    const usuarioEmpresaRef = getUsuarioEmpresaDocRef(id);

    if (!usuarioEmpresaRef) return false;

    try {
      const dadosAtualizados = { ...dados };

      if (dadosAtualizados.role || dadosAtualizados.perfil || dadosAtualizados.profile) {
        dadosAtualizados.role = normalizarRoleEmpresa(
          dadosAtualizados.role || dadosAtualizados.perfil || dadosAtualizados.profile
        );
        delete dadosAtualizados.perfil;
        delete dadosAtualizados.profile;
      }

      await updateDoc(usuarioEmpresaRef, {
        ...dadosAtualizados,
        atualizadoEm: new Date(),
      });
      return true;
    } catch (error) {
      console.error("Erro ao atualizar usuÃ¡rio da empresa:", error);
      showToast("Erro ao atualizar usuário da empresa.", "error");
      return false;
    }
  }, [getUsuarioEmpresaDocRef, showToast]);

  const desativarUsuarioEmpresa = useCallback(async (id) => {
    return atualizarUsuarioEmpresa(id, {
      status: "inativo",
      convitePendente: false,
    });
  }, [atualizarUsuarioEmpresa]);

  const removerUsuarioEmpresa = useCallback(async (id) => {
    if (!user || !empresaId || !id) return false;

    try {
      const usuarioAuth = auth.currentUser;

      if (!usuarioAuth) {
        throw new Error("Usuario autenticado nao encontrado.");
      }

      const idToken = await usuarioAuth.getIdToken(true);
      const response = await fetch(`${API_URL}/api/convites/usuarios/remover`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerUid: empresaOwnerUid || user.uid,
          empresaId,
          usuarioEmpresaId: id,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Nao foi possivel remover este usuario.");
      }

      return true;
    } catch (error) {
      console.error("Erro ao remover usuario da empresa:", error);
      showToast("Nao foi possivel remover este usuario.", "error");
      return false;
    }
  }, [empresaId, empresaOwnerUid, showToast, user]);

  const renovarConviteUsuarioEmpresa = useCallback(async (id) => {
    const usuarioEmpresaRef = getUsuarioEmpresaDocRef(id);
    const usuarioEmpresa = usuariosEmpresa.find((item) => item.id === id);

    if (!usuarioEmpresaRef || !usuarioEmpresa || !empresaId || !user) return false;

    if (usuarioEmpresa.dono || usuarioEmpresa.status !== "pendente") {
      showToast("Apenas convites pendentes podem gerar novo link.", "warning");
      return false;
    }

    const ownerUid = empresaOwnerUid || user.uid;
    const empresaAtual = empresas.find((empresa) => empresa.id === empresaId);
    const conviteToken = gerarTokenConvite();
    const { criadoEm, expiraEm } = criarDatasConvite();
    const batch = writeBatch(db);

    batch.update(usuarioEmpresaRef, {
      conviteToken,
      conviteCriadoEm: criadoEm,
      conviteExpiraEm: expiraEm,
      conviteAceitoEm: null,
      convitePendente: true,
      status: "pendente",
      atualizadoEm: criadoEm,
    });

    if (usuarioEmpresa.conviteToken) {
      batch.set(
        doc(db, "convitesEmpresa", usuarioEmpresa.conviteToken),
        {
          status: "cancelado",
          canceladoEm: criadoEm,
          atualizadoEm: criadoEm,
        },
        { merge: true }
      );
    }

    batch.set(
      doc(db, "convitesEmpresa", conviteToken),
      montarIndiceConvite({
        token: conviteToken,
        ownerUid,
        empresaId,
        usuarioEmpresaId: id,
        nome: usuarioEmpresa.nome || "",
        email: usuarioEmpresa.email || "",
        role: normalizarRoleEmpresa(usuarioEmpresa),
        nomeEmpresa: empresaAtual?.nome || "",
        criadoEm,
        expiraEm,
      })
    );

    try {
      await batch.commit();
      showToast("Novo link de convite gerado com sucesso.", "success");
      return conviteToken;
    } catch (error) {
      console.error("Erro ao renovar convite:", error);
      showToast("Erro ao gerar novo link de convite.", "error");
      return false;
    }
  }, [
    empresaId,
    empresaOwnerUid,
    empresas,
    getUsuarioEmpresaDocRef,
    showToast,
    user,
    usuariosEmpresa,
  ]);

  const enviarConviteEmailUsuarioEmpresa = useCallback(async (id) => {
    const usuarioEmpresa = usuariosEmpresa.find((item) => item.id === id);

    if (!usuarioEmpresa) {
      showToast("Usuario da empresa nao encontrado.", "warning");
      return false;
    }

    if (usuarioEmpresa.status !== "pendente" || !usuarioEmpresa.conviteToken) {
      showToast("Apenas convites pendentes com link podem ser enviados.", "warning");
      return false;
    }

    return enviarConviteEmailPorToken(usuarioEmpresa.conviteToken);
  }, [enviarConviteEmailPorToken, showToast, usuariosEmpresa]);

  const excluirUsuarioEmpresa = useCallback(async (id) => {
    const usuarioEmpresaRef = getUsuarioEmpresaDocRef(id);
    const usuarioEmpresa = usuariosEmpresa.find((item) => item.id === id);

    if (!usuarioEmpresaRef) return false;

    try {
      if (usuarioEmpresa?.conviteToken) {
        const atualizadoEm = new Date();
        const batch = writeBatch(db);

        batch.set(
          doc(db, "convitesEmpresa", usuarioEmpresa.conviteToken),
          {
            status: "cancelado",
            canceladoEm: atualizadoEm,
            atualizadoEm,
          },
          { merge: true }
        );
        batch.delete(usuarioEmpresaRef);
        await batch.commit();
      } else {
        await deleteDoc(usuarioEmpresaRef);
      }

      return true;
    } catch (error) {
      console.error("Erro ao excluir usuÃ¡rio da empresa:", error);
      showToast("Erro ao excluir usuário da empresa.", "error");
      return false;
    }
  }, [getUsuarioEmpresaDocRef, showToast, usuariosEmpresa]);

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
    if (!user || !empresaId || !id) return false;

    try {
      await deleteDoc(getDocRef(colecao, id));
      return true;
    } catch (error) {
      console.error(`Erro ao excluir ${colecao}:`, error);
      showToast("Erro ao excluir no Firebase. Veja o console.", "error");
      return false;
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
        empresaOwnerUid,
        empresas,
        trocarEmpresa,
        criarNovaEmpresa,
        usuariosEmpresa,
        usuariosEmpresaCarregando,
        usuarioEmpresaAtual,
        perfilEmpresaAtual,
        permissoesEmpresaAtual,
        usuarioEmpresaInativo,
        usuarioEmpresaSomenteLeitura,
        podeGerenciarUsuariosEmpresa,
        temPermissaoEmpresaAtual,
        criarUsuarioEmpresa,
        atualizarUsuarioEmpresa,
        desativarUsuarioEmpresa,
        removerUsuarioEmpresa,
        renovarConviteUsuarioEmpresa,
        enviarConviteEmailUsuarioEmpresa,
        excluirUsuarioEmpresa,

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
