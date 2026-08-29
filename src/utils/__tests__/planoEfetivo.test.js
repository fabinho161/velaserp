import assert from "node:assert/strict";
import test from "node:test";

import { resolverPlanoEfetivo } from "../planoEfetivo.js";

test("owner usa planoEspelho da empresa quando disponivel", () => {
  const resultado = resolverPlanoEfetivo({
    assinaturaUsuario: { plano: "gratis", status: "active" },
    empresaAtual: {
      id: "empresa-1",
      planoEspelho: {
        plano: "profissional",
        status: "active",
        limiteUsuariosManual: 12,
      },
    },
  });

  assert.equal(resultado.fonte, "planoEspelho");
  assert.equal(resultado.assinatura.plano, "profissional");
  assert.equal(resultado.assinatura.status, "active");
  assert.equal(resultado.assinatura.limiteUsuariosManual, 12);
  assert.equal(resultado.assinaturaCarregando, false);
});

test("convidado ativo usa planoEspelho da empresa e ignora assinatura pessoal", () => {
  const resultado = resolverPlanoEfetivo({
    assinaturaUsuario: { plano: "gratis", status: "inactive" },
    empresaAtual: {
      id: "empresa-1",
      planoEspelho: { plano: "premium", status: "active" },
    },
    usuarioConvidadoEmpresa: true,
    usuarioEmpresaAtual: { status: "ativo" },
  });

  assert.equal(resultado.fonte, "planoEspelho");
  assert.equal(resultado.assinatura.plano, "premium");
  assert.equal(resultado.assinatura.status, "active");
});

test("convidado carregando empresa nao assume plano gratis como estado final", () => {
  const resultado = resolverPlanoEfetivo({
    usuarioConvidadoEmpresa: true,
    usuariosEmpresaCarregando: true,
    empresaAtual: null,
  });

  assert.equal(resultado.fonte, "semVinculoAtivo");
  assert.equal(resultado.assinatura.plano, "gratis");
  assert.equal(resultado.assinatura.status, "inactive");
  assert.equal(resultado.assinaturaCarregando, true);
});

test("convidado ativo aguarda documento da empresa antes do fallback final", () => {
  const resultado = resolverPlanoEfetivo({
    usuarioConvidadoEmpresa: true,
    usuarioEmpresaAtual: { status: "ativo" },
    empresaAtual: null,
  });

  assert.equal(resultado.fonte, "empresaSemPlanoEspelho");
  assert.equal(resultado.assinatura.plano, "gratis");
  assert.equal(resultado.assinatura.status, "inactive");
  assert.equal(resultado.assinaturaCarregando, true);
});

test("convidado sem vinculo ativo nao usa planoEspelho local", () => {
  const resultado = resolverPlanoEfetivo({
    usuarioConvidadoEmpresa: true,
    usuarioEmpresaAtual: null,
    usuariosEmpresaCarregando: false,
    empresaAtual: {
      id: "empresa-1",
      planoEspelho: { plano: "premium", status: "active" },
    },
  });

  assert.equal(resultado.fonte, "semVinculoAtivo");
  assert.equal(resultado.assinatura.plano, "gratis");
  assert.equal(resultado.assinatura.status, "inactive");
  assert.equal(resultado.assinaturaCarregando, false);
});

test("convidado inativo nao recebe recursos do planoEspelho", () => {
  const resultado = resolverPlanoEfetivo({
    usuarioConvidadoEmpresa: true,
    usuarioEmpresaAtual: { status: "inativo" },
    empresaAtual: {
      id: "empresa-1",
      planoEspelho: { plano: "premium", status: "active" },
    },
  });

  assert.equal(resultado.fonte, "vinculoInativo");
  assert.equal(resultado.assinatura.plano, "gratis");
  assert.equal(resultado.assinatura.status, "inactive");
  assert.equal(resultado.assinaturaCarregando, false);
});

test("owner sem planoEspelho usa assinatura canonica do usuario", () => {
  const resultado = resolverPlanoEfetivo({
    assinaturaUsuario: {
      plano: "basico",
      status: "active",
      limiteUsuariosManual: 5,
    },
    empresaAtual: { id: "empresa-1" },
  });

  assert.equal(resultado.fonte, "assinaturaOwner");
  assert.equal(resultado.assinatura.plano, "basico");
  assert.equal(resultado.assinatura.status, "active");
  assert.equal(resultado.assinatura.limiteUsuariosManual, 5);
});

test("planoEspelho invalido cai para gratis inativo com seguranca", () => {
  const resultado = resolverPlanoEfetivo({
    empresaAtual: {
      id: "empresa-1",
      planoEspelho: {
        plano: "enterprise",
        status: "trial",
        limiteUsuariosManual: -3,
      },
    },
  });

  assert.equal(resultado.assinatura.plano, "gratis");
  assert.equal(resultado.assinatura.status, "inactive");
  assert.equal(resultado.assinatura.limiteUsuariosManual, null);
});
