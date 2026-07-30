# Documento 1 - Arquitetura

Este documento descreve a organizacao atual do Renovar ERP, com foco no front-end React, no fluxo da aplicacao, nas rotas, nos contextos, nos hooks e nos componentes de base.

## Visao geral

O projeto principal fica em `velaserp/` e usa:

- React com Vite para o front-end.
- React Router para navegacao.
- Firebase Auth para autenticacao.
- Firestore para dados operacionais em tempo real.
- Firebase Storage para arquivos.
- Node/Express em `backend/` para integracoes sensiveis, como Mercado Pago, convites por email e rotas administrativas.
- Firebase Functions em `functions/` para automacoes em nuvem.

O front-end e uma SPA. Depois do login, a aplicacao carrega o contexto operacional da empresa ativa, escuta colecoes do Firestore com `onSnapshot` e libera telas conforme permissao da empresa e plano contratado.

## Estrutura de pastas

```txt
velaserp/
  backend/
    src/
      middlewares/
      routes/
      services/
      utils/
      firebaseAdmin.js
      mercadoPago.js
      server.js
    README.md
    package.json

  functions/
    src/
      index.js
    README.md
    package.json

  public/
    favicon.svg
    favicon.png
    icons.svg

  src/
    assets/
    components/
    config/
    context/
    data/
    hooks/
    pages/
    utils/
    App.jsx
    App.css
    firebase.js
    index.css
    main.jsx

  firestore.rules
  firebase.json
  index.html
  package.json
  vite.config.js
```

### Responsabilidades principais

- `src/pages/`: telas de negocio, como Dashboard, Producao, Estoque, Vendas, Financeiro, Relatorios e Administracao.
- `src/components/`: componentes reutilizaveis e wrappers de rota, como Sidebar, AdminRoute, PlanoRoute e EmpresaPermissionRoute.
- `src/context/`: providers e hooks de acesso a estado global.
- `src/hooks/`: regras reutilizaveis de UI e dominio.
- `src/config/`: configuracoes de planos e perfis/permissoes da empresa.
- `src/utils/`: formatadores, ordenacao e calculos auxiliares.
- `backend/src/routes/`: endpoints HTTP do backend Express.
- `backend/src/services/`: servicos de integracao, hoje focados em envio de convites por email.
- `backend/src/utils/`: funcoes compartilhadas pelo backend, incluindo planos, datas e auditoria.

## Arquitetura React

### Entrada da aplicacao

O ponto de entrada e `src/main.jsx`.

Ele renderiza `App` dentro de:

- `React.StrictMode`
- `ToastProvider`
- `ConfirmProvider`

Esses providers ficam acima de toda a aplicacao para permitir notificacoes e confirmacoes globais em qualquer tela.

### Raiz e autenticacao

`src/App.jsx` controla o primeiro corte da aplicacao:

1. Observa o estado de autenticacao com `onAuthStateChanged(auth, ...)`.
2. Enquanto o Firebase Auth ainda esta carregando, mostra `Carregando...`.
3. Mantem a rota publica `/aceitar-convite/:token`.
4. Para qualquer outra rota:
   - se existe usuario autenticado, renderiza `ERPProvider` e `AuthenticatedApp`;
   - se nao existe usuario autenticado, renderiza `Login`.

`AuthenticatedApp` monta o layout principal:

- `Sidebar` como navegacao lateral.
- `main.app-main` como area de conteudo.
- `Routes` com as telas internas.

### Estado global de ERP

`ERPProvider` e o centro do estado de negocio do front-end.

Ele concentra:

- usuario autenticado;
- perfil global do usuario;
- assinatura/plano;
- empresa ativa;
- owner da empresa ativa;
- lista de empresas;
- usuarios da empresa;
- permissoes do usuario na empresa atual;
- colecoes operacionais em tempo real;
- configuracoes e white label;
- funcoes genericas de CRUD;
- funcoes especificas para usuarios da empresa e convites.

As paginas consomem esse estado atraves de `useERP()`.

## Fluxo da aplicacao

### 1. Inicializacao

O navegador carrega `index.html`, o Vite executa `src/main.jsx` e React monta a aplicacao.

### 2. Providers globais

`ToastProvider` e `ConfirmProvider` sao criados antes de `App`, permitindo que telas e componentes usem:

- `useToast()` para mensagens globais.
- `useConfirmacao()` para dialogs globais de confirmacao.

### 3. Autenticacao

`App` consulta o Firebase Auth.

- Usuario indefinido: mostra loading inicial.
- Usuario nulo: mostra `Login`.
- Usuario autenticado: entra no fluxo privado com `ERPProvider`.

### 4. Preparacao do usuario

Dentro de `ERPProvider`, quando o usuario autentica:

- cria ou atualiza `users/{uid}`;
- garante dados basicos de assinatura quando aplicavel;
- carrega empresas proprias e vinculos por convite;
- cria uma empresa padrao quando o usuario ainda nao possui empresa nem vinculo;
- seleciona a empresa ativa salva no `localStorage` ou a primeira disponivel.

### 5. Carregamento da empresa ativa

Com usuario e empresa ativa definidos, o provider:

- escuta `usuariosEmpresa`;
- identifica o usuario atual dentro da empresa;
- calcula perfil e permissoes;
- abre listeners em tempo real para as colecoes permitidas;
- carrega configuracoes;
- aplica tema e white label no `document.documentElement`.

### 6. Navegacao e acesso

Cada rota interna pode passar por dois tipos de guarda:

- `EmpresaPermissionRoute`: valida permissao do usuario na empresa ativa.
- `PlanoRoute`: valida se o plano libera o modulo.

Rotas administrativas usam `AdminRoute`, que exige `isAdminMaster`.

### 7. Operacoes de dados

As paginas usam `addItem`, `updateItem` e `deleteItem` do `ERPProvider` para colecoes padrao. As referencias sao montadas no caminho:

```txt
users/{empresaOwnerUid || user.uid}/empresas/{empresaId}/{colecao}
```

Isso permite operar tanto empresas proprias quanto empresas acessadas por convite.

## Rotas

### Rotas publicas

| Caminho | Tela | Observacao |
| --- | --- | --- |
| `/aceitar-convite/:token` | `AceitarConvite` | Fluxo publico de aceite de convite. |
| `*` sem usuario | `Login` | Qualquer rota privada redireciona visualmente para login quando nao ha usuario. |

### Rotas privadas comuns

| Caminho | Tela | Guardas |
| --- | --- | --- |
| `/` | `Dashboard` | Permissao `dashboard` |
| `/producao` | `Producao` | Permissao `producao` |
| `/estoque` | `Estoque` | Permissao `estoque` |
| `/perdas-doacoes` | `PerdasDoacoes` | Permissao `estoque` |
| `/vendas` | `Vendas` | Permissao `vendas` e plano com vendas |
| `/clientes` | `ClientesCRM` | Permissao `crm` e plano com CRM comercial |
| `/financeiro` | `Financeiro` | Permissao `financeiro` |
| `/fornecedores` | `Fornecedores` | Permissao `fornecedores` |
| `/relatorios` | `Relatorios` | Permissao `relatorios` e plano Premium |
| `/produtos` | `Produtos` | Permissao `produtos` |
| `/insumos` | `Insumos` | Permissao `insumos` |
| `/planos` | `Planos` | Permissao `planos` |
| `/configuracoes` | `Configuracoes` | Permissao `configuracoes` |
| `/parametros-empresa` | `ParametrosEmpresa` | Permissao `parametros` |
| `/usuarios-empresa` | `UsuariosEmpresa` | Permissao `usuariosEmpresa` |
| `/central-aprendizagem` | `CentralAprendizagem` | Usuario ativo na empresa |
| `/suporte` | `Suporte` | Sem guarda especifica alem de autenticacao |

### Rotas de pagamento

| Caminho | Tela | Observacao |
| --- | --- | --- |
| `/pagamento/sucesso` | `PagamentoRetorno` | Status `sucesso` |
| `/pagamento/pendente` | `PagamentoRetorno` | Status `pendente` |
| `/pagamento/erro` | `PagamentoRetorno` | Status `erro` |

### Rotas administrativas

| Caminho | Tela | Guarda |
| --- | --- | --- |
| `/admin` | redirect para `/admin/clientes` | `Navigate` |
| `/admin/clientes` | `AdminClientes` | `AdminRoute` |
| `/admin/pagamentos` | `AdminPagamentos` | `AdminRoute` |

Qualquer rota nao reconhecida dentro da area autenticada redireciona para `/`.

## Contextos

### ERPContext

Arquivos:

- `src/context/ERPContextBase.js`
- `src/context/ERPContext.jsx`
- `src/context/useERP.js`

Responsabilidade:

- manter o estado operacional do ERP;
- centralizar acesso ao Firestore;
- expor dados e funcoes usadas pelas paginas;
- aplicar regras de empresa, perfil, permissao e plano.

Principais dados expostos:

- `user`
- `perfilUsuario`
- `isAdminMaster`
- `assinaturaUsuario`
- `empresaId`
- `empresaOwnerUid`
- `empresas`
- `usuariosEmpresa`
- `usuarioEmpresaAtual`
- `perfilEmpresaAtual`
- `permissoesEmpresaAtual`
- `insumos`
- `produtos`
- `producoes`
- `vendas`
- `despesas`
- `perdasDoacoes`
- `clientesComerciais`
- `configuracoes`

Principais acoes expostas:

- `trocarEmpresa`
- `criarNovaEmpresa`
- `criarUsuarioEmpresa`
- `atualizarUsuarioEmpresa`
- `desativarUsuarioEmpresa`
- `removerUsuarioEmpresa`
- `renovarConviteUsuarioEmpresa`
- `enviarConviteEmailUsuarioEmpresa`
- `excluirUsuarioEmpresa`
- `addItem`
- `updateItem`
- `deleteItem`
- `carregarConfiguracao`
- `salvarConfiguracao`

