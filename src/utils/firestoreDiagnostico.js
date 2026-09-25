export const registrarErroFirestore = ({
  origem,
  colecao,
  operacao,
  error,
  perfil = null,
  segmento = null,
}) => {
  console.error(`[Firestore][${origem}][${colecao}][${operacao}]`, {
    code: error?.code || "unknown",
    message: error?.message || "Erro Firestore sem mensagem.",
    perfil,
    segmento,
  });
};
