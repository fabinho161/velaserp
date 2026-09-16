import assert from "node:assert/strict";
import test from "node:test";

import { criarFaturamentoVenda, INDICADORES_IE_DESTINATARIO } from "../faturamento.js";
import {
  TIPOS_PESSOA_FISCAL,
  criarFiscalDestinatarioSnapshot,
  prepararFiscalCliente,
} from "../fiscalCliente.js";
import { criarDestinatarioSnapshotVenda } from "../fiscalVenda.js";

test("cliente legado e Consumidor Final nao ganham identidade fiscal por inferencia", () => {
  assert.equal(prepararFiscalCliente(), null);
  assert.equal(criarFiscalDestinatarioSnapshot({ documento: "12345678900" }), null);
  const legado = criarDestinatarioSnapshotVenda({ cliente: { nome: "Legado", documento: "12345678900" } });
  assert.equal(legado.documento, "12345678900");
  assert.equal(Object.hasOwn(legado, "tipoPessoa"), false);
  const consumidor = criarDestinatarioSnapshotVenda({ nome: "Consumidor Final" });
  assert.equal(consumidor.nome, "Consumidor Final");
  assert.equal(Object.hasOwn(consumidor, "cpf"), false);
  assert.equal(Object.hasOwn(consumidor, "consumidorFinal"), false);
});

test("CPF e CNPJ sao strings explicitas e mascara e removida sem tipagem por documento", () => {
  const fisica = prepararFiscalCliente({ tipoPessoa: TIPOS_PESSOA_FISCAL.FISICA, cpf: "012.345.678-90" });
  const juridica = prepararFiscalCliente({ tipoPessoa: TIPOS_PESSOA_FISCAL.JURIDICA, cnpj: "01.234.567/0001-89" });
  assert.equal(fisica.cpf, "01234567890");
  assert.equal(juridica.cnpj, "01234567000189");
  assert.equal(typeof fisica.cpf, "string");
  assert.equal(typeof juridica.cnpj, "string");
  assert.equal(fisica.cnpj, "");
  assert.equal(juridica.cpf, "");
  assert.throws(() => prepararFiscalCliente({ cpf: "01234567890" }), /tipo de pessoa/);
  assert.throws(() => prepararFiscalCliente({ tipoPessoa: TIPOS_PESSOA_FISCAL.FISICA, cnpj: "01234567000189" }), /CNPJ/);
  assert.throws(() => prepararFiscalCliente({ tipoPessoa: TIPOS_PESSOA_FISCAL.JURIDICA, cpf: "01234567890" }), /CPF/);
  assert.throws(() => prepararFiscalCliente({ tipoPessoa: TIPOS_PESSOA_FISCAL.FISICA, cpf: "123" }), /11 dígitos/);
});

test("exterior nao exige identidade brasileira nem UF ou municipio brasileiros", () => {
  const fiscal = prepararFiscalCliente({
    tipoPessoa: TIPOS_PESSOA_FISCAL.EXTERIOR,
    enderecoFiscal: { paisCodigo: "0001", paisNome: "Outro país" },
  });
  assert.equal(fiscal.tipoPessoa, "exterior");
  assert.equal(fiscal.cpf, "");
  assert.equal(fiscal.cnpj, "");
  assert.equal(fiscal.enderecoFiscal.paisCodigo, "0001");
  assert.throws(() => prepararFiscalCliente({ tipoPessoa: TIPOS_PESSOA_FISCAL.EXTERIOR, cpf: "01234567890" }), /exterior/);
  assert.equal(prepararFiscalCliente({ inscricaoEstadual: "123" }).tipoPessoa, null);
  const snapshot = criarFiscalDestinatarioSnapshot({
    uf: "Exterior", cidade: "Lisboa",
    fiscal: { ...fiscal, enderecoFiscal: { ...fiscal.enderecoFiscal, municipioCodigo: "123" } },
  });
  assert.equal(snapshot.enderecoFiscal.uf, "");
  assert.equal(snapshot.enderecoFiscal.municipioCodigo, "");
});