### ToastContext

Arquivos:

- `src/context/ToastContextBase.js`
- `src/context/ToastContext.jsx`
- `src/context/useToast.js`

Responsabilidade:

- disponibilizar `showToast(message, type)`;
- normalizar aliases de tipo, como `sucesso`, `erro` e `aviso`;
- renderizar o componente `Toast`.

### ConfirmContext

Arquivos:

- `src/context/ConfirmContextBase.js`
- `src/context/ConfirmContext.jsx`
- `src/context/useConfirmacao.js`

Responsabilidade:

- disponibilizar `confirmar(message)`;
- retornar uma `Promise<boolean>`;
- renderizar um dialog global de confirmacao.

## Hooks

### useERP

Wrapper de `useContext(ERPContext)`. E o principal ponto de consumo do estado do ERP nas paginas.

### useToast

Wrapper de `useContext(ToastContext)`. Usado para exibir mensagens globais de sucesso, erro, aviso e informacao.

### useConfirmacao

Wrapper de `useContext(ConfirmContext)`. Usado quando uma acao precisa de confirmacao antes de continuar.

### usePlano

Calcula capacidades do plano a partir de:

- assinatura do usuario;
- papel de admin master;
- empresa ativa;
- usuario convidado;
- configuracao de limites em `src/config/planos.js`.

Exemplos de flags calculadas:

- `podeCriarEmpresa`
- `podeCriarUsuarioEmpresa`
- `podeUsarVendas`
- `podeUsarDRE`
- `podeGerarPDF`
- `podePersonalizarSistema`
- `podeUsarRelatoriosAvancados`
- `podeUsarCRMComercial`
- `limiteEmpresas`
- `limiteUsuarios`
- `limiteVendasMes`

### useParametros

Gerencia parametros configuraveis da empresa:

- unidades de medida;
- tipos de produto;
- categorias de despesa.

Ele escuta documentos em:

```txt
users/{ownerUid}/empresas/{empresaId}/parametros/{paramType}
```

Quando o documento nao existe, usa valores padrao e tenta gravar a configuracao inicial.

### useTableSort

Mantem estado de ordenacao de tabelas e expoe:

- `ordenacao`
- `ordenar(lista, getValor)`
- `ordenarPor(chave)`
- `indicador(chave)`
- `ativo(chave)`

Ele delega a logica para `src/utils/sortUtils.js`.

## Componentes

### Componentes de layout e navegacao

- `Sidebar`: menu lateral, menu mobile, seções por area, botao de logout e identidade visual da empresa.
- `EmpresaSwitcher`: seletor de empresa ativa.

### Componentes de guarda de rota

- `AdminRoute`: exige `isAdminMaster`; caso contrario mostra aviso e redireciona para `/`.
- `EmpresaPermissionRoute`: bloqueia acesso quando a empresa ainda esta carregando, o usuario esta inativo ou falta permissao.
- `PlanoRoute`: mostra tela de modulo bloqueado quando o plano nao libera a funcionalidade.

### Componentes de interface

- `Toast`: exibicao visual das notificacoes globais.
- `ActionMenu`: menu de acoes reutilizavel.

### Paginas

As paginas representam modulos de negocio:

- Operacao: `Insumos`, `Produtos`, `Producao`, `Estoque`, `PerdasDoacoes`.
- Comercial: `Vendas`, `ClientesCRM`.
- Gestao: `Financeiro`, `Fornecedores`, `Relatorios`.
- Conta e configuracao: `Planos`, `Configuracoes`, `ParametrosEmpresa`, `UsuariosEmpresa`.
- Suporte e aprendizado: `CentralAprendizagem`, `Suporte`.
- Administracao SaaS: `AdminClientes`, `AdminPagamentos`.
- Acesso e pagamento: `Login`, `AceitarConvite`, `PagamentoRetorno`.

## Integracao com backend

O front-end acessa o backend por `API_URL`, definido por:

```txt
VITE_API_BASE_URL
VITE_API_URL
http://localhost:10000
```

O backend Express expõe:

- `GET /health`
- `/api/checkout`
- `/api/pix`
- `/api/boleto`
- `/api/convites`
- `/api/webhooks`
- `/api/admin`

As rotas que exigem autenticacao recebem `Authorization: Bearer <firebase_id_token>` e validam o usuario no backend com Firebase Admin.

## Regras de arquitetura atuais

- A UI nao guarda token sensivel do Mercado Pago nem credenciais de email.
- Dados multiempresa ficam sob `users/{ownerUid}/empresas/{empresaId}`.
- A empresa ativa fica salva por usuario no `localStorage` com a chave `renovarEmpresaAtiva_{uid}`.
- Modulos podem ser bloqueados por permissao de empresa, por status do usuario na empresa ou por plano.
- Listeners do Firestore sao encerrados nos cleanups dos `useEffect`.
- A Sidebar so mostra itens liberados pela combinacao de permissao e plano.

## Pontos de atencao

- `ERPContext.jsx` concentra muitas responsabilidades. Se o projeto crescer, vale separar leitura de dados, usuarios da empresa, convites e configuracoes em hooks ou services dedicados.
- A configuracao Firebase esta versionada no front-end. Isso e comum para apps Firebase, mas regras de seguranca do Firestore e Storage precisam continuar sendo a principal barreira.
- Alguns textos do codigo aparecem com acentuacao corrompida, indicando possivel mistura de encoding em arquivos antigos.
- O README raiz ainda era o template padrao do Vite antes deste documento; a documentacao deve evoluir junto com o codigo.

## Detalhamento de engenharia

As secoes abaixo documentam o front-end em nivel de engenharia de software. Quando uma tela nao chama o Firestore diretamente, as consultas e gravacoes acontecem por meio de `ERPProvider`, principalmente pelos metodos `addItem`, `updateItem`, `deleteItem`, `carregarConfiguracao` e `salvarConfiguracao`.

### Convencoes de dados

Colecoes operacionais multiempresa:

```txt
users/{ownerUid}/empresas/{empresaId}/insumos
users/{ownerUid}/empresas/{empresaId}/produtos
users/{ownerUid}/empresas/{empresaId}/producoes
users/{ownerUid}/empresas/{empresaId}/vendas
users/{ownerUid}/empresas/{empresaId}/despesas
users/{ownerUid}/empresas/{empresaId}/perdasDoacoes
users/{ownerUid}/empresas/{empresaId}/clientesComerciais
users/{ownerUid}/empresas/{empresaId}/configuracoes/{chave}
users/{ownerUid}/empresas/{empresaId}/parametros/{paramType}
users/{ownerUid}/empresas/{empresaId}/usuariosEmpresa
```

Colecoes globais ou administrativas:

```txt
users/{uid}
users/{uid}/assinatura/plano
users/{uid}/empresas
usuariosPorAuth/{uid}/empresas
convitesEmpresa/{token}
logs/webhooksMercadoPago/eventos
```

## Paginas React

### `src/pages/AceitarConvite.jsx`

- Caminho completo: `velaserp/src/pages/AceitarConvite.jsx`.
- Responsabilidade: abrir link publico de convite, validar token, validar usuario autenticado e acionar aceite no backend.
- Componentes utilizados: `Login`, icones `Clock3`, `ShieldAlert`, `LogOut`, `CheckCircle2`.
- Hooks utilizados: `useState`, `useEffect`, `useCallback`, `useMemo`, `useParams`, `useNavigate`, `useToast`.
- Contexts utilizados: `ToastContext`.
- Funcoes do `ERPContext` consumidas: nenhuma.
- Consultas ao Firestore: `getDoc(doc(db, "convitesEmpresa", token))`.
- Gravacoes no Firestore: nenhuma direta no front-end; o aceite e feito por `POST /api/convites/aceitar`.
- Regras de negocio: token obrigatorio; convite precisa existir; status precisa ser valido; expiracao bloqueia aceite; email autenticado deve ser igual ao email do convite; usuario pode sair da conta para trocar email.
- Modulos impactados: Usuarios da Empresa, Convites, Autenticacao.
- Fluxo completo: monta rota publica -> escuta `onAuthStateChanged` -> busca `convitesEmpresa/{token}` -> calcula `emailConfere` -> se nao ha usuario, renderiza `Login` -> se ha usuario com email diferente, bloqueia aceite -> ao aceitar, pega `idToken`, chama backend, mostra toast, redireciona para `/`.

### `src/pages/AdminClientes.jsx`

- Caminho completo: `velaserp/src/pages/AdminClientes.jsx`.
- Responsabilidade: administracao SaaS de clientes, assinaturas, planos e limites manuais de usuarios.
- Componentes utilizados: `ActionMenu`.
- Hooks utilizados: `useState`, `useEffect`, `useCallback`, `useMemo`, `useToast`, `useTableSort`.
- Contexts utilizados: `ToastContext`.
- Funcoes do `ERPContext` consumidas: nenhuma; a protecao vem de `AdminRoute` no `App`.
- Consultas ao Firestore: `getDocs(collection(db, "users"))`, `getDoc(users/{uid}/assinatura/plano)`, `getDocs(users/{uid}/empresas)`.
- Gravacoes no Firestore: `setDoc(users/{uid}/assinatura/plano, ...)` para plano, status, vencimento, forma de pagamento, valor pago, observacao e limite manual.
- Regras de negocio: assinatura inexistente recebe defaults; planos validos vem de `PLANOS`; status aceitos sao `active`, `inactive` e `blocked`; limite manual deve ser numerico e nao negativo; limite efetivo combina limite do plano com liberacao manual.
- Modulos impactados: Planos, Usuarios da Empresa, Administracao SaaS.
- Fluxo completo: carrega usuarios -> para cada usuario carrega assinatura e empresas -> monta formularios por UID -> renderiza metricas e tabela ordenavel -> admin edita campos inline -> `salvarPlano` persiste assinatura -> opcionalmente abre modal de limite -> `salvarLimiteUsuarios` persiste liberacao manual -> recarrega lista.

