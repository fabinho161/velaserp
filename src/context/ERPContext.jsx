import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  assinaturaGratisPadrao,
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
  ["perdasDoacoes", PERMISSOES_EMPRESA.estoque],
  ["clientesComerciais", PERMISSOES_EMPRESA.crm],
];
const COLECOES_DADOS_DASHBOARD = new Set(["insumos", "producoes", "vendas", "despesas"]);

const STATUS_USUARIO_EMPRESA_BLOQUEADO = new Set(["inativo", "removido"]);
const PRIORIDADE_STATUS_USUARIO_EMPRESA = {
  ativo: 0,
  pendente: 1,
  inativo: 2,
  removido: 3,
};

const normalizarStatusUsuarioEmpresa = (status) =>
  String(status || "").trim().toLowerCase();

const ordenarUsuariosEmpresaPorAcesso = (a = {}, b = {}) => {
  const prioridadeA =
    PRIORIDADE_STATUS_USUARIO_EMPRESA[normalizarStatusUsuarioEmpresa(a.status)] ?? 4;
  const prioridadeB =
    PRIORIDADE_STATUS_USUARIO_EMPRESA[normalizarStatusUsuarioEmpresa(b.status)] ?? 4;

  if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;

  const dataA = a.atualizadoEm?.toMillis?.() || a.criadoEm?.toMillis?.() || 0;
  const dataB = b.atualizadoEm?.toMillis?.() || b.criadoEm?.toMillis?.() || 0;

  return dataB - dataA;
};

const escolherUsuarioEmpresaAtual = (usuariosEmpresa = [], usuario) => {
  if (!usuario) return null;

  const emailUsuario = String(usuario.email || "").trim().toLowerCase();

  return usuariosEmpresa
    .filter((usuarioEmpresa) => {
      const mesmoUid = usuarioEmpresa.uidAuth && usuarioEmpresa.uidAuth === usuario.uid;
      const mesmoEmail =
        emailUsuario &&
        String(usuarioEmpresa.email || "").trim().toLowerCase() === emailUsuario;

      return mesmoUid || mesmoEmail;
    })
    .sort(ordenarUsuariosEmpresaPorAcesso)[0] || null;
};

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

const removerPlanoEspelhoEmpresa = (empresasAtuais, empresaId, ownerUid) => {
  let alterou = false;
  const proximasEmpresas = empresasAtuais.map((empresa) => {
    if (empresa.id !== empresaId || empresa.ownerUid !== ownerUid) return empresa;
    if (!Object.prototype.hasOwnProperty.call(empresa, "planoEspelho")) return empresa;

    alterou = true;
    const empresaSemPlanoEspelho = { ...empresa };
    delete empresaSemPlanoEspelho.planoEspelho;
    return empresaSemPlanoEspelho;
  });

  return alterou ? proximasEmpresas : empresasAtuais;
};

const getMensagemErroConviteUsuario = (status, data = {}) => {
  if (status === 400) return "Dados invalidos para criar o convite.";
  if (status === 401) return "Sua sessao expirou. Entre novamente para continuar.";
  if (status === 403) return "Voce nao tem permissao para gerenciar usuarios desta empresa.";
  if (status === 404) return "Empresa nao encontrada ou vinculo invalido.";
  if (status >= 500) return "Nao foi possivel processar o convite agora. Tente novamente.";

  if (status === 409) {
    const mensagensPorCodigo = {
      limite_usuarios_atingido: "Limite de usuarios atingido para este plano.",
      usuario_ativo: "Este usuario ja esta ativo nesta empresa.",
      usuario_inativo: "Este usuario esta inativo. Use o fluxo de reativacao futuramente.",
      duplicidade_ambigua: "Ha duplicidade de usuarios para este e-mail. Regularize antes de convidar.",
      convite_owner: "O dono da empresa nao pode ser convidado.",
      status_inconsistente: "O status deste usuario esta inconsistente. Regularize antes de convidar.",
      token_indisponivel: "Nao foi possivel gerar o convite. Tente novamente.",
    };

    return mensagensPorCodigo[data.codigo] || "Nao foi possivel criar o convite por conflito de dados.";
  }

  return "Nao foi possivel criar o convite. Tente novamente.";
};

