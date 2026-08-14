const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calcularVagasOcupadas,
  montarPayloadControleUsuarios,
  normalizarEmail,
  obterControleUsuariosEmpresaRef,
  resolverLimiteUsuariosEmpresa,
  validarOperacaoLimiteUsuarios,
  validarSegmentoFirestore,
} = require("../limiteUsuariosEmpresa");

const agora = new Date("2026-08-13T12:00:00.000Z");
const futuro = new Date("2026-08-20T12:00:00.000Z");
const passado = new Date("2026-08-01T12:00:00.000Z");
const timestampFirestore = (data) => ({
  toDate: () => data,
});

test("normaliza email sem alterar origem", () => {
  const original = "  Pessoa@Exemplo.COM  ";

  assert.equal(normalizarEmail(original), "pessoa@exemplo.com");
  assert.equal(original, "  Pessoa@Exemplo.COM  ");
  assert.equal(normalizarEmail(null), "");
  assert.equal(normalizarEmail(123), "");
});

test("owner sem documento em usuariosEmpresa conta uma vaga", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 1);
  assert.equal(resultado.membrosConsiderados[0].origem, "owner_implicito");
});

test("owner presente em usuariosEmpresa nao conta duas vezes", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [{
      id: "owner-1",
      uidAuth: "owner-1",
      email: "owner@erp.com",
      status: "ativo",
      dono: true,
    }],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 1);
  assert.equal(resultado.registrosIgnorados[0].motivo, "owner_ja_contado");
});

test("owner duplicado por uidAuth em outro documento nao conta duas vezes", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [{
      id: "doc-owner-legado",
      uidAuth: "owner-1",
      email: "owner@erp.com",
      status: "ativo",
      dono: true,
    }],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 1);
  assert.equal(resultado.registrosIgnorados[0].motivo, "owner_ja_contado");
});

test("owner pode ser reconhecido por email canonico confiavel quando nao ha uidAuth", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    ownerEmail: " Owner@ERP.com ",
    usuariosEmpresa: [{
      id: "owner-email-legado",
      email: "owner@erp.com",
      status: "ativo",
      dono: true,
    }],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 1);
  assert.equal(resultado.registrosIgnorados[0].motivo, "owner_ja_contado");
});

test("email do owner com uidAuth divergente nao e tratado como owner", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    ownerEmail: "owner@erp.com",
    usuariosEmpresa: [{
      id: "conflito",
      uidAuth: "outro-uid",
      email: "owner@erp.com",
      status: "ativo",
    }],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.inconsistencias[0].tipo, "email_owner_com_uid_divergente");
});

test("ativo conta, inativo e removido nao contam", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [
      { id: "u1", uidAuth: "u1", status: "ativo" },
      { id: "u2", uidAuth: "u2", status: "inativo" },
      { id: "u3", uidAuth: "u3", status: "removido" },
    ],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.registrosIgnorados.length, 2);
});

test("deduplicacao transitiva por uid e email conecta o mesmo grupo", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [
      { id: "a", uidAuth: "UID1", email: "a@teste.com", status: "ativo" },
      { id: "b", uidAuth: "UID1", email: "b@teste.com", status: "inativo" },
      { id: "c", uidAuth: "UID2", email: " b@teste.com ", status: "pendente", convitePendente: true },
    ],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.duplicidadesDetectadas.length, 1);
  assert.deepEqual(
    resultado.duplicidadesDetectadas[0].usuarioEmpresaIds.sort(),
    ["a", "b", "c"]
  );
});

test("documentos sem uid e email com ids diferentes nao sao deduplicados", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [
      { id: "sem-1", status: "ativo" },
      { id: "sem-2", status: "ativo" },
    ],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 3);
  assert.equal(resultado.duplicidadesDetectadas.length, 0);
});

test("pendente reservado conta e pendente expirado nao conta", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [
      {
        id: "p1",
        email: "novo@erp.com",
        status: "pendente",
        convitePendente: true,
        conviteToken: "token-1",
        conviteExpiraEm: futuro,
        vagaReservada: true,
      },
      {
        id: "p2",
        email: "expirado@erp.com",
        status: "pendente",
        convitePendente: true,
        conviteToken: "token-2",
        conviteExpiraEm: passado,
      },
    ],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.registrosIgnorados[0].motivo, "pendente_expirado");
});

test("pendente com Timestamp equivalente do Firestore interpreta expiracao", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [{
      id: "p1",
      email: "timestamp@erp.com",
      status: "pendente",
      convitePendente: true,
      conviteToken: "token-1",
      conviteExpiraEm: timestampFirestore(futuro),
    }],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
});