### `src/pages/AdminPagamentos.jsx`

- Caminho completo: `velaserp/src/pages/AdminPagamentos.jsx`.
- Responsabilidade: diagnostico administrativo de checkout, pagamentos, webhooks e ambiente Mercado Pago.
- Componentes utilizados: icones administrativos; nao usa componente local alem da infraestrutura de rota.
- Hooks utilizados: `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, `useToast`, `useERP`.
- Contexts utilizados: `ToastContext`, `ERPContext`.
- Funcoes do `ERPContext` consumidas: `isAdminMaster`.
- Consultas ao Firestore: `getDocs(collection(db, "users"))`; `collectionGroup` para `checkoutSessions` e `pagamentos`; fallback por `users/{uid}/{colecao}`; leitura de `logs/webhooksMercadoPago/eventos`.
- Gravacoes no Firestore: nenhuma direta; limpeza de registros de teste ocorre via backend admin.
- Regras de negocio: bloqueia diagnostico se nao for admin master; tenta backend primeiro; se backend falhar, usa Firestore direto com fallback quando regras negam `collectionGroup`; limita registros; identifica ambiente Mercado Pago via `/health`; limpeza exige preview e confirmacao explicita.
- Modulos impactados: Pagamentos, Webhooks, Administracao SaaS.
- Fluxo completo: `AdminRoute` libera tela -> `carregarDiagnostico` valida admin -> carrega usuarios e ambiente -> tenta `/api/admin/pagamentos/diagnostico` -> fallback para Firestore -> normaliza listas -> renderiza metricas, tabelas e checklist -> admin pode abrir preview de limpeza -> `POST /api/admin/pagamentos/limpeza-testes` -> recarrega diagnostico.

### `src/pages/CentralAprendizagem.jsx`

- Caminho completo: `velaserp/src/pages/CentralAprendizagem.jsx`.
- Responsabilidade: central de conteudo, guias, tutoriais, FAQ e checklist operacional.
- Componentes utilizados: componentes internos definidos no proprio arquivo (`LearningInfoBlock`, `SectionTitle`, `ArticleCard`), `Link`, icones.
- Hooks utilizados: `useState`, `useMemo`.
- Contexts utilizados: nenhum.
- Funcoes do `ERPContext` consumidas: nenhuma.
- Consultas ao Firestore: nenhuma.
- Gravacoes no Firestore: nenhuma.
- Regras de negocio: filtra conteudos por termo e categoria; separa checklist dos demais conteudos; abre visualizacao detalhada por categoria.
- Modulos impactados: Ajuda, Onboarding, Suporte.
- Fluxo completo: carrega dados estaticos de `centralAprendizagemData` -> calcula totais e filtros -> renderiza categorias ou lista filtrada -> usuario alterna visualizacao ou busca -> UI recalcula resultados localmente.

### `src/pages/ClientesCRM.jsx`

- Caminho completo: `velaserp/src/pages/ClientesCRM.jsx`.
- Responsabilidade: cadastro, analise e relacionamento de clientes comerciais.
- Componentes utilizados: `ActionMenu`, icones `UserPlus`, `Search`, `X`, `AlertTriangle`, `Trash2`, `MessageCircle`.
- Hooks utilizados: `useState`, `useMemo`, `useCallback`, `useNavigate`, `useERP`, `useToast`, `useConfirmacao`, `usePlano`, `useTableSort`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `user`, `empresaId`, `clientesComerciais`, `vendas`, `addItem`, `updateItem`, `deleteItem`.
- Consultas ao Firestore: via `ERPProvider` em `clientesComerciais` e `vendas`.
- Gravacoes no Firestore: via `addItem("clientesComerciais")`, `updateItem("clientesComerciais")`, `deleteItem("clientesComerciais")`.
- Regras de negocio: normaliza telefone; evita duplicidade por nome ou telefone; calcula historico comercial por vendas; calcula frequencia media, ticket medio, ultima compra, proxima recompra e status de recompra; bloqueia exclusao quando ha historico comercial; integra WhatsApp quando permitido.
- Modulos impactados: CRM, Vendas, Relatorios.
- Fluxo completo: recebe clientes e vendas do contexto -> calcula metricas por cliente -> aplica filtros de status, tipo, relacionamento e busca -> usuario abre formulario -> salva novo cliente ou atualiza existente -> exclusao exige confirmacao e checagem de movimentacao -> listas sao atualizadas pelo listener do `ERPProvider`.

### `src/pages/Configuracoes.jsx`

- Caminho completo: `velaserp/src/pages/Configuracoes.jsx`.
- Responsabilidade: configuracoes da empresa, dados fiscais, tema e white label.
- Componentes utilizados: elementos HTML de formulario; sem componente local reutilizavel.
- Hooks utilizados: `useState`, `useEffect`, `useNavigate`, `useERP`, `useToast`, `usePlano`.
- Contexts utilizados: `ERPContext`, `ToastContext`.
- Funcoes do `ERPContext` consumidas: `user`, `empresaId`, `configuracoes`, `salvarConfiguracao`, `temPermissaoEmpresaAtual`.
- Consultas ao Firestore: via `ERPProvider`, ouvindo `configuracoes`.
- Gravacoes no Firestore: `salvarConfiguracao("empresa", ...)` e `salvarConfiguracao("fiscal", ...)`.
- Regras de negocio: exige usuario e empresa; exige permissao `configuracoes` para fiscal; personalizacao visual so e liberada por `podePersonalizarSistema`; logo tem limite de 500 KB; plano sem personalizacao salva apenas dados basicos.
- Modulos impactados: Configuracoes, White Label, Fiscal, Sidebar, Relatorios e Vendas em PDF.
- Fluxo completo: recebe configuracoes do contexto -> popula formularios `empresa` e `fiscal` -> usuario edita campos -> upload de logo vira base64 se plano permitir -> salvar empresa grava `configuracoes/empresa` -> `ERPProvider` aplica tema global -> salvar fiscal grava `configuracoes/fiscal`.

### `src/pages/Dashboard.jsx`

- Caminho completo: `velaserp/src/pages/Dashboard.jsx`.
- Responsabilidade: visao gerencial inicial com indicadores, graficos e ultimos pedidos.
- Componentes utilizados: `ChartFrame`, `ResponsiveContainer`, `LineChart`, `BarChart`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Line`, `Bar`, `ProducaoProdutoTooltip`.
- Hooks utilizados: `useState`, `useEffect`, `useRef`, `useERP`, `useTableSort`.
- Contexts utilizados: `ERPContext`.
- Funcoes do `ERPContext` consumidas: `vendas`, `producoes`, `insumos`, `despesas`.
- Consultas ao Firestore: via `ERPProvider`.
- Gravacoes no Firestore: nenhuma.
- Regras de negocio: calcula faturamento, lucro, despesas, saldo, ticket medio, pedidos pendentes, faturamento por dia, ranking de produtos vendidos, producao por produto e alertas de insumos zerados.
- Modulos impactados: Dashboard, Vendas, Producao, Financeiro, Estoque.
- Fluxo completo: recebe colecoes ja carregadas -> calcula KPIs em memoria -> `ChartFrame` espera dimensoes validas para renderizar graficos -> ordena ultimos pedidos -> renderiza cards, graficos e tabela sem gravar dados.

### `src/pages/Estoque.jsx`

- Caminho completo: `velaserp/src/pages/Estoque.jsx`.
- Responsabilidade: consolidar estoque de insumos e produtos, alertas e estoque minimo.
- Componentes utilizados: `ActionMenu`.
- Hooks utilizados: `useState`, `useEffect`, `useERP`, `useTableSort`.
- Contexts utilizados: `ERPContext`.
- Funcoes do `ERPContext` consumidas: `empresaId`, `insumos`, `produtos`, `producoes`, `vendas`, `perdasDoacoes`, `configuracoes`, `carregarConfiguracao`, `salvarConfiguracao`.
- Consultas ao Firestore: via `ERPProvider`; leitura adicional por `carregarConfiguracao("estoque")`.
- Gravacoes no Firestore: `salvarConfiguracao("estoque", { estoqueMinimo })`.
- Regras de negocio: calcula estoque real por producoes, vendas e perdas/doacoes; separa produto acabado, semiacabado e outros; combina estoque minimo local, configurado e padrao; classifica alertas de baixo estoque e zerado.
- Modulos impactados: Estoque, Insumos, Produtos, Producao, Vendas, Perdas e Doacoes.
- Fluxo completo: recebe colecoes -> carrega configuracao de estoque minimo -> calcula saldos e valores -> renderiza tabelas ordenaveis -> usuario edita estoque minimo -> salva configuracao -> provider propaga nova configuracao.

### `src/pages/Financeiro.jsx`

- Caminho completo: `velaserp/src/pages/Financeiro.jsx`.
- Responsabilidade: fluxo financeiro, despesas, indicadores e DRE gerencial.
- Componentes utilizados: `ActionMenu`, `IconeSaudeFinanceira`.
- Hooks utilizados: `useState`, `useNavigate`, `useERP`, `useToast`, `useConfirmacao`, `usePlano`, `useParametros`, `useTableSort`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `vendas`, `despesas`, `addItem`, `updateItem`, `deleteItem`.
- Consultas ao Firestore: via `ERPProvider` para vendas e despesas; via `useParametros` para categorias de despesa.
- Gravacoes no Firestore: `addItem("despesas")`, `updateItem("despesas")`, `deleteItem("despesas")`.
- Regras de negocio: vendas viram entradas financeiras; despesas viram saidas; filtra por periodo; calcula saldo, a receber, despesas pendentes, saude financeira, DRE, margens e despesas por categoria; DRE depende de plano.
- Modulos impactados: Financeiro, Vendas, Parametros, Relatorios.
- Fluxo completo: recebe vendas/despesas/categorias -> calcula movimentacoes e indicadores -> usuario cadastra ou edita despesa -> valida campos -> persiste em `despesas` -> exclusao exige confirmacao -> listener atualiza tela.