const montarUrlConvitesUsuariosEmpresa = (ownerUid, empresaId) =>
  `${API_URL}/api/empresas/${encodeURIComponent(ownerUid)}/${encodeURIComponent(empresaId)}/usuarios/convites`;

const montarUrlStatusUsuarioEmpresa = (ownerUid, empresaId, usuarioEmpresaId) =>
  `${API_URL}/api/empresas/${encodeURIComponent(ownerUid)}/${encodeURIComponent(empresaId)}/usuarios/${encodeURIComponent(usuarioEmpresaId)}/status`;

const lerJsonSeguro = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const getResumoVagasConviteUsuario = (data = {}) => {
  if (data.vagasOcupadas == null || data.limiteUsuarios == null) {
    return "";
  }

  const vagasOcupadas = Number(data.vagasOcupadas);
  const limiteUsuarios = Number(data.limiteUsuarios);

  if (!Number.isFinite(vagasOcupadas) || !Number.isFinite(limiteUsuarios)) {
    return "";
  }

  return ` Vagas usadas: ${vagasOcupadas}/${limiteUsuarios}.`;
};

const getMensagemSucessoConviteUsuario = (data = {}) => {
  const resumoVagas = getResumoVagasConviteUsuario(data);

  if (data.conviteEnviado === false) {
    return `Usuario cadastrado e vaga reservada. O email nao foi enviado automaticamente; copie o link ou tente enviar novamente.${resumoVagas}`;
  }

  const mensagensPorOperacao = {
    criado: "Convite criado e enviado por email com sucesso.",
    reenviado: "Convite reenviado por email com sucesso.",
    reconvidado: "Usuario reconvidado e email enviado com sucesso.",
  };

  return `${mensagensPorOperacao[data.operacao] || "Convite processado com sucesso."}${resumoVagas}`;
};

const getResumoVagasStatusUsuario = (data = {}) => {
  if (data.vagasOcupadas == null || data.limiteUsuarios == null) {
    return "";
  }

  const vagasOcupadas = Number(data.vagasOcupadas);
  const limiteUsuarios = Number(data.limiteUsuarios);

  if (!Number.isFinite(vagasOcupadas) || !Number.isFinite(limiteUsuarios)) {
    return "";
  }

  return ` Vagas usadas: ${vagasOcupadas}/${limiteUsuarios}.`;
};

const getMensagemErroStatusUsuario = (status, data = {}) => {
  if (status === 400) return "Requisicao invalida para alterar o status do usuario.";
  if (status === 401) return "Sua sessao expirou. Entre novamente para continuar.";
  if (status === 403) return "Voce nao tem permissao para alterar este usuario.";
  if (status === 404) return "Empresa ou usuario nao encontrado.";
  if (status >= 500) return "Nao foi possivel alterar o status agora. Tente novamente.";

  if (status === 409) {
    const mensagensPorCodigo = {
      limite_usuarios_atingido: "Limite de usuarios atingido para este plano.",
      estado_incompativel: "O status atual deste usuario nao permite esta alteracao.",
      usuario_pendente: "Convites pendentes devem ser ativados pelo fluxo de convite/login.",
      usuario_removido: "Usuarios removidos devem receber um novo convite.",
      ponteiro_ausente: "O vinculo deste usuario precisa ser regularizado antes da reativacao.",
      ponteiro_inconsistente: "O vinculo deste usuario esta inconsistente e precisa ser regularizado.",
      identidade_inconsistente: "Este usuario nao possui identidade autenticada valida para reativacao.",
    };

    return mensagensPorCodigo[data.codigo] || "Nao foi possivel alterar o status por conflito de dados.";
  }

  return "Nao foi possivel alterar o status do usuario. Tente novamente.";
};