test("IE e indicador cadastral permanecem independentes e usam enum existente", () => {
  const comIE = prepararFiscalCliente({ inscricaoEstadual: "ISENTO" });
  const semIE = prepararFiscalCliente({ indicadorIECadastral: INDICADORES_IE_DESTINATARIO.NAO_CONTRIBUINTE });
  assert.equal(comIE.indicadorIECadastral, null);
  assert.equal(semIE.inscricaoEstadual, "");
  assert.equal(semIE.indicadorIECadastral, "nao_contribuinte");
  assert.throws(() => prepararFiscalCliente({ indicadorIECadastral: "outro" }), /situação/);
});

test("localizacao fiscal so usa valores informados e codigo municipal continua string", () => {
  const fiscal = prepararFiscalCliente({
    enderecoFiscal: { paisNome: "Brasil", municipioCodigo: "05208707" },
  }, { uf: "GO" });
  assert.equal(fiscal.enderecoFiscal.municipioCodigo, "05208707");
  const snapshot = criarFiscalDestinatarioSnapshot({
    cidade: "Itumbiara", uf: "GO", fiscal,
  });
  assert.deepEqual(snapshot.enderecoFiscal, {
    paisCodigo: "",
    paisNome: "Brasil",
    uf: "GO",
    municipioCodigo: "05208707",
    municipioNome: "Itumbiara",
  });
  assert.throws(() => prepararFiscalCliente({ enderecoFiscal: { municipioCodigo: "ABC" } }), /dígitos/);
  assert.throws(() => prepararFiscalCliente({}, { uf: "Goias" }), /UF/);
});

test("snapshot novo congela dados estruturados sem afetar cliente, venda ou contexto operacional", () => {
  const cliente = {
    id: "cliente-1", nome: "Cliente", documento: "legado", cidade: "Cidade A", uf: "SP",
    fiscal: prepararFiscalCliente({
      tipoPessoa: TIPOS_PESSOA_FISCAL.JURIDICA,
      cnpj: "01.234.567/0001-89",
      inscricaoEstadual: "123",
      indicadorIECadastral: INDICADORES_IE_DESTINATARIO.CONTRIBUINTE,
      enderecoFiscal: { paisNome: "Brasil", municipioCodigo: "0001234" },
    }),
  };
  const snapshot = criarDestinatarioSnapshotVenda({ cliente });
  assert.equal(snapshot.versao, 1);
  assert.equal(snapshot.documento, "legado");
  assert.equal(snapshot.cnpj, "01234567000189");
  assert.equal(snapshot.indicadorIECadastral, "contribuinte");
  assert.equal(Object.hasOwn(snapshot, "indicadorIEDestinatario"), false);
  assert.equal(Object.hasOwn(snapshot, "consumidorFinal"), false);
  assert.equal(Object.isFrozen(snapshot.enderecoFiscal), true);
  cliente.fiscal.cnpj = "999";
  cliente.cidade = "Cidade B";
  assert.equal(snapshot.cnpj, "01234567000189");
  assert.equal(snapshot.enderecoFiscal.municipioNome, "Cidade A");
});

test("faturamento transporta o snapshot estruturado historico sem consultar cadastro", () => {
  const cliente = {
    id: "cliente-1", nome: "Cliente", uf: "SP", cidade: "Cidade A",
    fiscal: prepararFiscalCliente({
      tipoPessoa: TIPOS_PESSOA_FISCAL.JURIDICA,
      cnpj: "01.234.567/0001-89",
      indicadorIECadastral: INDICADORES_IE_DESTINATARIO.CONTRIBUINTE,
    }),
  };
  const destinatarioSnapshot = criarDestinatarioSnapshotVenda({ cliente });
  const faturamento = criarFaturamentoVenda({
    venda: {
      id: "venda-1", clienteId: cliente.id, clienteNome: cliente.nome,
      destinatarioSnapshot,
      itens: [{ produtoId: "produto-1", quantidade: 1, valorUnitario: 10, subtotal: 10 }],
      total: 10,
    },
    segmento: "comercio",
  });
  assert.deepEqual(faturamento.contextoFiscal.destinatario, destinatarioSnapshot);
  assert.notEqual(faturamento.contextoFiscal.destinatario, destinatarioSnapshot);
  cliente.fiscal.cnpj = "999";
  assert.equal(faturamento.contextoFiscal.destinatario.cnpj, "01234567000189");
  assert.equal(Object.hasOwn(faturamento.contextoFiscal.operacao, "consumidorFinal"), false);
  assert.equal(Object.hasOwn(faturamento.contextoFiscal.operacao, "indicadorIEDestinatario"), false);
});