### `src/pages/Fornecedores.jsx`

- Caminho completo: `velaserp/src/pages/Fornecedores.jsx`.
- Responsabilidade: cadastro e status de fornecedores.
- Componentes utilizados: `ActionMenu`, icones `Truck`, `Plus`, `Building2`, `Search`, `Filter`, `Users`.
- Hooks utilizados: `useState`, `useEffect`, `useMemo`, `useERP`, `useToast`, `useConfirmacao`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `user`, `empresaId`, `empresaOwnerUid`.
- Consultas ao Firestore: listener direto em `users/{ownerUid}/empresas/{empresaId}/fornecedores`.
- Gravacoes no Firestore: `addDoc(fornecedoresRef, ...)`, `updateDoc(doc(fornecedoresRef, id), ...)`.
- Regras de negocio: exige empresa carregada; exige nome fantasia ou razao social; normaliza status; alterna ativo/inativo com confirmacao; grava timestamps com `serverTimestamp`.
- Modulos impactados: Fornecedores, Compras/Operacao futura.
- Fluxo completo: calcula `ownerUid` -> monta `fornecedoresRef` -> abre `onSnapshot` -> usuario filtra por busca/status -> abre modal -> salva novo ou edita fornecedor -> atualiza status por menu de acoes -> snapshot atualiza lista.

### `src/pages/Insumos.jsx`

- Caminho completo: `velaserp/src/pages/Insumos.jsx`.
- Responsabilidade: cadastro de insumos e lancamento de compras.
- Componentes utilizados: `ActionMenu`.
- Hooks utilizados: `useState`, `useEffect`, `useCallback`, `useERP`, `useToast`, `useConfirmacao`, `useParametros`, `useTableSort`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `insumos`, `producoes`, `perdasDoacoes`, `addItem`, `updateItem`, `deleteItem`.
- Consultas ao Firestore: via `ERPProvider`; via `useParametros` para unidades de medida.
- Gravacoes no Firestore: `addItem("insumos")`, `updateItem("insumos")`, `deleteItem("insumos")`.
- Regras de negocio: calcula custo medio por compras; calcula estoque real por compras, producao e perdas/doacoes; valida cadastro e compras; recalcula estoque quando movimentacoes mudam; exclusao exige confirmacao.
- Modulos impactados: Insumos, Produtos, Producao, Estoque, Perdas e Doacoes.
- Fluxo completo: recebe insumos/producao/perdas -> carrega unidades ativas -> calcula saldos -> usuario cadastra insumo -> usuario lanca compra dentro do insumo -> atualiza documento com lista de compras e custo -> exclusao passa por confirmacao.

### `src/pages/Login.jsx`

- Caminho completo: `velaserp/src/pages/Login.jsx`.
- Responsabilidade: login, cadastro e recuperacao de senha.
- Componentes utilizados: logo `saasLogo`; sem componente local.
- Hooks utilizados: `useState`, `useToast`.
- Contexts utilizados: `ToastContext`.
- Funcoes do `ERPContext` consumidas: nenhuma.
- Consultas ao Firestore: nenhuma direta.
- Gravacoes no Firestore: nenhuma direta; criacao de usuario ocorre no Firebase Auth, e `ERPProvider` cria/atualiza `users/{uid}` apos login.
- Regras de negocio: alterna modo cadastro/login; exige email para recuperar senha; usa Firebase Auth para entrar, cadastrar e resetar senha.
- Modulos impactados: Autenticacao, Preparacao de usuario no ERPProvider.
- Fluxo completo: usuario preenche email/senha -> submit chama `createUserWithEmailAndPassword` ou `signInWithEmailAndPassword` -> Auth muda estado -> `App` troca para area autenticada -> `ERPProvider` prepara perfil e empresa.

### `src/pages/PagamentoRetorno.jsx`

- Caminho completo: `velaserp/src/pages/PagamentoRetorno.jsx`.
- Responsabilidade: tela de retorno visual para sucesso, pendencia ou erro de pagamento.
- Componentes utilizados: `Link`, icones `CheckCircle2`, `Clock3`, `XCircle`, `CreditCard`, `LayoutDashboard`.
- Hooks utilizados: nenhum hook de estado.
- Contexts utilizados: nenhum.
- Funcoes do `ERPContext` consumidas: nenhuma.
- Consultas ao Firestore: nenhuma.
- Gravacoes no Firestore: nenhuma.
- Regras de negocio: escolhe conteudo por prop `status`; orienta usuario a voltar ao dashboard ou planos.
- Modulos impactados: Planos, Pagamentos.
- Fluxo completo: rota define `status` em `App` -> componente seleciona configuracao visual -> renderiza mensagem e links.

### `src/pages/ParametrosEmpresa.jsx`

- Caminho completo: `velaserp/src/pages/ParametrosEmpresa.jsx`.
- Responsabilidade: administrar parametros reutilizados por produtos, insumos e financeiro.
- Componentes utilizados: icones `Settings2`, `Search`, `Plus`, `Check`, `X`, `Edit3`, `EyeOff`, `Eye`, `Trash2`.
- Hooks utilizados: `useState`, `useMemo`, `useParametros`, `useToast`.
- Contexts utilizados: `ToastContext`; indiretamente `ERPContext` dentro de `useParametros`.
- Funcoes do `ERPContext` consumidas: nenhuma direta.
- Consultas ao Firestore: via `useParametros`.
- Gravacoes no Firestore: via `useParametros`: `setDoc(parametros/{paramType}, { items })`.
- Regras de negocio: separa grupos de parametros; filtra por busca; impede nome vazio; permite ativar/desativar, editar e excluir itens; usa confirmacao visual local para exclusao.
- Modulos impactados: Insumos, Produtos, Financeiro.
- Fluxo completo: `useParametros` escuta documentos -> tela escolhe aba ativa -> usuario filtra ou cria item -> hook atualiza documento -> listas consumidoras passam a enxergar parametros atualizados.

### `src/pages/PerdasDoacoes.jsx`

- Caminho completo: `velaserp/src/pages/PerdasDoacoes.jsx`.
- Responsabilidade: registrar baixas de estoque por perda ou doacao para produtos e insumos.
- Componentes utilizados: `ActionMenu`.
- Hooks utilizados: `useState`, `useMemo`, `useERP`, `useToast`, `useConfirmacao`, `useTableSort`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `user`, `insumos`, `produtos`, `producoes`, `vendas`, `perdasDoacoes`, `addItem`, `updateItem`.
- Consultas ao Firestore: via `ERPProvider`.
- Gravacoes no Firestore: `addItem("perdasDoacoes")`; cancelamento por `updateItem("perdasDoacoes", id, ...)`.
- Regras de negocio: item pode ser insumo ou produto; calcula saldo disponivel; impede quantidade invalida; registra custo unitario e custo total snapshot; cancelamento exige confirmacao.
- Modulos impactados: Estoque, Insumos, Produtos, Relatorios.
- Fluxo completo: calcula estoque atual -> usuario seleciona tipo e item -> sistema mostra saldo e custo -> usuario registra perda/doacao -> grava movimento -> estoque e relatorios passam a considerar baixa -> cancelamento marca registro em vez de excluir fisicamente.

### `src/pages/Planos.jsx`

- Caminho completo: `velaserp/src/pages/Planos.jsx`.
- Responsabilidade: apresentacao dos planos e inicio de pagamentos por cartao, PIX ou boleto.
- Componentes utilizados: icones `QrCode`, `Copy`, `Barcode`, `ExternalLink`, `Sparkles`, `CheckCircle2`, `Building2`, `ShieldCheck`, `CreditCard`.
- Hooks utilizados: `useState`, `useEffect`, `useRef`, `useCallback`, `usePlano`, `useToast`.
- Contexts utilizados: `ToastContext`; indiretamente `ERPContext` dentro de `usePlano`.
- Funcoes do `ERPContext` consumidas: nenhuma direta.
- Consultas ao Firestore: nenhuma direta.
- Gravacoes no Firestore: nenhuma direta; ativacao real e feita pelo backend/webhook.
- Regras de negocio: plano gratis nao abre checkout; planos inferiores/superiores sao comparados por nivel; cartao usa checkout Mercado Pago; PIX e boleto usam endpoints especificos; modal acompanha status local; copia codigo PIX; fecha modal apos confirmacao visual.
- Modulos impactados: Planos, Pagamentos, Assinatura.
- Fluxo completo: `usePlano` informa plano atual -> usuario escolhe meio de pagamento -> front pega ID token -> chama `/api/checkout/mercado-pago` ou `/api/{pix|boleto}/create` -> backend cria pagamento -> modal exibe resultado/link/codigo -> webhook/backend atualiza assinatura.

### `src/pages/Producao.jsx`

- Caminho completo: `velaserp/src/pages/Producao.jsx`.
- Responsabilidade: registrar producao de produtos, consumo de insumos e componentes, e historico produtivo.
- Componentes utilizados: `ActionMenu`.
- Hooks utilizados: `useState`, `useERP`, `useToast`, `useConfirmacao`, `useTableSort`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `produtos`, `insumos`, `producoes`, `vendas`, `perdasDoacoes`, `addItem`, `deleteItem`.
- Consultas ao Firestore: via `ERPProvider`.
- Gravacoes no Firestore: `addItem("producoes")`, `deleteItem("producoes")`.
- Regras de negocio: calcula custo medio dos insumos; valida estoque de insumos e componentes antes de produzir; calcula custo total/unitario; separa classes industriais; exclusao exige confirmacao.
- Modulos impactados: Producao, Produtos, Insumos, Estoque, Relatorios.
- Fluxo completo: usuario seleciona produto e quantidade -> sistema calcula consumos e componentes -> valida estoque disponivel -> grava producao com snapshots de custo -> estoque calculado muda pelo listener -> exclusao remove producao e reverte efeito pelo recalculo.

