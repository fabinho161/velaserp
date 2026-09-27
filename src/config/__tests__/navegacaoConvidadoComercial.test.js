import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  normalizarRoleEmpresa,
  temPermissaoEmpresa,
} from "../perfisEmpresa.js";
import { getPlanoConfig } from "../planos.js";
import { segmentoPossuiModulo } from "../segmentosEmpresa.js";
import { resolverPlanoEfetivo } from "../../utils/planoEfetivo.js";

const require = createRequire(import.meta.url);
const { normalizarRoleEmpresa: normalizarRoleBackend } = require(
  "../../../backend/src/utils/perfisEmpresa.js"
);

const resolverAcessoClientes = ({
  role = "comercial",
  statusVinculo = "ativo",
  planoConvidada = "gratis",
  statusPlano = "active",
  assinaturaPessoal = { plano: "premium", status: "active" },
  convidado = true,
} = {}) => {
  const usuarioEmpresaAtual = {
    uidAuth: "convidado-uid",
    role,
    status: statusVinculo,
  };
  const empresaAtual = {
    id: convidado ? "empresa-convidada" : "empresa-propria",
    ownerUid: convidado ? "owner-uid" : "convidado-uid",
    segmento: "clientes",
    planoEspelho: {
      plano: planoConvidada,
      status: statusPlano,
    },
  };
  const perfilEmpresaAtual = normalizarRoleEmpresa(usuarioEmpresaAtual);
  const planoEfetivo = resolverPlanoEfetivo({
    assinaturaUsuario: assinaturaPessoal,
    empresaAtual,
    usuarioConvidadoEmpresa: convidado,
    usuarioEmpresaAtual,
  });
  const assinaturaAtiva = planoEfetivo.assinatura.status === "active";
  const podeUsarClientesOperacionais =
    assinaturaAtiva &&
    Boolean(getPlanoConfig(planoEfetivo.assinatura.plano).clientesOperacionais);
  const podeUsarCrm = temPermissaoEmpresa(perfilEmpresaAtual, "crm");
  const segmentoCompativel = segmentoPossuiModulo(empresaAtual.segmento, "clientes");

  return {
    empresaAtual,
    usuarioEmpresaAtual,
    perfilEmpresaAtual,
    planoEfetivo,
    assinaturaAtiva,
    podeUsarClientesOperacionais,
    podeUsarCrm,
    clientesPermitido:
      segmentoCompativel && podeUsarCrm && podeUsarClientesOperacionais,
  };
};

test("convidado comercial ativo usa planoEspelho e pode acessar Clientes", () => {
  const acesso = resolverAcessoClientes();

  assert.equal(acesso.empresaAtual.ownerUid, "owner-uid");
  assert.equal(acesso.usuarioEmpresaAtual.status, "ativo");
  assert.equal(acesso.perfilEmpresaAtual, "comercial");
  assert.equal(acesso.planoEfetivo.fonte, "planoEspelho");
  assert.equal(acesso.assinaturaAtiva, true);
  assert.equal(acesso.podeUsarClientesOperacionais, true);
  assert.equal(acesso.podeUsarCrm, true);
  assert.equal(acesso.clientesPermitido, true);
});

test("label Comercial aceito na entrada e persistido como role canonico", () => {
  const rolePersistido = normalizarRoleBackend("Comercial");
  const acesso = resolverAcessoClientes({ role: rolePersistido });

  assert.equal(rolePersistido, "comercial");
  assert.equal(acesso.perfilEmpresaAtual, "comercial");
  assert.equal(acesso.podeUsarCrm, true);
  assert.equal(acesso.clientesPermitido, true);
});

test("role desconhecido preserva fallback seguro sem permissao CRM", () => {
  const acesso = resolverAcessoClientes({ role: "role_desconhecido" });

  assert.equal(acesso.perfilEmpresaAtual, "visualizacao");
  assert.equal(acesso.podeUsarCrm, false);
});

test("vinculo inativo ou removido bloqueia Clientes", () => {
  for (const statusVinculo of ["inativo", "removido"]) {
    const acesso = resolverAcessoClientes({ statusVinculo });
    assert.equal(acesso.planoEfetivo.assinatura.status, "inactive");
    assert.equal(acesso.podeUsarClientesOperacionais, false);
    assert.equal(acesso.clientesPermitido, false);
  }
});

test("planoEspelho inativo bloqueia clientesOperacionais", () => {
  const acesso = resolverAcessoClientes({ statusPlano: "inactive" });

  assert.equal(acesso.planoEfetivo.fonte, "planoEspelho");
  assert.equal(acesso.podeUsarClientesOperacionais, false);
  assert.equal(acesso.clientesPermitido, false);
});

test("assinatura Premium pessoal nao substitui plano da empresa convidada", () => {
  const acesso = resolverAcessoClientes({
    planoConvidada: "basico",
    assinaturaPessoal: { plano: "premium", status: "active" },
  });

  assert.equal(acesso.planoEfetivo.fonte, "planoEspelho");
  assert.equal(acesso.planoEfetivo.assinatura.plano, "basico");
});

test("empresa propria continua usando assinatura pessoal sem planoEspelho", () => {
  const usuarioEmpresaAtual = { role: "administrador_empresa", status: "ativo" };
  const planoEfetivo = resolverPlanoEfetivo({
    assinaturaUsuario: { plano: "premium", status: "active" },
    empresaAtual: { id: "empresa-propria", segmento: "clientes" },
    usuarioConvidadoEmpresa: false,
    usuarioEmpresaAtual,
  });

  assert.equal(planoEfetivo.fonte, "assinaturaOwner");
  assert.equal(planoEfetivo.assinatura.plano, "premium");
  assert.equal(normalizarRoleEmpresa(usuarioEmpresaAtual), "administrador_empresa");
});