test("pendente com data invalida nao libera vaga silenciosamente", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [{
      id: "p1",
      email: "invalido@erp.com",
      status: "pendente",
      convitePendente: true,
      conviteToken: "token-1",
      conviteExpiraEm: "data-invalida",
    }],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(
    resultado.inconsistencias.some(
      (item) => item.tipo === "convite_expiracao_invalida"
    ),
    true
  );
});

test("pendente sem data de expiracao nao desaparece da contagem", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [{
      id: "p1",
      email: "sem-data@erp.com",
      status: "pendente",
      convitePendente: true,
      conviteToken: "token-1",
    }],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(
    resultado.inconsistencias.some(
      (item) => item.tipo === "pendente_sem_data_expiracao"
    ),
    true
  );
});

test("pendente legado conta, mas aparece nas inconsistencias", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [{
      id: "p1",
      email: "legado@erp.com",
      status: "pendente",
      convitePendente: true,
      conviteToken: "token-1",
      conviteExpiraEm: futuro,
    }],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.membrosConsiderados[1].tipoReserva, "legado_sem_marca");
  assert.equal(resultado.inconsistencias[0].tipo, "pendente_legado_sem_vagaReservada");
});

test("duplicidade por UID conta uma vez", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [
      { id: "a", uidAuth: "uid-1", email: "a@erp.com", status: "ativo" },
      { id: "b", uidAuth: "uid-1", email: "b@erp.com", status: "ativo" },
    ],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.duplicidadesDetectadas.length, 1);
});

test("duplicidade por email com caixa e espacos conta uma vez", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [
      { id: "a", email: " Pessoa@ERP.com ", status: "ativo" },
      { id: "b", email: "pessoa@erp.COM", status: "ativo" },
    ],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.duplicidadesDetectadas.length, 1);
});

test("duplicidade com status conflitantes usa resultado conservador", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [
      { id: "a", email: "pessoa@erp.com", status: "removido" },
      { id: "b", email: "pessoa@erp.com", status: "pendente", convitePendente: true },
      { id: "c", email: "pessoa@erp.com", status: "inativo" },
    ],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.duplicidadesDetectadas[0].statusConsiderado, "pendente");
});

test("membro sem UID e sem email usa fallback deterministico por documento", () => {
  const resultado = calcularVagasOcupadas({
    ownerUid: "owner-1",
    usuariosEmpresa: [
      { id: "sem-identidade", status: "ativo" },
    ],
    agora,
  });

  assert.equal(resultado.quantidadeOcupada, 2);
  assert.equal(resultado.membrosConsiderados[1].identidade, "doc:sem-identidade");
});

test("plano valido resolve limite correto", () => {
  const resultado = resolverLimiteUsuariosEmpresa({
    empresa: {
      planoEspelho: {
        plano: "profissional",
        status: "active",
      },
    },
  });

  assert.equal(resultado.plano, "profissional");
  assert.equal(resultado.limite, 8);
  assert.equal(resultado.fonteLimite, "planoEspelho");
});

test("plano desconhecido usa fallback seguro quando ambas as fontes sao invalidas", () => {
  const resultado = resolverLimiteUsuariosEmpresa({
    empresa: {
      planoEspelho: {
        plano: "enterprise",
        status: "active",
      },
    },
    assinaturaOwner: {
      plano: "inexistente",
      status: "active",
    },
  });

  assert.equal(resultado.plano, "gratis");
  assert.equal(resultado.limite, 1);
  assert.equal(resultado.fonteLimite, "fallback");
});

test("planoEspelho invalido cai para assinatura valida", () => {
  const resultado = resolverLimiteUsuariosEmpresa({
    empresa: {
      planoEspelho: {
        plano: "premium",
        status: "desconhecido",
      },
    },
    assinaturaOwner: {
      plano: "basico",
      status: "active",
    },
  });

  assert.equal(resultado.plano, "basico");
  assert.equal(resultado.limite, 3);
  assert.equal(resultado.fonteLimite, "assinaturaOwner");
});

test("limite manual valido e considerado; inexistente nao e presumido", () => {
  const semManual = resolverLimiteUsuariosEmpresa({
    empresa: {
      planoEspelho: {
        plano: "basico",
        status: "active",
      },
    },
  });
  const comManual = resolverLimiteUsuariosEmpresa({
    empresa: {
      planoEspelho: {
        plano: "basico",
        status: "active",
        limiteUsuariosManual: 10,
      },
    },
  });

  assert.equal(semManual.limite, 3);
  assert.equal(semManual.limiteUsuariosManual, null);
  assert.equal(comManual.limite, 10);
});

test("limite manual invalido ou excessivo e rejeitado", () => {
  const resultado = resolverLimiteUsuariosEmpresa({
    empresa: {
      planoEspelho: {
        plano: "premium",
        status: "active",
        limiteUsuariosManual: 100000,
      },
    },
  });

  assert.equal(resultado.limite, 25);
  assert.equal(resultado.inconsistencias[0].tipo, "limiteUsuariosManual_invalido_ignorado");
});