### `src/pages/Produtos.jsx`

- Caminho completo: `velaserp/src/pages/Produtos.jsx`.
- Responsabilidade: cadastro de produtos, ficha tecnica, custos, margens, fiscal e composicao por insumos/produtos.
- Componentes utilizados: `ActionMenu`.
- Hooks utilizados: `useState`, `useERP`, `useToast`, `useConfirmacao`, `useTableSort`, `useParametros`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `insumos`, `produtos`, `addItem`, `updateItem`, `deleteItem`.
- Consultas ao Firestore: via `ERPProvider`; via `useParametros` para tipos de produto.
- Gravacoes no Firestore: `addItem("produtos")`, `updateItem("produtos")`, `deleteItem("produtos")`.
- Regras de negocio: produto de revenda usa custo unitario manual; produto fabricado calcula custo por consumos e componentes; valida codigo, nome, preco e quantidade de producao; normaliza fiscal, origem e classe industrial; calcula lucro e margem; exclusao exige confirmacao.
- Modulos impactados: Produtos, Insumos, Producao, Vendas, Estoque, Fiscal.
- Fluxo completo: carrega insumos/produtos/tipos -> usuario preenche ficha -> sistema calcula custo e margem em tempo real -> salvar monta `produtoCalculado` -> grava ou atualiza documento -> tabela recalcula indicadores -> edicao recarrega form a partir do produto.

### `src/pages/Relatorios.jsx`

- Caminho completo: `velaserp/src/pages/Relatorios.jsx`.
- Responsabilidade: indicadores consolidados, relatorios gerenciais e geracao de PDFs.
- Componentes utilizados: `jsPDF`, `autoTable`, logo `saasLogo`; sem componente local reutilizavel.
- Hooks utilizados: `useState`, `useERP`, `useToast`, `usePlano`, `useTableSort`.
- Contexts utilizados: `ERPContext`, `ToastContext`.
- Funcoes do `ERPContext` consumidas: `insumos`, `produtos`, `producoes`, `vendas`, `perdasDoacoes`, `despesas`, `empresas`, `empresaId`, `configuracoes`, `clientesComerciais`.
- Consultas ao Firestore: via `ERPProvider`.
- Gravacoes no Firestore: nenhuma.
- Regras de negocio: filtra por periodo e cliente; consolida clientes por ID/nome; calcula vendas, despesas, custo, lucro, margem, DRE, estoque, alertas e producao; DRE depende de `podeUsarDRE`; PDF depende de `podeGerarPDF`.
- Modulos impactados: Relatorios, Vendas, Financeiro, Estoque, Producao, CRM, Configuracoes.
- Fluxo completo: recebe colecoes -> aplica filtros -> calcula datasets e alertas -> usuario escolhe relatorio -> valida permissao de plano -> monta PDF com cabecalho, cards, tabelas e rodape -> faz download sem gravar dados.

### `src/pages/Suporte.jsx`

- Caminho completo: `velaserp/src/pages/Suporte.jsx`.
- Responsabilidade: oferecer canais e orientacoes de suporte.
- Componentes utilizados: `Link`, icones `LifeBuoy`, `MessageCircle`, `Mail`, `BookOpen`, `ClipboardList`, `CheckCircle`, `Sparkles`.
- Hooks utilizados: nenhum hook de estado.
- Contexts utilizados: nenhum.
- Funcoes do `ERPContext` consumidas: nenhuma.
- Consultas ao Firestore: nenhuma.
- Gravacoes no Firestore: nenhuma.
- Regras de negocio: links externos para WhatsApp/email e checklist estatico antes do suporte.
- Modulos impactados: Suporte, Central de Aprendizagem.
- Fluxo completo: renderiza conteudo estatico -> usuario acessa WhatsApp, email ou central de aprendizagem.

### `src/pages/UsuariosEmpresa.jsx`

- Caminho completo: `velaserp/src/pages/UsuariosEmpresa.jsx`.
- Responsabilidade: gerenciar usuarios, perfis, convites, status e remocao de acesso por empresa.
- Componentes utilizados: `ActionMenu`, icones `UserPlus`, `Users`, `ShieldCheck`, `Clock3`.
- Hooks utilizados: `useState`, `useMemo`, `useNavigate`, `useERP`, `useToast`, `useConfirmacao`, `usePlano`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `user`, `isAdminMaster`, `usuariosEmpresa`, `usuariosEmpresaCarregando`, `usuarioEmpresaAtual`, `podeGerenciarUsuariosEmpresa`, `criarUsuarioEmpresa`, `atualizarUsuarioEmpresa`, `desativarUsuarioEmpresa`, `removerUsuarioEmpresa`, `renovarConviteUsuarioEmpresa`, `enviarConviteEmailUsuarioEmpresa`.
- Consultas ao Firestore: via `ERPProvider`, listener em `usuariosEmpresa`.
- Gravacoes no Firestore: via funcoes publicas do `ERPProvider`, incluindo batch em convites e chamada backend para remover usuario.
- Regras de negocio: limite de usuarios por plano; somente perfis autorizados gerenciam usuarios; dono nao e tratado como usuario comum; convite pode ser copiado, renovado e reenviado; status ativo/inativo passa por confirmacao; remocao chama backend.
- Modulos impactados: Usuarios da Empresa, Convites, Permissoes, Planos.
- Fluxo completo: recebe usuarios e limites -> ordena por status/email -> usuario abre novo convite -> `criarUsuarioEmpresa` valida limite e duplicidade, grava usuario pendente e indice de convite, tenta enviar email -> tela mostra link -> admin pode editar perfil/status, reenviar email, renovar link ou remover acesso.

### `src/pages/Vendas.jsx`

- Caminho completo: `velaserp/src/pages/Vendas.jsx`.
- Responsabilidade: pedido de venda, itens, estoque disponivel, margem, expedicao, pagamento e PDF do pedido.
- Componentes utilizados: `ActionMenu`, `html2pdf`, logo `saasLogo`.
- Hooks utilizados: `useState`, `useERP`, `useToast`, `useConfirmacao`, `usePlano`.
- Contexts utilizados: `ERPContext`, `ToastContext`, `ConfirmContext`.
- Funcoes do `ERPContext` consumidas: `producoes`, `produtos`, `vendas`, `perdasDoacoes`, `addItem`, `updateItem`, `deleteItem`, `clientesComerciais`, `configuracoes`, `empresas`, `empresaId`.
- Consultas ao Firestore: via `ERPProvider`.
- Gravacoes no Firestore: `addItem("vendas")`, `updateItem("vendas")`, `deleteItem("vendas")`.
- Regras de negocio: gera numero sequencial; valida cliente, data e itens; calcula saldo disponivel por produto considerando producao, vendas e perdas; calcula preco sugerido por margem; calcula bruto, desconto, total, custo, lucro e margem; plano gratis respeita limite mensal; PDF depende do plano; CRM basico habilita uso da carteira de clientes; pagamento e expedicao sao atualizados separadamente.
- Modulos impactados: Vendas, Estoque, Produtos, Producao, CRM, Financeiro, Relatorios, Planos.
- Fluxo completo: recebe dados do contexto -> usuario monta pedido e itens -> sistema calcula estoque e totais -> `finalizarPedido` valida limite e dados -> salva novo pedido ou atualiza existente -> historico permite editar, excluir, alterar expedicao, alterar pagamento e baixar PDF -> listeners atualizam vendas, financeiro, estoque e relatorios.

## Componentes React

### `src/components/ActionMenu.jsx`

- Utilizado por: `AdminClientes`, `ClientesCRM`, `Estoque`, `Financeiro`, `Fornecedores`, `Insumos`, `PerdasDoacoes`, `Producao`, `Produtos`, `UsuariosEmpresa`, `Vendas`.
- Props: `label = "Abrir acoes"`; `items = [{ label, onClick, danger, disabled }]`.
- Callbacks disparados: `item.onClick()` quando a acao e escolhida.
- Estados controlados: `aberto`, `posicao`.
- Dependencias internas: `useEffect`, `useRef`, `useState`, `MoreVertical`.
- Diagrama de chamadas:

```txt
Pagina
  -> <ActionMenu items=[...]>
      -> clique no botao
      -> calcularPosicao()
      -> renderiza dropdown
      -> clique em item
      -> executarAcao(item)
      -> item.onClick() definido pela pagina
```

### `src/components/AdminRoute.jsx`

- Utilizado por: `App.jsx` nas rotas `/admin/clientes` e `/admin/pagamentos`.
- Props: `children`.
- Callbacks disparados: nenhum callback recebido; chama `showToast` internamente quando acesso e negado.
- Estados controlados: nenhum estado local.
- Dependencias internas: `useEffect`, `Navigate`, `useERP`, `useToast`.
- Diagrama de chamadas:

```txt
App Route
  -> AdminRoute
      -> useERP(perfilCarregando, isAdminMaster)
      -> carregando: loading
      -> nao admin: showToast + Navigate("/")
      -> admin: children
```

### `src/components/EmpresaPermissionRoute.jsx`

- Utilizado por: `App.jsx` em quase todas as rotas privadas por modulo.
- Props: `permissao`, `titulo`, `descricao`, `children`.
- Callbacks disparados: nenhum.
- Estados controlados: nenhum estado local.
- Dependencias internas: `ShieldX`, `useERP`.
- Diagrama de chamadas:

```txt
App Route
  -> EmpresaPermissionRoute(permissao)
      -> useERP(empresaId, carregamentos, usuarioEmpresaInativo, temPermissaoEmpresaAtual)
      -> loading se perfil/empresa/usuarios carregando
      -> bloqueio se usuario inativo
      -> bloqueio se permissao ausente
      -> children
```

### `src/components/EmpresaSwitcher.jsx`