const getMensagemSucessoStatusUsuario = (data = {}) => {
  const resumoVagas = getResumoVagasStatusUsuario(data);
  const mensagensPorOperacao = {
    reativado: "Usuario reativado com sucesso.",
    inativado: "Usuario inativado com sucesso.",
    sem_alteracao: "Status do usuario ja estava sincronizado.",
  };

  return `${mensagensPorOperacao[data.operacao] || "Status do usuario atualizado com sucesso."}${resumoVagas}`;
};

const mesclarEmpresaComDocumentoReal = ({
  empresa,
  dadosEmpresaReal,
  empresaId,
  ownerUid,
}) => {
  const metadadosVinculo = { ...empresa };
  delete metadadosVinculo.planoEspelho;

  return {
    ...dadosEmpresaReal,
    ...metadadosVinculo,
    id: empresa.id,
    nome: dadosEmpresaReal.nome || empresa.nome,
    ownerUid,
    empresaId,
    planoEspelho: dadosEmpresaReal.planoEspelho,
  };
};

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
  const criacaoInicialEmpresaRef = useRef(new Set());

  const [insumos, setInsumos] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [producoes, setProducoes] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [perdasDoacoes, setPerdasDoacoes] = useState([]);
  const [clientesComerciais, setClientesComerciais] = useState([]);
  const [configuracoes, setConfiguracoes] = useState({});

  const criarEmpresaBackend = useCallback(async (nome) => {
    const usuarioAuth = auth.currentUser;

    if (!usuarioAuth) {
      throw new Error("Usuario autenticado nao encontrado.");
    }

    const idToken = await usuarioAuth.getIdToken(true);
    const response = await fetch(`${API_URL}/api/empresas`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nome }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false || data.success === false) {
      const detalhesLimite = data.motivo === "limite_empresas_atingido"
        ? ` Plano: ${data.plano || "-"}. Limite: ${data.limiteEmpresas ?? "-"}. Atual: ${data.quantidadeAtual ?? "-"}.`
        : "";

      throw new Error(
        `${data.error || "Nao foi possivel criar a empresa."}${detalhesLimite}`
      );
    }

    if (!data.empresa?.id) {
      throw new Error("Resposta invalida ao criar empresa.");
    }

    return data.empresa;
  }, []);

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
      setPerdasDoacoes([]);
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

  const nomeTratado = String(nomeEmpresa || "").trim();

  if (!nomeTratado) {
    showToast("Informe o nome da empresa.", "warning");
    return;
  }

  try {
    const empresaCriada = await criarEmpresaBackend(nomeTratado);

    setEmpresas([...empresas, empresaCriada]);
    setUsuariosEmpresaCarregando(true);
    setEmpresaId(empresaCriada.id);
    setEmpresaOwnerUid(empresaCriada.ownerUid || user.uid);
    localStorage.setItem(`renovarEmpresaAtiva_${user.uid}`, empresaCriada.id);
    showToast("Empresa criada com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao criar empresa:", error);
    showToast(error.message || "Erro ao criar empresa.", "error");
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
            if (criacaoInicialEmpresaRef.current.has(user.uid)) return;

            criacaoInicialEmpresaRef.current.add(user.uid);

            let empresaCriada = null;

            try {
              empresaCriada = await criarEmpresaBackend("Minha Empresa");
            } catch (error) {
              criacaoInicialEmpresaRef.current.delete(user.uid);
              throw error;
            }

            if (cancelado) return;

            setEmpresas([empresaCriada]);
            setUsuariosEmpresaCarregando(true);
            setEmpresaId(empresaCriada.id);
            setEmpresaOwnerUid(empresaCriada.ownerUid || user.uid);
            localStorage.setItem(`renovarEmpresaAtiva_${user.uid}`, empresaCriada.id);
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
    }, [criarEmpresaBackend, showToast, user]);

    
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

    const usuarioVinculado = escolherUsuarioEmpresaAtual(usuariosEmpresa, user);
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
    const statusUsuarioAtual = normalizarStatusUsuarioEmpresa(usuarioAtual.status);
    const usuarioAtivo = !STATUS_USUARIO_EMPRESA_BLOQUEADO.has(statusUsuarioAtual);
    const podeCarregarDashboard = usuarioAtivo &&
      temPermissaoEmpresa(perfilAtual, PERMISSOES_EMPRESA.dashboard);
    const podeOuvirColecao = (colecao) => {
      const permissao = permissoesPorColecao.get(colecao);

      return usuarioAtivo &&
        (
          (permissao && temPermissaoEmpresa(perfilAtual, permissao)) ||
          (podeCarregarDashboard && COLECOES_DADOS_DASHBOARD.has(colecao))
        );
    };
    const settersPorColecao = {
      insumos: setInsumos,
      produtos: setProdutos,
      producoes: setProducoes,
      vendas: setVendas,
      despesas: setDespesas,
      perdasDoacoes: setPerdasDoacoes,
      clientesComerciais: setClientesComerciais,
    };

    Object.entries(settersPorColecao).forEach(([colecao, setState]) => {
      if (!podeOuvirColecao(colecao)) {
        setState([]);
      }
    });

    if (!usuarioAtivo) {
      return;
    }

    const ouvirColecao = (colecao, setState) => {
      if (!podeOuvirColecao(colecao)) {
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
      ouvirColecao("perdasDoacoes", setPerdasDoacoes),
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

    const usuarioVinculado = escolherUsuarioEmpresaAtual(usuariosEmpresa, user);

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
    normalizarStatusUsuarioEmpresa(usuarioEmpresaAtual?.status)
  );
  const usuarioEmpresaSomenteLeitura = perfilEmpresaSomenteLeitura(perfilEmpresaAtual);
  const usuarioUid = user?.uid || null;
  const empresaSelecionada = useMemo(
    () => empresas.find((empresa) =>
      empresa.id === empresaId &&
      (empresa.ownerUid || usuarioUid) === (empresaOwnerUid || usuarioUid)
    ) || null,
    [empresaId, empresaOwnerUid, empresas, usuarioUid]
  );
  const empresaSelecionadaExiste = Boolean(empresaSelecionada);
  const statusEmpresaSelecionada = normalizarStatusUsuarioEmpresa(
    empresaSelecionada?.status
  );
  const usuarioEmpresaAtualAtivo = Boolean(
    usuarioEmpresaAtual &&
    !usuarioEmpresaInativo &&
    normalizarStatusUsuarioEmpresa(usuarioEmpresaAtual.status) === "ativo"
  );

  useEffect(() => {
    const empresaConvidada =
      usuarioUid &&
      empresaId &&
      empresaOwnerUid &&
      empresaOwnerUid !== usuarioUid;

    if (!empresaConvidada) {
      return undefined;
    }

    if (
      !empresaSelecionadaExiste ||
      statusEmpresaSelecionada !== "ativo" ||
      !usuarioEmpresaAtualAtivo
    ) {
      return undefined;
    }

    const empresaRealRef = doc(
      db,
      "users",
      empresaOwnerUid,
      "empresas",
      empresaId
    );

    const unsubscribe = onSnapshot(
      empresaRealRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setEmpresas((empresasAtuais) =>
            removerPlanoEspelhoEmpresa(empresasAtuais, empresaId, empresaOwnerUid)
          );
          return;
        }

        const dadosEmpresaReal = snapshot.data() || {};

        setEmpresas((empresasAtuais) =>
          empresasAtuais.map((empresa) => {
            if (empresa.id !== empresaId || empresa.ownerUid !== empresaOwnerUid) {
              return empresa;
            }

            return mesclarEmpresaComDocumentoReal({
              empresa,
              dadosEmpresaReal,
              empresaId,
              ownerUid: empresaOwnerUid,
            });
          })
        );
      },
      (error) => {
        console.error("Erro ao ouvir documento raiz da empresa convidada:", error);
        setEmpresas((empresasAtuais) =>
          removerPlanoEspelhoEmpresa(empresasAtuais, empresaId, empresaOwnerUid)
        );
      }
    );

    return () => {
      unsubscribe();
      setEmpresas((empresasAtuais) =>
        removerPlanoEspelhoEmpresa(empresasAtuais, empresaId, empresaOwnerUid)
      );
    };
  }, [
    empresaId,
    empresaOwnerUid,
    empresaSelecionadaExiste,
    statusEmpresaSelecionada,
    usuarioEmpresaAtualAtivo,
    usuarioUid,
  ]);

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
      const data = await lerJsonSeguro(response);

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
    if (!user || !empresaId) {
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

    const usuarioMesmoEmail = usuariosEmpresa.find(
      (usuarioEmpresa) =>
        String(usuarioEmpresa.email || "").trim().toLowerCase() === emailTratado
    );
    const statusMesmoEmail = normalizarStatusUsuarioEmpresa(usuarioMesmoEmail?.status);

    if (["ativo", "pendente"].includes(statusMesmoEmail)) {
      showToast("Já existe um usuário com este e-mail nesta empresa.", "warning");
      return false;
    }

    const ownerUid =
      empresaOwnerUid || empresas.find((empresa) => empresa.id === empresaId)?.ownerUid;

    if (!ownerUid) {
      showToast("Empresa ainda não carregou. Aguarde e tente novamente.", "warning");
      return false;
    }

    try {
      const usuarioAuth = auth.currentUser;

      if (!usuarioAuth) {
        throw new Error("Usuario autenticado nao encontrado.");
      }

      const idToken = await usuarioAuth.getIdToken();
      const response = await fetch(
        montarUrlConvitesUsuariosEmpresa(ownerUid, empresaId),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nome: nomeTratado,
            email: emailTratado,
            role: roleTratado,
          }),
        }
      );
      const data = await lerJsonSeguro(response);

      if (!response.ok || data.ok === false) {
        throw new Error(getMensagemErroConviteUsuario(response.status, data));
      }

      showToast(
        getMensagemSucessoConviteUsuario(data),
        data.conviteEnviado === false ? "warning" : "success"
      );
      return data;
    } catch (error) {
      console.error("Erro ao criar usuario da empresa:", error);
      const mensagemErro =
        error instanceof TypeError
          ? "Nao foi possivel conectar ao servidor. Tente novamente."
          : error.message || "Erro ao criar usuario da empresa.";
      showToast(mensagemErro, "error");
      return false;
    }
  }, [
    empresaOwnerUid,
    empresaId,
    empresas,
    showToast,
    user,
    usuariosEmpresa,
  ]);

  const atualizarStatusUsuarioEmpresa = useCallback(async (id, status) => {
    if (!user || !empresaId || !id) {
      showToast("Empresa ainda nao carregou. Aguarde e tente novamente.", "warning");
      return false;
    }

    const statusTratado = normalizarStatusUsuarioEmpresa(status);

    if (!["ativo", "inativo"].includes(statusTratado)) {
      showToast("Status de usuario invalido.", "warning");
      return false;
    }

    const empresaAtiva = empresas.find((empresa) => empresa.id === empresaId);
    const ownerUid = empresaOwnerUid || empresaAtiva?.ownerUid;

    if (!ownerUid || !empresaId || !id) {
      showToast("Empresa ainda nao carregou. Aguarde e tente novamente.", "warning");
      return false;
    }

    try {
      const usuarioAuth = auth.currentUser;

      if (!usuarioAuth) {
        throw new Error("Usuario autenticado nao encontrado.");
      }

      const idToken = await usuarioAuth.getIdToken();
      const response = await fetch(
        montarUrlStatusUsuarioEmpresa(ownerUid, empresaId, id),
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: statusTratado,
          }),
        }
      );
      const data = await lerJsonSeguro(response);

      if (!response.ok || data.ok === false) {
        throw new Error(getMensagemErroStatusUsuario(response.status, data));
      }

      showToast(getMensagemSucessoStatusUsuario(data), "success");
      return data;
    } catch (error) {
      console.error("Erro ao alterar status do usuario da empresa:", error);
      const mensagemErro =
        error instanceof TypeError
          ? "Nao foi possivel conectar ao servidor. Tente novamente."
          : error.message || "Erro ao alterar status do usuario da empresa.";
      showToast(mensagemErro, "error");
      return false;
    }
  }, [
    empresaId,
    empresaOwnerUid,
    empresas,
    showToast,
    user,
  ]);

  const atualizarUsuarioEmpresa = useCallback(async (id, dados) => {
    const usuarioEmpresaRef = getUsuarioEmpresaDocRef(id);

    if (!usuarioEmpresaRef) return false;

    try {
      const dadosRecebidos =
        dados && typeof dados === "object" && !Array.isArray(dados)
          ? dados
          : {};

      if (Object.prototype.hasOwnProperty.call(dadosRecebidos, "status")) {
        showToast("Use o fluxo seguro para alterar status de usuarios.", "warning");
        return false;
      }

      const camposPermitidos = ["role", "perfil", "profile"];
      const camposInvalidos = Object.keys(dadosRecebidos).filter(
        (campo) => !camposPermitidos.includes(campo)
      );

      if (camposInvalidos.length > 0) {
        showToast("Atualizacao de usuario da empresa invalida.", "warning");
        return false;
      }

      const roleInformada =
        dadosRecebidos.role ?? dadosRecebidos.perfil ?? dadosRecebidos.profile;

      if (!roleInformada) {
        showToast("Perfil de usuario invalido.", "warning");
        return false;
      }

      await updateDoc(usuarioEmpresaRef, {
        role: normalizarRoleEmpresa(roleInformada),
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
    return atualizarStatusUsuarioEmpresa(id, "inativo");
  }, [atualizarStatusUsuarioEmpresa]);

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
    const usuarioEmpresa = usuariosEmpresa.find((item) => item.id === id);

    if (!usuarioEmpresa || !empresaId || !user) return false;

    if (usuarioEmpresa.dono || usuarioEmpresa.status !== "pendente") {
      showToast("Apenas convites pendentes podem gerar novo link.", "warning");
      return false;
    }

    const ownerUid =
      empresaOwnerUid || empresas.find((empresa) => empresa.id === empresaId)?.ownerUid;

    try {
      if (!ownerUid) {
        throw new Error("Empresa ainda nao carregou. Aguarde e tente novamente.");
      }

      const usuarioAuth = auth.currentUser;

      if (!usuarioAuth) {
        throw new Error("Usuario autenticado nao encontrado.");
      }

      const idToken = await usuarioAuth.getIdToken();
      const response = await fetch(
        montarUrlConvitesUsuariosEmpresa(ownerUid, empresaId),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nome: String(
              usuarioEmpresa.nome || usuarioEmpresa.email || "Usuario convidado"
            ).trim(),
            email: String(usuarioEmpresa.email || "").trim().toLowerCase(),
            role: normalizarRoleEmpresa(usuarioEmpresa),
          }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(getMensagemErroConviteUsuario(response.status, data));
      }

      showToast(
        getMensagemSucessoConviteUsuario(data),
        data.conviteEnviado === false ? "warning" : "success"
      );
      return data;
    } catch (error) {
      console.error("Erro ao renovar convite:", error);
      const mensagemErro =
        error instanceof TypeError
          ? "Nao foi possivel conectar ao servidor. Tente novamente."
          : error.message || "Erro ao gerar novo link de convite.";
      showToast(mensagemErro, "error");
      return false;
    }
  }, [
    empresaId,
    empresaOwnerUid,
    empresas,
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
    return removerUsuarioEmpresa(id);
  }, [removerUsuarioEmpresa]);

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
        atualizarStatusUsuarioEmpresa,
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
        perdasDoacoes,
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