test("limite manual zero, negativo, textual e decimal sao ignorados", () => {
  [0, -1, "10", 2.5].forEach((limiteUsuariosManual) => {
    const resultado = resolverLimiteUsuariosEmpresa({
      empresa: {
        planoEspelho: {
          plano: "premium",
          status: "active",
          limiteUsuariosManual,
        },
      },
    });

    assert.equal(resultado.limite, 25);
    assert.equal(
      resultado.inconsistencias.some(
        (item) => item.tipo === "limiteUsuariosManual_invalido_ignorado"
      ),
      true
    );
  });
});

test("plano com status nao ativo aplica fallback seguro gratis", () => {
  ["inactive", "blocked"].forEach((status) => {
    const resultado = resolverLimiteUsuariosEmpresa({
      empresa: {
        planoEspelho: {
          plano: "premium",
          status,
        },
      },
    });

    assert.equal(resultado.limite, 1);
    assert.equal(resultado.plano, "premium");
    assert.equal(resultado.fonteLimite, "planoEspelho");
  });
});

test("status cancelado ou desconhecido cai para fallback quando assinatura tambem invalida", () => {
  const resultado = resolverLimiteUsuariosEmpresa({
    empresa: {
      planoEspelho: {
        plano: "premium",
        status: "cancelado",
      },
    },
    assinaturaOwner: {
      plano: "premium",
      status: "desconhecido",
    },
  });

  assert.equal(resultado.plano, "gratis");
  assert.equal(resultado.limite, 1);
  assert.equal(resultado.fonteLimite, "fallback");
});

test("entradas invalidas de ownerUid e empresaId sao rejeitadas", () => {
  assert.throws(() => validarSegmentoFirestore("ownerUid", ""), /ownerUid invalido/);
  assert.throws(() => validarSegmentoFirestore("empresaId", "a/b"), /empresaId invalido/);
});

test("obtem referencia do controle sem escrever", () => {
  const segmentos = [];
  const db = {
    collection(nome) {
      segmentos.push(["collection", nome]);
      return this;
    },
    doc(nome) {
      segmentos.push(["doc", nome]);
      return this;
    },
  };

  const ref = obterControleUsuariosEmpresaRef({
    db,
    ownerUid: "owner-1",
    empresaId: "empresa-1",
  });

  assert.equal(ref, db);
  assert.deepEqual(segmentos, [
    ["collection", "users"],
    ["doc", "owner-1"],
    ["collection", "empresas"],
    ["doc", "empresa-1"],
    ["collection", "controles"],
    ["doc", "usuarios"],
  ]);
});

test("monta payload de controle", () => {
  const payload = montarPayloadControleUsuarios({
    quantidadeVagasOcupadas: 2,
    limiteAplicado: 3,
    plano: "basico",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    ultimaOperacao: "convite.criar",
    ultimoAtorUid: "ator-1",
    atualizadoEm: "timestamp",
  });

  assert.deepEqual(payload, {
    quantidadeVagasOcupadas: 2,
    limiteAplicado: 3,
    plano: "basico",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    atualizadoEm: "timestamp",
    versao: 1,
    ultimaOperacao: "convite.criar",
    ultimoAtorUid: "ator-1",
  });
});

test("operacao acima do limite e negada", () => {
  const resultado = validarOperacaoLimiteUsuarios({
    quantidadeAtual: 3,
    limite: 3,
    deltaVagas: 1,
  });

  assert.equal(resultado.permitido, false);
  assert.equal(resultado.motivo, "limite_usuarios_atingido");
});

test("empresa acima do limite pode executar operacao que nao aumenta vagas", () => {
  const resultado = validarOperacaoLimiteUsuarios({
    quantidadeAtual: 5,
    limite: 3,
    deltaVagas: 0,
  });

  assert.equal(resultado.permitido, true);
});

test("operacao que libera vaga e permitida mesmo acima do limite", () => {
  const resultado = validarOperacaoLimiteUsuarios({
    quantidadeAtual: 5,
    limite: 3,
    deltaVagas: -1,
  });

  assert.equal(resultado.permitido, true);
  assert.equal(resultado.quantidadeProjetada, 4);
});

test("delta invalido, decimal ou nao numerico e rejeitado", () => {
  [0.5, "1", null].forEach((deltaVagas) => {
    assert.throws(
      () => validarOperacaoLimiteUsuarios({
        quantidadeAtual: 1,
        limite: 3,
        deltaVagas,
      }),
      /deltaVagas invalido/
    );
  });
});

test("reativacao acima do limite e negada", () => {
  const resultado = validarOperacaoLimiteUsuarios({
    quantidadeAtual: 1,
    limite: 1,
    deltaVagas: 1,
  });

  assert.equal(resultado.permitido, false);
});
