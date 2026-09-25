import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizarSegmentoEmpresa } from "../../config/segmentosEmpresa.js";
import {
  montarAlteracaoStatusCliente,
  montarDadosClientePersistencia,
} from "../clientesCRM.js";

const formCompleto = {
  nome: " Cliente Teste ",
  telefone: " (11) 99999-0000 ",
  email: " cliente@teste.com ",
  documento: " 12345678900 ",
  cidade: " São Paulo ",
  uf: " sp ",
  endereco: " Rua Um, 10 ",
  observacoes: "Atendimento recorrente",
  tipo: "Revendedor",
  statusRelacionamento: "Atenção",
  proximaAcao: "Retornar contato",
  dataProximaAcao: "2026-10-10",
  ativo: true,
  fiscal: { tipoPessoa: "fisica", cpf: "12345678900" },
};

test("Gestão de Serviços usa o segmento canônico clientes", () => {
  assert.equal(normalizarSegmentoEmpresa("clientes"), "clientes");
  assert.equal(normalizarSegmentoEmpresa("servicos"), "clientes");
});

test("novo cliente de serviços mantém defaults compatíveis do modelo", () => {
  const dados = montarDadosClientePersistencia({
    form: formCompleto,
    fiscalCliente: null,
    isPrestacaoServicos: true,
    empresaId: "empresa-1",
    userId: "user-1",
  });

  assert.equal(dados.nome, "Cliente Teste");
  assert.equal(dados.tipo, "Revendedor");
  assert.equal(dados.statusRelacionamento, "Atenção");
  assert.equal(dados.fiscal, null);
});

test("edição simplificada preserva campos CRM e fiscais ocultos", () => {
  const clienteExistente = {
    id: "cliente-1",
    ...formCompleto,
    telefone: "(11) 90000-0000",
    fiscal: {
      tipoPessoa: "juridica",
      cnpj: "01234567000189",
      inscricaoEstadual: "110042490114",
      enderecoFiscal: { paisCodigo: "BR", municipioCodigo: "3550308" },
    },
  };
  const patch = montarDadosClientePersistencia({
    form: { ...formCompleto, telefone: "(11) 98888-7777" },
    isPrestacaoServicos: true,
    clienteExistente,
    empresaId: "empresa-1",
    userId: "user-1",
  });
  const salvo = { ...clienteExistente, ...patch };

  assert.equal(salvo.telefone, "(11) 98888-7777");
  assert.equal(salvo.tipo, clienteExistente.tipo);
  assert.equal(salvo.statusRelacionamento, clienteExistente.statusRelacionamento);
  assert.equal(salvo.proximaAcao, clienteExistente.proximaAcao);
  assert.equal(salvo.dataProximaAcao, clienteExistente.dataProximaAcao);
  assert.deepEqual(salvo.fiscal, clienteExistente.fiscal);
  assert.equal(Object.hasOwn(patch, "fiscal"), false);
  assert.equal(Object.hasOwn(patch, "tipo"), false);
});

test("outros segmentos continuam persistindo CRM e fiscal", () => {
  const fiscalCliente = { tipoPessoa: "fisica", cpf: "12345678900" };
  const dados = montarDadosClientePersistencia({
    form: formCompleto,
    fiscalCliente,
    isPrestacaoServicos: false,
    clienteExistente: { id: "cliente-1" },
  });

  assert.equal(dados.tipo, "Revendedor");
  assert.equal(dados.proximaAcao, "Retornar contato");
  assert.deepEqual(dados.fiscal, fiscalCliente);
});

test("dados necessários para o snapshot da Agenda permanecem no patch", () => {
  const dados = montarDadosClientePersistencia({
    form: formCompleto,
    isPrestacaoServicos: true,
    clienteExistente: { id: "cliente-1" },
  });

  assert.equal(dados.nome, "Cliente Teste");
  assert.equal(dados.telefone, "(11) 99999-0000");
  assert.equal(dados.email, "cliente@teste.com");
});

test("ClientesCRM aplica a apresentação simplificada somente em Gestão de Serviços", () => {
  const pagina = readFileSync(
    fileURLToPath(new URL("../../pages/ClientesCRM.jsx", import.meta.url)),
    "utf8",
  );

  for (const campo of ["Nome *", "Telefone", "E-mail", "Documento", "Cidade", "UF", "Endereço", "Observações"]) {
    assert.match(pagina, new RegExp(campo.replace("*", "\\*")));
  }
  assert.match(pagina, /!isPrestacaoServicos && <details className="crm-fiscal-details/);
  assert.match(pagina, /!isPrestacaoServicos && \(\s*<label>\s*Tipo/);
  assert.match(pagina, /!isPrestacaoServicos && podeUsarCRMFollowUp && \(\s*<label>\s*Relacionamento/);
  assert.match(pagina, /!isPrestacaoServicos && podeUsarCRMFollowUp && \(\s*<>\s*<label>\s*Próxima ação/);
  assert.match(pagina, /isPrestacaoServicos && <th>E-mail<\/th>/);
  assert.match(pagina, /isPrestacaoServicos\s*\? 6/);
});

test("alteração de status usa somente os campos canônicos sem apagar CRM ou fiscal", () => {
  const data = new Date("2026-09-25T12:00:00Z");
  const reativacao = montarAlteracaoStatusCliente(true, data);
  const desativacao = montarAlteracaoStatusCliente(false, data);

  assert.deepEqual(reativacao, {
    ativo: true,
    statusRelacionamento: "Ativo",
    updatedAt: data,
  });
  assert.deepEqual(desativacao, {
    ativo: false,
    statusRelacionamento: "Inativo",
    updatedAt: data,
  });
  for (const campo of ["fiscal", "tipo", "proximaAcao", "dataProximaAcao"]) {
    assert.equal(Object.hasOwn(reativacao, campo), false);
    assert.equal(Object.hasOwn(desativacao, campo), false);
  }
});

test("ClientesCRM aplica RBAC visual e mantém WhatsApp independente de escrita", () => {
  const pagina = readFileSync(
    fileURLToPath(new URL("../../pages/ClientesCRM.jsx", import.meta.url)),
    "utf8",
  );

  assert.match(pagina, /podeUsarCRMBasico && podeEscreverClientes/);
  assert.match(pagina, /podeEscreverClientes && \{\s*label: "Editar cliente"/);
  assert.match(pagina, /podeEscreverClientes && \{\s*label: cliente\.ativo === false/);
  assert.match(pagina, /podeUsarCRMWhatsapp && \{\s*label: "Chamar no WhatsApp"/);
  assert.match(pagina, /const podeExcluirClientes = false;/);
  assert.match(pagina, /podeExcluirClientes && \{\s*label: "Excluir cliente"/);
});