- Utilizado por: `Sidebar`.
- Props: nenhuma.
- Callbacks disparados: `trocarEmpresa(id)` no select; `criarNovaEmpresa(nome)` no botao `+`.
- Estados controlados: `novaEmpresa`.
- Dependencias internas: `useERP`, `useToast`, `usePlano`.
- Diagrama de chamadas:

```txt
Sidebar
  -> EmpresaSwitcher
      -> select onChange
      -> ERPProvider.trocarEmpresa(id)
      -> limpa estados da empresa e reabre listeners

      -> input nova empresa + botao
      -> valida nome e limite do plano
      -> ERPProvider.criarNovaEmpresa(nome)
```

### `src/components/PlanoRoute.jsx`

- Utilizado por: `App.jsx` em `Vendas`, `ClientesCRM` e `Relatorios`.
- Props: `permitido`, `titulo`, `descricao`, `planoMinimo`, `children`.
- Callbacks disparados: navega para `/planos` no botao de upgrade.
- Estados controlados: nenhum estado local.
- Dependencias internas: `useNavigate`, `LockKeyhole`, `usePlano`.
- Diagrama de chamadas:

```txt
App Route
  -> PlanoRoute(permitido)
      -> usePlano(assinaturaCarregando)
      -> loading se assinatura carregando
      -> permitido: children
      -> bloqueado: card de upgrade -> navigate("/planos")
```

### `src/components/Sidebar.jsx`

- Utilizado por: `AuthenticatedApp` em `App.jsx`.
- Props: nenhuma.
- Callbacks disparados: `signOut(auth)` no botao sair; `setMenuAberto` em menu mobile; navegacao via `NavLink`.
- Estados controlados: `menuAberto`.
- Dependencias internas: `NavLink`, `useLocation`, `signOut`, `EmpresaSwitcher`, `useERP`, `usePlano`, `PERMISSOES_EMPRESA`, icones.
- Diagrama de chamadas:

```txt
AuthenticatedApp
  -> Sidebar
      -> useERP(configuracoes, isAdminMaster, temPermissaoEmpresaAtual)
      -> usePlano(flags comerciais)
      -> monta menuSections
      -> EmpresaSwitcher
      -> NavLink por permissao/plano
      -> Sair -> Firebase signOut -> App volta ao Login
```

### `src/components/Toast.jsx`

- Utilizado por: `ToastProvider`.
- Props: `message`, `type = "success"`, `onClose`.
- Callbacks disparados: `onClose()` apos 3 segundos.
- Estados controlados: nenhum estado local; controla apenas timer de efeito.
- Dependencias internas: `useEffect`.
- Diagrama de chamadas:

```txt
Pagina ou provider
  -> showToast(message, type)
  -> ToastProvider.setToast(...)
  -> <Toast>
      -> timer 3000ms
      -> onClose()
      -> ToastProvider limpa toast
```

## Contexts

### `ERPContext`

Arquivos: `src/context/ERPContextBase.js`, `src/context/ERPContext.jsx`, `src/context/useERP.js`.

Estados expostos:

| Estado | Origem/atualizacao | Consumidores principais |
| --- | --- | --- |
| `user` | Firebase Auth em `ERPProvider` | `usePlano`, `Configuracoes`, `Fornecedores`, `UsuariosEmpresa`, `Vendas`, `ClientesCRM` |
| `perfilUsuario` | listener em `users/{uid}` | `AdminRoute`, `usePlano`, `ERPProvider` |
| `perfilCarregando` | ciclo de autenticacao/perfil | `AdminRoute`, `EmpresaPermissionRoute`, `usePlano` |
| `isAdminMaster` | derivado de `perfilUsuario.role` | `AdminRoute`, `Sidebar`, `AdminPagamentos`, `UsuariosEmpresa`, `usePlano` |
| `assinaturaUsuario` | listener em `users/{uid}/assinatura/plano` | `usePlano` |
| `assinaturaPadrao` | config local de planos | `usePlano`, consumidores indiretos |
| `empresaId` | selecao/criacao/carregamento de empresas | quase todas as telas operacionais |
| `empresaOwnerUid` | empresa ativa ou usuario atual | `useParametros`, `Fornecedores`, rotas multiempresa |
| `empresas` | leitura de empresas proprias e vinculos | `Sidebar`, `EmpresaSwitcher`, `Relatorios`, `Vendas`, `usePlano` |
| `usuariosEmpresa` | listener em `usuariosEmpresa` | `UsuariosEmpresa`, permissoes internas |
| `usuariosEmpresaCarregando` | listener de usuarios da empresa | `EmpresaPermissionRoute`, `UsuariosEmpresa` |
| `usuarioEmpresaAtual` | derivado de usuario e vinculos | `usePlano`, `UsuariosEmpresa` |
| `perfilEmpresaAtual` | derivado de `usuarioEmpresaAtual` | `UsuariosEmpresa`, permissoes |
| `permissoesEmpresaAtual` | config por perfil | `UsuariosEmpresa` |
| `usuarioEmpresaInativo` | derivado de status | `EmpresaPermissionRoute` |
| `usuarioEmpresaSomenteLeitura` | derivado de perfil | paginas podem usar em evolucao futura |
| `podeGerenciarUsuariosEmpresa` | permissao `usuarios_empresa` | `UsuariosEmpresa` |
| `insumos` | listener Firestore | `Dashboard`, `Estoque`, `Insumos`, `Produtos`, `Producao`, `Relatorios`, `PerdasDoacoes` |
| `produtos` | listener Firestore | `Estoque`, `Produtos`, `Producao`, `Vendas`, `Relatorios`, `PerdasDoacoes` |
| `producoes` | listener Firestore | `Dashboard`, `Estoque`, `Insumos`, `Producao`, `Vendas`, `Relatorios`, `PerdasDoacoes` |
| `vendas` | listener Firestore | `Dashboard`, `Estoque`, `Financeiro`, `ClientesCRM`, `Relatorios`, `Vendas` |
| `despesas` | listener Firestore | `Dashboard`, `Financeiro`, `Relatorios` |
| `perdasDoacoes` | listener Firestore | `Estoque`, `Insumos`, `Producao`, `Vendas`, `Relatorios`, `PerdasDoacoes` |
| `clientesComerciais` | listener Firestore | `ClientesCRM`, `Vendas`, `Relatorios` |
| `configuracoes` | listener Firestore | `Configuracoes`, `Sidebar`, `Vendas`, `Relatorios`, `Estoque` |

Funcoes publicas:

| Funcao | O que faz | Arquivos que chamam |
| --- | --- | --- |
| `trocarEmpresa(id)` | atualiza empresa ativa, persiste em `localStorage` e limpa colecoes dependentes | `EmpresaSwitcher.jsx` |
| `criarNovaEmpresa(nome)` | valida plano, cria empresa e garante usuario dono | `EmpresaSwitcher.jsx` |
| `temPermissaoEmpresaAtual(permissao)` | valida permissao considerando admin master e status do usuario | `Sidebar.jsx`, `EmpresaPermissionRoute.jsx`, `Configuracoes.jsx` |
| `criarUsuarioEmpresa(dados)` | valida limite/duplicidade, cria usuario pendente, cria indice de convite e envia email | `UsuariosEmpresa.jsx` |
| `atualizarUsuarioEmpresa(id, dados)` | atualiza perfil/status/dados do usuario da empresa | `UsuariosEmpresa.jsx` |
| `desativarUsuarioEmpresa(id)` | marca usuario como inativo e remove pendencia de convite | `UsuariosEmpresa.jsx` |
| `removerUsuarioEmpresa(id)` | chama backend para remover usuario da empresa | `UsuariosEmpresa.jsx` |
| `renovarConviteUsuarioEmpresa(id)` | cancela token antigo e cria novo convite | `UsuariosEmpresa.jsx` |
| `enviarConviteEmailUsuarioEmpresa(id)` | chama backend de envio para convite pendente | `UsuariosEmpresa.jsx` |
| `excluirUsuarioEmpresa(id)` | remove documento de usuario e cancela convite, quando aplicavel | Exposta, sem chamada encontrada nas paginas atuais |
| `addItem(colecao, data)` | adiciona documento em colecao da empresa ativa | `ClientesCRM`, `Financeiro`, `Insumos`, `PerdasDoacoes`, `Producao`, `Produtos`, `Vendas` |
| `updateItem(colecao, id, data)` | atualiza documento em colecao da empresa ativa | `ClientesCRM`, `Financeiro`, `Insumos`, `PerdasDoacoes`, `Produtos`, `Vendas` |
| `deleteItem(colecao, id)` | exclui documento em colecao da empresa ativa | `ClientesCRM`, `Financeiro`, `Insumos`, `Producao`, `Produtos`, `Vendas` |
| `carregarConfiguracao(chave)` | le documento unico em `configuracoes/{chave}` e atualiza cache local | `Estoque.jsx` |
| `salvarConfiguracao(chave, data)` | faz `setDoc` merge em `configuracoes/{chave}` | `Configuracoes.jsx`, `Estoque.jsx` |

Fluxo de atualizacao dos estados:

```txt
Firebase Auth muda
  -> ERPProvider reseta estado sensivel
  -> prepara users/{uid} e assinatura
  -> carrega empresas proprias + vinculos
  -> escolhe empresa ativa
  -> listener usuariosEmpresa
  -> calcula usuarioEmpresaAtual/perfil/permissoes
  -> abre listeners das colecoes permitidas
  -> paginas consomem arrays atualizados
  -> pagina chama add/update/delete
  -> Firestore muda
  -> onSnapshot atualiza estado
  -> UI rerenderiza
```

### `ToastContext`

Arquivos: `src/context/ToastContextBase.js`, `src/context/ToastContext.jsx`, `src/context/useToast.js`.

