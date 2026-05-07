import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useERP } from "../context/useERP";
import { useToast } from "../context/useToast";

const defaultParams = {
  unidadesMedida: [
    { id: "un", nome: "Unidade", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "kg", nome: "Kilograma", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "g", nome: "Grama", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "lt", nome: "Litro", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "ml", nome: "Mililitro", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "m", nome: "Metro", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "cm", nome: "Centímetro", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "mm", nome: "Milímetro", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
  ],
  tiposProduto: [
    { id: "materiaPrima", nome: "Matéria Prima", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "produtoFinal", nome: "Produto Final", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "servico", nome: "Serviço", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
  ],
  categoriasDespesa: [
    { id: "aluguel", nome: "Aluguel", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "salarios", nome: "Salários", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "comissaoVendas", nome: "Comissão de Vendas", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "marketing", nome: "Marketing", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "transporte", nome: "Transporte", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
    { id: "impostosTaxas", nome: "Impostos e Taxas", ativo: true, criadoEm: new Date(), atualizadoEm: new Date() },
  ],
};

export function useParametros() {
  const { user, empresaId } = useERP();
  const { showToast } = useToast();

  const [unidadesMedida, setUnidadesMedida] = useState(defaultParams.unidadesMedida);
  const [tiposProduto, setTiposProduto] = useState(defaultParams.tiposProduto);
  const [categoriasDespesa, setCategoriasDespesa] = useState(defaultParams.categoriasDespesa);

  const getParamRef = useCallback((paramType) => {
    if (!user || !empresaId) return null;
    return doc(db, "users", user.uid, "empresas", empresaId, "parametros", paramType);
    // Ensure the path is correct and doesn't allow overwriting parameters between companies
  }, [user, empresaId]);

  const loadParametros = useCallback((paramType, setState, defaultValues) => {
    if (!user || !empresaId) return;

    const paramRef = getParamRef(paramType);
    if (!paramRef) return;

    const unsubscribe = onSnapshot(paramRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().items) {
        setState(docSnap.data().items);
      } else {
        setState(defaultValues);
        // Optionally, create the document with default values if it doesn't exist
        setDoc(paramRef, { items: defaultValues }, { merge: true }).catch(error => {
          console.error(`Erro ao criar documento de parâmetro padrão para ${paramType}:`, error);
        });
      }
    }, (error) => {
      console.error(`Erro ao ouvir ${paramType}:`, error);
      setState(defaultValues);
      showToast(`Erro ao carregar ${paramType}.`, "error");
    });
    return unsubscribe;
  }, [user, empresaId, getParamRef, showToast]);

  useEffect(() => {
    if (!user || !empresaId) return;

    const unsubscribeUnidadesMedida = loadParametros("unidadesMedida", setUnidadesMedida, defaultParams.unidadesMedida);
    const unsubscribeTiposProduto = loadParametros("tiposProduto", setTiposProduto, defaultParams.tiposProduto);
    const unsubscribeCategoriasDespesa = loadParametros("categoriasDespesa", setCategoriasDespesa, defaultParams.categoriasDespesa);

    return () => {
      if (typeof unsubscribeUnidadesMedida === "function") {
          unsubscribeUnidadesMedida();
        }

        if (typeof unsubscribeTiposProduto === "function") {
          unsubscribeTiposProduto();
        }

        if (typeof unsubscribeCategoriasDespesa === "function") {
          unsubscribeCategoriasDespesa();
        }
      };
  }, [user, empresaId, loadParametros]);

  const updateParamDoc = useCallback(async (paramType, newItems) => {
    if (!user || !empresaId) {
      showToast("Usuário não logado ou empresa não selecionada.", "warning");
      return;
    }
    const paramRef = getParamRef(paramType);
    if (!paramRef) return;

    try {
      await setDoc(paramRef, { items: newItems }, { merge: true });
      showToast(`Parâmetros de ${paramType} atualizados com sucesso!`, "success");
    } catch (error) {
      console.error(`Erro ao atualizar ${paramType}:`, error);
      showToast(`Erro ao atualizar parâmetros de ${paramType}.`, "error");
    }
  }, [user, empresaId, getParamRef, showToast]);

  const adicionarParametro = useCallback(async (paramType, nome) => {
    if (!nome) {
      showToast("Informe o nome do parâmetro.", "warning");
      return;
    }

    const currentItems = {
      unidadesMedida: unidadesMedida,
      tiposProduto: tiposProduto,
      categoriasDespesa: categoriasDespesa,
    }[paramType];

    if (currentItems.some(item => item.nome.toLowerCase() === nome.toLowerCase())) {
      showToast("Já existe um parâmetro com este nome.", "warning");
      return;
    }

    const newItem = {
      id: Date.now().toString(), // Use a more robust unique ID generation if collisions are a concern
      nome,
      ativo: true,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };

    const newItems = [...currentItems, newItem];
    await updateParamDoc(paramType, newItems);
  }, [unidadesMedida, tiposProduto, categoriasDespesa, updateParamDoc, showToast]);

  const editarParametro = useCallback(async (paramType, id, novoNome, ativo) => {
    if (!novoNome) {
      showToast("Informe o novo nome do parâmetro.", "warning");
      return;
    }

    const currentItems = {
      unidadesMedida: unidadesMedida,
      tiposProduto: tiposProduto,
      categoriasDespesa: categoriasDespesa,
    }[paramType];

    const newItems = currentItems.map(item => 
      item.id === id ? { ...item, nome: novoNome, ativo: ativo, atualizadoEm: new Date() } : item
    );

    await updateParamDoc(paramType, newItems);
  }, [unidadesMedida, tiposProduto, categoriasDespesa, updateParamDoc, showToast]);

  const desativarParametro = useCallback(async (paramType, id, ativo) => {
    const currentItems = {
      unidadesMedida: unidadesMedida,
      tiposProduto: tiposProduto,
      categoriasDespesa: categoriasDespesa,
    }[paramType];

    const newItems = currentItems.map(item => 
      item.id === id ? { ...item, ativo: ativo, atualizadoEm: new Date() } : item
    );

    await updateParamDoc(paramType, newItems);
  }, [unidadesMedida, tiposProduto, categoriasDespesa, updateParamDoc]);

  const excluirParametro = useCallback(async (paramType, id) => {
    const currentItems = {
      unidadesMedida: unidadesMedida,
      tiposProduto: tiposProduto,
      categoriasDespesa: categoriasDespesa,
    }[paramType];

    const newItems = currentItems.filter(item => item.id !== id);

    await updateParamDoc(paramType, newItems);
  }, [unidadesMedida, tiposProduto, categoriasDespesa, updateParamDoc]);

  return {
    unidadesMedida,
    tiposProduto,
    categoriasDespesa,
    adicionarParametro,
    editarParametro,
    desativarParametro,
    excluirParametro,
  };
}