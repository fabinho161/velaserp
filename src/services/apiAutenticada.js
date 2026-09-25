import { auth } from "../firebase.js";

export const criarFetchAutenticado = ({
  obterUsuario = () => auth.currentUser,
  fetchImpl = (...args) => fetch(...args),
} = {}) => async (url, opcoes = {}) => {
  let usuario = obterUsuario();

  if (!usuario) {
    throw new Error("Sua sessão expirou. Entre novamente.");
  }

  const enviar = async (forcarRenovacao) => {
    const token = await usuario.getIdToken(forcarRenovacao);
    const headers = new Headers(opcoes.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetchImpl(url, { ...opcoes, headers });
  };

  const respostaInicial = await enviar(false);
  if (respostaInicial.status !== 401) return respostaInicial;

  const usuarioAtual = obterUsuario();
  if (!usuarioAtual || usuarioAtual.uid !== usuario.uid) {
    throw new Error("Sua sessão expirou. Entre novamente.");
  }

  usuario = usuarioAtual;
  return enviar(true);
};

export const fetchAutenticado = criarFetchAutenticado();