- Estado interno: `toast`.
- Estado exposto: nenhum objeto de estado; expoe apenas `showToast`.
- Funcao publica: `showToast(message, type)`.
- Consumidores: `ERPContext`, `AdminRoute`, `EmpresaSwitcher`, `AceitarConvite`, `AdminClientes`, `AdminPagamentos`, `ClientesCRM`, `Configuracoes`, `Financeiro`, `Fornecedores`, `Insumos`, `Login`, `ParametrosEmpresa`, `PerdasDoacoes`, `Planos`, `Producao`, `Produtos`, `Relatorios`, `UsuariosEmpresa`, `Vendas`.
- Fluxo:

```txt
showToast(message, type)
  -> normalizarTipoToast(type)
  -> setToast({ id, message, type })
  -> Toast renderiza
  -> timer chama onClose
  -> setToast(null)
```

### `ConfirmContext`

Arquivos: `src/context/ConfirmContextBase.js`, `src/context/ConfirmContext.jsx`, `src/context/useConfirmacao.js`.

- Estado interno: `confirmacao`.
- Estado exposto: nenhum objeto de estado; expoe apenas `confirmar`.
- Funcao publica: `confirmar(message) => Promise<boolean>`.
- Consumidores: `ClientesCRM`, `Financeiro`, `Fornecedores`, `Insumos`, `PerdasDoacoes`, `Producao`, `Produtos`, `UsuariosEmpresa`, `Vendas`.
- Fluxo:

```txt
confirmar(message)
  -> cria Promise
  -> setConfirmacao({ message, resolve })
  -> renderiza dialog global
  -> usuario clica Cancelar ou Confirmar
  -> resolve(false|true)
  -> setConfirmacao(null)
  -> handler da pagina continua ou aborta
```

## Hooks

### `useERP`

- Parametros: nenhum.
- Retorno: valor atual de `ERPContext`.
- Fluxo interno: chama `useContext(ERPContext)`.
- Paginas consumidoras: `AdminPagamentos`, `ClientesCRM`, `Configuracoes`, `Dashboard`, `Estoque`, `Financeiro`, `Fornecedores`, `Insumos`, `PerdasDoacoes`, `Producao`, `Produtos`, `Relatorios`, `UsuariosEmpresa`, `Vendas`.
- Componentes consumidores: `AdminRoute`, `EmpresaPermissionRoute`, `EmpresaSwitcher`, `Sidebar`.
- Dependencias: `react`, `ERPContextBase`.

### `useToast`

- Parametros: nenhum.
- Retorno: `{ showToast }`.
- Fluxo interno: chama `useContext(ToastContext)`.
- Paginas consumidoras: `AceitarConvite`, `AdminClientes`, `AdminPagamentos`, `ClientesCRM`, `Configuracoes`, `Financeiro`, `Fornecedores`, `Insumos`, `Login`, `ParametrosEmpresa`, `PerdasDoacoes`, `Planos`, `Producao`, `Produtos`, `Relatorios`, `UsuariosEmpresa`, `Vendas`.
- Componentes/contexts consumidores: `AdminRoute`, `EmpresaSwitcher`, `ERPContext`.
- Dependencias: `react`, `ToastContextBase`.

### `useConfirmacao`

- Parametros: nenhum.
- Retorno: `{ confirmar }`.
- Fluxo interno: chama `useContext(ConfirmContext)`.
- Paginas consumidoras: `ClientesCRM`, `Financeiro`, `Fornecedores`, `Insumos`, `PerdasDoacoes`, `Producao`, `Produtos`, `UsuariosEmpresa`, `Vendas`.
- Dependencias: `react`, `ConfirmContextBase`.

### `usePlano`

- Parametros: nenhum.
- Retorno: objeto com assinatura normalizada, plano atual, nivel, status, limites e flags de capacidade.
- Fluxo interno:

```txt
useERP()
  -> combina assinaturaUsuario com assinaturaGratisPadrao
  -> identifica usuario convidado de empresa
  -> busca config do plano
  -> calcula limites efetivos
  -> libera flags por admin master, convidado ou assinatura ativa
```

- Paginas consumidoras: `ClientesCRM`, `Configuracoes`, `Financeiro`, `Planos`, `Relatorios`, `UsuariosEmpresa`, `Vendas`.
- Componentes consumidores: `App`, `EmpresaSwitcher`, `PlanoRoute`, `Sidebar`.
- Dependencias: `useERP`, `src/config/planos.js`.

### `useParametros`

- Parametros: nenhum.
- Retorno: `unidadesMedida`, `tiposProduto`, `categoriasDespesa`, `adicionarParametro`, `editarParametro`, `desativarParametro`, `excluirParametro`.
- Fluxo interno:

```txt
useERP(user, empresaId, empresaOwnerUid)
  -> monta doc users/{ownerUid}/empresas/{empresaId}/parametros/{paramType}
  -> onSnapshot por grupo
  -> se nao existe, usa default e tenta setDoc inicial
  -> funcoes atualizam array inteiro com setDoc merge
```

- Paginas consumidoras: `Financeiro`, `Insumos`, `ParametrosEmpresa`, `Produtos`.
- Dependencias: `Firebase Firestore`, `useERP`, `useToast`.

### `useTableSort`

- Parametros: `ordenacaoInicial`.
- Retorno: `ordenacao`, `ordenar`, `ordenarPor`, `indicador`, `ativo`.
- Fluxo interno:

```txt
estado ordenacao
  -> ordenarPor(chave) alterna direcao/chave
  -> ordenar(lista, getValor) delega para sortUtils
  -> indicador(chave) retorna seta textual
  -> ativo(chave) informa coluna ativa
```

- Paginas consumidoras: `AdminClientes`, `ClientesCRM`, `Dashboard`, `Estoque`, `Financeiro`, `Insumos`, `PerdasDoacoes`, `Producao`, `Produtos`, `Relatorios`.
- Dependencias: `src/utils/sortUtils.js`.

## Diagramas ASCII

### Fluxo de renderizacao da aplicacao

```txt
index.html
  -> src/main.jsx
      -> React.StrictMode
          -> ToastProvider
              -> ConfirmProvider
                  -> App
                      -> BrowserRouter
                          -> rota publica /aceitar-convite/:token
                          -> Login, se sem usuario
                          -> ERPProvider, se autenticado
                              -> AuthenticatedApp
                                  -> Sidebar
                                  -> main.app-main
                                      -> Routes privadas
```

### Fluxo do login

```txt
Login
  -> usuario envia email/senha
  -> Firebase Auth
      -> signInWithEmailAndPassword OU createUserWithEmailAndPassword
      -> onAuthStateChanged em App
          -> user deixa de ser null
          -> ERPProvider monta
              -> prepara users/{uid}
              -> carrega assinatura e empresas
              -> abre area autenticada
```

### Fluxo do ERPProvider

```txt
Auth usuario
  -> reset de estados
  -> prepararUsuario()
      -> setDoc users/{uid}
      -> getDoc assinatura
      -> getDocs empresas proprias
      -> getDocs vinculos
      -> cria assinatura padrao quando aplicavel
  -> carregarEmpresas()
      -> cria Minha Empresa se necessario
      -> garante dono em usuariosEmpresa
      -> seleciona empresa ativa
  -> listeners
      -> perfil global
      -> assinatura
      -> usuariosEmpresa
      -> colecoes permitidas
      -> configuracoes
  -> expose value para paginas
```

### Fluxo de navegacao entre modulos

```txt
Sidebar
  -> calcula menu por permissao + plano
  -> NavLink
      -> React Router
          -> EmpresaPermissionRoute
              -> PlanoRoute, quando modulo depende de plano
                  -> Pagina
```

### Dependencias entre paginas

```txt
Dashboard <- vendas, producoes, insumos, despesas
Estoque <- insumos, produtos, producoes, vendas, perdasDoacoes
Produtos <- insumos, produtos, parametros
Producao <- produtos, insumos, producoes, vendas, perdasDoacoes
Vendas <- produtos, producoes, perdasDoacoes, clientesComerciais, configuracoes
Financeiro <- vendas, despesas, categoriasDespesa
Relatorios <- quase todas as colecoes operacionais
ClientesCRM <- clientesComerciais, vendas
UsuariosEmpresa <- usuariosEmpresa, assinatura/plano
Configuracoes -> afeta Sidebar, Vendas PDF, Relatorios PDF e tema global
Planos -> afeta usePlano e guardas de modulo apos assinatura atualizada
```

### Dependencias entre componentes

```txt
App
  -> Sidebar
      -> EmpresaSwitcher
  -> AdminRoute
  -> EmpresaPermissionRoute
  -> PlanoRoute
  -> Paginas
      -> ActionMenu

ToastProvider
  -> Toast

ConfirmProvider
  -> dialog global inline
```

### Dependencias entre contexts

```txt
ToastProvider
  -> disponibiliza showToast
  -> ERPProvider usa showToast
  -> paginas usam showToast

ConfirmProvider
  -> disponibiliza confirmar
  -> paginas de mutacao usam confirmar

ERPProvider
  -> depende de Firebase Auth/Firestore
  -> depende de ToastContext para erros
  -> alimenta useERP
  -> alimenta usePlano indiretamente
  -> alimenta useParametros indiretamente
```

### Dependencias entre hooks

```txt
useERP
  -> ERPContext

usePlano
  -> useERP
  -> config/planos

useParametros
  -> useERP
  -> useToast
  -> Firestore parametros

useToast
  -> ToastContext

useConfirmacao
  -> ConfirmContext

useTableSort
  -> utils/sortUtils
```

## Matriz de dependencias

