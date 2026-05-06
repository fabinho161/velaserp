export const moedaBR = (valor) => {
  return Number(valor ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

export const numeroBR = (valor, casas = 2) => {
  return Number(valor ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
};

export const inteiroBR = (valor) => {
  return Number(valor ?? 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  });
};

export const dataBR = (data) => {
  if (!data) return "-";

  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
};