| Arquivo | Utiliza | E utilizado por |
| --- | --- | --- |
| `src/main.jsx` | `App`, `ToastProvider`, `ConfirmProvider`, `index.css` | `index.html` |
| `src/App.jsx` | Router, Firebase Auth, `ERPProvider`, guardas, `Sidebar`, todas as paginas privadas/publicas | `main.jsx` |
| `src/firebase.js` | Firebase SDK | `App`, `ERPContext`, `Login`, `AceitarConvite`, `AdminClientes`, `AdminPagamentos`, `Fornecedores`, `Planos`, `Sidebar`, `useParametros` |
| `src/context/ERPContext.jsx` | Firestore, Auth, `useToast`, configs de planos/perfis | `App` |
| `src/context/ERPContextBase.js` | `createContext` | `ERPContext`, `useERP` |
| `src/context/useERP.js` | `ERPContextBase` | paginas operacionais, guardas, `Sidebar`, `EmpresaSwitcher`, hooks `usePlano` e `useParametros` |
| `src/context/ToastContext.jsx` | `Toast`, `ToastContextBase` | `main.jsx` |
| `src/context/ToastContextBase.js` | `createContext` | `ToastContext`, `useToast` |
| `src/context/useToast.js` | `ToastContextBase` | paginas, componentes de guarda, `ERPContext` |
| `src/context/ConfirmContext.jsx` | `ConfirmContextBase` | `main.jsx` |
| `src/context/ConfirmContextBase.js` | `createContext` | `ConfirmContext`, `useConfirmacao` |
| `src/context/useConfirmacao.js` | `ConfirmContextBase` | paginas com acoes destrutivas/irreversiveis |
| `src/hooks/usePlano.js` | `useERP`, config de planos | `App`, `Sidebar`, `PlanoRoute`, `EmpresaSwitcher`, `Planos`, `Vendas`, `Relatorios`, `Financeiro`, `Configuracoes`, `UsuariosEmpresa`, `ClientesCRM` |
| `src/hooks/useParametros.js` | Firestore, `useERP`, `useToast` | `ParametrosEmpresa`, `Produtos`, `Insumos`, `Financeiro` |
| `src/hooks/useTableSort.js` | `sortUtils` | tabelas em AdminClientes, CRM, Dashboard, Estoque, Financeiro, Insumos, Perdas, Producao, Produtos, Relatorios |
| `src/components/ActionMenu.jsx` | React state/effects, `MoreVertical` | paginas com acoes em tabela/lista |
| `src/components/AdminRoute.jsx` | `useERP`, `useToast`, `Navigate` | `App` |
| `src/components/EmpresaPermissionRoute.jsx` | `useERP`, `ShieldX` | `App` |
| `src/components/EmpresaSwitcher.jsx` | `useERP`, `useToast`, `usePlano` | `Sidebar` |
| `src/components/PlanoRoute.jsx` | `usePlano`, `useNavigate` | `App` |
| `src/components/Sidebar.jsx` | Router, Auth, `EmpresaSwitcher`, `useERP`, `usePlano`, permissoes | `AuthenticatedApp` |
| `src/components/Toast.jsx` | React effect | `ToastProvider` |
| `src/pages/AceitarConvite.jsx` | Auth, Firestore, backend convites, `Login`, `useToast` | `App` |
| `src/pages/AdminClientes.jsx` | Firestore admin, `ActionMenu`, `useToast`, `useTableSort`, config planos | `App` via `AdminRoute` |
| `src/pages/AdminPagamentos.jsx` | Firestore admin, backend admin, `useERP`, `useToast` | `App` via `AdminRoute` |
| `src/pages/CentralAprendizagem.jsx` | dados estaticos, Router Link, icones | `App` |
| `src/pages/ClientesCRM.jsx` | `ActionMenu`, `useERP`, `useToast`, `useConfirmacao`, `usePlano`, `useTableSort` | `App` via `PlanoRoute` |
| `src/pages/Configuracoes.jsx` | `useERP`, `useToast`, `usePlano`, permissoes | `App` |
| `src/pages/Dashboard.jsx` | `useERP`, `useTableSort`, Recharts, formatadores | `App` |
| `src/pages/Estoque.jsx` | `useERP`, `useTableSort`, `ActionMenu`, formatadores | `App` |
| `src/pages/Financeiro.jsx` | `useERP`, `useToast`, `useConfirmacao`, `usePlano`, `useParametros`, `useTableSort`, `ActionMenu` | `App` |
| `src/pages/Fornecedores.jsx` | Firestore direto, `ActionMenu`, `useERP`, `useToast`, `useConfirmacao` | `App` |
| `src/pages/Insumos.jsx` | `useERP`, `useToast`, `useConfirmacao`, `useParametros`, `useTableSort`, `ActionMenu` | `App` |
| `src/pages/Login.jsx` | Firebase Auth, `useToast`, logo | `App`, `AceitarConvite` |
| `src/pages/PagamentoRetorno.jsx` | Router Link, icones | `App` |
| `src/pages/ParametrosEmpresa.jsx` | `useParametros`, `useToast`, icones | `App` |
| `src/pages/PerdasDoacoes.jsx` | `useERP`, `useToast`, `useConfirmacao`, `useTableSort`, `ActionMenu`, util estoque | `App` |
| `src/pages/Planos.jsx` | backend pagamentos, Firebase Auth, `usePlano`, `useToast`, config planos | `App`, `PlanoRoute` por navegacao |
| `src/pages/Producao.jsx` | `useERP`, `useToast`, `useConfirmacao`, `useTableSort`, `ActionMenu` | `App` |
| `src/pages/Produtos.jsx` | `useERP`, `useToast`, `useConfirmacao`, `useParametros`, `useTableSort`, `ActionMenu` | `App` |
| `src/pages/Relatorios.jsx` | `useERP`, `useToast`, `usePlano`, `useTableSort`, `jsPDF`, `autoTable`, util estoque | `App` via `PlanoRoute` |
| `src/pages/Suporte.jsx` | Router Link, icones, links externos | `App` |
| `src/pages/UsuariosEmpresa.jsx` | `useERP`, `useToast`, `useConfirmacao`, `usePlano`, `ActionMenu`, perfis | `App` |
| `src/pages/Vendas.jsx` | `useERP`, `useToast`, `useConfirmacao`, `usePlano`, `ActionMenu`, `html2pdf`, util estoque | `App` via `PlanoRoute` |

## Analise arquitetural

### Componentes mais reutilizados

- `ActionMenu`: aparece nas telas com listas editaveis e concentra o padrao de acoes por linha.
- `EmpresaPermissionRoute`: envolve a maior parte das rotas privadas e e o principal ponto de autorizacao por perfil de empresa.
- `PlanoRoute`: menos usado, mas critico para separar capacidade comercial por plano.
- `Sidebar`: centraliza navegacao, permissoes visuais, white label e troca de empresa.
- `Toast`: usado indiretamente por quase todos os fluxos de erro/sucesso.

### Paginas mais complexas

- `Vendas.jsx`: combina estoque, precificacao, margem, CRM, pagamento, expedicao, limite de plano e PDF.
- `Relatorios.jsx`: agrega quase todas as colecoes e possui muita logica de consolidacao e geracao de PDF.
- `Produtos.jsx`: mistura cadastro, ficha tecnica, custo industrial, fiscal, composicao e margem.
- `AdminPagamentos.jsx`: tem fallback backend/Firestore, diagnostico tecnico e limpeza administrativa.
- `ClientesCRM.jsx`: calcula metricas comportamentais a partir do historico de vendas.
- `ERPContext.jsx`: embora nao seja pagina, e o arquivo mais central e mais acoplado do front-end.

### Arquivos com maior acoplamento

- `src/context/ERPContext.jsx`: conhece Auth, Firestore, planos, perfis, empresas, usuarios, convites, configuracoes e CRUD generico.
- `src/App.jsx`: importa todas as paginas e todos os wrappers de rota.
- `src/pages/Vendas.jsx`: depende de muitas colecoes e impacta varios modulos.
- `src/pages/Relatorios.jsx`: depende de praticamente todos os dados operacionais.
- `src/pages/Produtos.jsx`: depende de insumos, produtos, parametros, fiscal e regras industriais.
- `src/components/Sidebar.jsx`: conhece permissoes, planos, white label, auth e estrutura de navegacao.

### Candidatos a modularizacao

- Extrair de `ERPContext.jsx` hooks/services dedicados:
  - `useEmpresas`;
  - `useUsuariosEmpresa`;
  - `useConvitesEmpresa`;
  - `useColecoesOperacionais`;
  - `useConfiguracoesEmpresa`.
- Extrair de `Vendas.jsx`:
  - calculo de pedido;
  - calculo de estoque disponivel;
  - PDF de pedido;
  - edicao de pagamento/expedicao.
- Extrair de `Relatorios.jsx`:
  - engine de indicadores;
  - filtros por periodo/cliente;
  - geradores de PDF por tipo.
- Extrair de `Produtos.jsx`:
  - calculo de custo unitario;
  - normalizacao fiscal;
  - componentes/ficha tecnica.
- Unificar acesso Firestore de `Fornecedores.jsx` com o padrao do `ERPProvider` ou criar provider proprio de fornecedores.
- Criar componentes de formulario/tabela para reduzir repeticao entre cadastros.

### Pontos da arquitetura que merecem atencao

- O `ERPProvider` e um ponto unico de falha e crescimento. Qualquer mudanca em Auth, empresas, permissoes ou colecoes pode afetar grande parte da aplicacao.
- Ha mistura de padroes de acesso a dados: a maioria usa `ERPProvider`, mas `Fornecedores`, `AdminClientes`, `AdminPagamentos`, `AceitarConvite` e `useParametros` acessam Firestore diretamente.
- Rotas de permissao ficam no `App`, mas algumas paginas tambem aplicam regras internas. Isso e bom para UX, mas precisa manter consistencia com regras do Firestore/backend.
- Calculos de estoque aparecem em varias telas. Ja existem utilitarios em `utils/estoqueProdutos.js`, mas ainda ha logica de dominio distribuida.
- PDF e relatorios estao fortemente acoplados a componentes de pagina; isso dificulta testes e reaproveitamento.
- O estado de formularios grandes vive nas paginas. Para reduzir risco de regressao, telas como `Vendas`, `Produtos` e `Relatorios` merecem testes de regras puras extraidas.
- Algumas strings do codigo indicam encoding corrompido. Antes de grandes refatoracoes, vale padronizar codificacao dos arquivos para UTF-8.
