export const categoriasAprendizagem = [
  {
    id: "primeiros-passos",
    titulo: "Primeiros Passos",
    descricao:
      "Comece pela empresa, parametros, insumos, produtos, producao e primeira venda.",
  },
  {
    id: "operacional",
    titulo: "Operacional",
    descricao:
      "Entenda compras de insumos, ficha tecnica, producao e estoque calculado.",
  },
  {
    id: "comercial",
    titulo: "Comercial",
    descricao:
      "Cadastre clientes no CRM e transforme produtos disponiveis em pedidos de venda.",
  },
  {
    id: "financeiro",
    titulo: "Financeiro",
    descricao:
      "Acompanhe entradas das vendas, despesas, fluxo de caixa, saldo e DRE por plano.",
  },
  {
    id: "gestao",
    titulo: "Gestao",
    descricao:
      "Use Dashboard, relatorios e indicadores para enxergar vendas, producao e margem.",
  },
  {
    id: "usuarios-permissoes",
    titulo: "Usuarios e Permissoes",
    descricao:
      "Convide usuarios, defina perfis e respeite os limites do plano ativo.",
  },
  {
    id: "parametros-empresa",
    titulo: "Parametros da Empresa",
    descricao:
      "Padronize unidades, tipos de produto e categorias financeiras por empresa.",
  },
  {
    id: "checklist-implantacao",
    titulo: "Checklist de Implantacao",
    descricao:
      "12 topicos para implantar a empresa com cadastros, vendas e indicadores validados.",
  },
  {
    id: "faq",
    titulo: "FAQ",
    descricao:
      "Respostas objetivas sobre vendas, estoque, financeiro, planos e acessos.",
  },
];

export const primeirosPassos = [
  {
    titulo: "Como configurar a empresa",
    categoria: "Primeiros Passos",
    resumo:
      "Cadastre os dados da empresa ativa para aparecerem em relatorios, PDFs e identidade do sistema.",
    objetivo:
      "Preparar a empresa para operar com informacoes corretas em documentos e telas internas.",
    acesso: "Menu Conta > Configuracoes.",
    conteudo:
      "A tela Configuracoes salva nome, CNPJ, cidade/UF, telefone e e-mail da empresa ativa. Nos planos com personalizacao, tambem permite carregar logo, definir nome do sistema e ajustar cores principais.",
    camposPrincipais: [
      "Nome da empresa, CNPJ, cidade/UF, telefone e e-mail.",
      "Logo da empresa em imagem pequena, quando o plano permite personalizacao.",
      "Nome do sistema e cores de tema para empresas com recurso de personalizacao.",
    ],
    passos: [
      "Abra Conta > Configuracoes.",
      "Preencha os dados cadastrais da empresa ativa.",
      "Se o plano permitir, carregue uma logo menor que 500KB.",
      "Se usar white label, ajuste nome do sistema, cor principal, cor da lateral e cor dos botoes.",
      "Clique em Salvar Configuracoes.",
    ],
    aposSalvar: [
      "Os dados passam a alimentar relatorios e PDFs gerados pelo sistema.",
      "A logo e o nome personalizado podem aparecer na identidade visual do ERP conforme o plano.",
    ],
    cuidados: [
      "A configuracao e isolada por empresa; confira a empresa ativa antes de salvar.",
      "Personalizacao visual e logo dependem do plano liberado.",
    ],
    exemplos: [
      "Use o nome fantasia da empresa e uma logo leve para melhorar os PDFs enviados a clientes.",
    ],
  },
  {
    titulo: "Como configurar parametros da empresa",
    categoria: "Primeiros Passos",
    resumo:
      "Defina listas usadas nos cadastros: unidades de medida, tipos de produto e categorias de despesa.",
    objetivo:
      "Padronizar dados antes de cadastrar insumos, produtos e despesas.",
    acesso: "Menu Conta > Parametros Empresa.",
    conteudo:
      "Parametros sao listas locais da empresa ativa. Eles aparecem em telas como Insumos, Produtos e Financeiro, evitando digitacao solta e mantendo os lancamentos consistentes.",
    camposPrincipais: [
      "Unidades de Medida: kg, g, un, litro ou outras unidades de insumo.",
      "Tipos de Produto: usados para orientar ficha tecnica e formato do produto final.",
      "Categorias de Despesa: usadas no Financeiro e no DRE.",
    ],
    passos: [
      "Abra Parametros Empresa.",
      "Escolha a aba Unidades de Medida, Tipos de Produto ou Categorias de Despesa.",
      "Digite o novo parametro e clique em Adicionar.",
      "Use Editar para corrigir nomes e Desativar para ocultar dos novos cadastros.",
    ],
    aposSalvar: [
      "Parametros ativos ficam disponiveis nos selects das telas relacionadas.",
      "Parametros inativos permanecem no historico, mas deixam de ser opcoes para novos registros.",
    ],
    cuidados: [
      "Evite excluir parametros ja usados em registros antigos.",
      "Padronize nomes antes de treinar a equipe para evitar duplicidade.",
    ],
    exemplos: [
      "Cadastre unidades como kg, g, ml e un antes de criar insumos.",
      "Cadastre categorias como Embalagem, Marketing e Administrativo antes de lancar despesas.",
    ],
  },
  {
    titulo: "Como cadastrar insumos e compras",
    categoria: "Primeiros Passos",
    resumo:
      "Insumos sao materias-primas. Compras geram custo medio e estoque disponivel para producao.",
    objetivo:
      "Registrar materiais, entrada por compra e custo medio real usado na ficha tecnica e producao.",
    acesso: "Menu Operacao > Insumos.",
    conteudo:
      "A tela Insumos separa o cadastro do material do historico de compras. O estoque real do insumo e recalculado automaticamente por compras menos consumo das producoes.",
    camposPrincipais: [
      "Novo Insumo: nome e unidade.",
      "Registrar Compra: insumo, data, quantidade comprada e valor total.",
      "Tabela: total comprado, total consumido, estoque atual, custo medio e valor em estoque.",
    ],
    passos: [
      "Cadastre o insumo com nome e unidade.",
      "Registre cada compra informando data, quantidade e valor total.",
      "Confira se o custo medio calculado esta coerente.",
      "Acompanhe a tabela de estoque de insumos para ver consumo e saldo.",
    ],
    aposSalvar: [
      "Compras aumentam o total comprado e afetam o custo medio.",
      "Producoes posteriores consomem os insumos conforme a ficha tecnica do produto.",
    ],
    cuidados: [
      "Se a compra for lancada com valor ou quantidade errada, o custo medio do produto tambem fica errado.",
      "Insumos com estoque zero aparecem em alerta no Dashboard e Estoque.",
    ],
    exemplos: [
      "Se comprar 10 kg de parafina por R$ 300, o custo medio sera R$ 30 por kg.",
    ],
  },
  {
    titulo: "Como cadastrar produtos e ficha tecnica",
    categoria: "Primeiros Passos",
    resumo:
      "Produtos usam consumo de insumos para calcular custo, lucro, margem e preco unitario.",
    objetivo:
      "Montar produtos vendaveis com custo calculado a partir dos insumos cadastrados.",
    acesso: "Menu Operacao > Produtos.",
    conteudo:
      "Produtos possuem codigo, nome, tipo, quantidade produzida, preco de venda e consumo de insumos. A ficha tecnica calcula custo unitario, custo de producao, lucro, margem e valor unitario.",
    camposPrincipais: [
      "Codigo, nome do produto, tipo de produto e categoria/tipo.",
      "Data de cadastro, peso/volume, conteudo por produto ou quantidade por embalagem.",
      "Quantidade produzida, preco de venda e consumo de cada insumo.",
    ],
    passos: [
      "Cadastre insumos e compras antes de criar produtos.",
      "Abra Produtos / Ficha Tecnica.",
      "Preencha dados do produto e o preco de venda.",
      "Informe o consumo de cada insumo usado na producao.",
      "Confira Resultado da Ficha Tecnica e clique em Salvar Produto.",
    ],
    aposSalvar: [
      "O produto fica disponivel para registrar producao.",
      "Os custos e margens do produto servem de base para vendas, estoque e relatorios.",
    ],
    cuidados: [
      "Produto sem consumo correto gera margem enganosa.",
      "Tipo de produto errado pode confundir unidade, embalagem e custo final.",
    ],
    exemplos: [
      "Uma caixa de velas pode consumir parafina, essencia, pavio e embalagem na ficha tecnica.",
    ],
  },
  {
    titulo: "Como realizar a primeira producao",
    categoria: "Primeiros Passos",
    resumo:
      "Producao transforma ficha tecnica em produto acabado e consome insumos do estoque.",
    objetivo:
      "Registrar fabricacao real para formar estoque disponivel para venda.",
    acesso: "Menu Operacao > Producao.",
    conteudo:
      "A producao seleciona um produto cadastrado, quantidade e data. O sistema calcula consumo total de insumos, custo total e custo unitario antes de salvar.",
    camposPrincipais: [
      "Produto, quantidade produzida e data.",
      "Previa com custo total, custo unitario e consumo de insumos.",
      "Historico de Producao com data, produto, quantidade e custos.",
    ],
    passos: [
      "Abra Producao.",
      "Selecione o produto pela lista ordenada por codigo.",
      "Informe quantidade produzida e data.",
      "Confira a previa de consumo e status de estoque.",
      "Clique em Registrar Producao.",
    ],
    aposSalvar: [
      "A producao entra no historico.",
      "O estoque de produto acabado aumenta.",
      "O estoque dos insumos e recalculado pelo consumo da producao.",
    ],
    cuidados: [
      "O sistema bloqueia producao quando falta insumo, exceto Energia, que entra como custo.",
      "Excluir uma producao remove seu efeito do historico e altera os saldos calculados.",
    ],
    exemplos: [
      "Ao produzir 50 unidades, o estoque de produto acabado aumenta em 50 e os insumos definidos na ficha tecnica sao consumidos.",
    ],
  },
  {
    titulo: "Como realizar a primeira venda",
    categoria: "Primeiros Passos",
    resumo:
      "Venda ideal comeca no CRM: cadastre o cliente, selecione na venda, adicione itens e finalize o pedido.",
    objetivo:
      "Registrar pedidos com cliente, itens, margem, desconto, pagamento e expedicao.",
    acesso: "Menu Comercial > CRM e depois Comercial > Vendas.",
    conteudo:
      "No fluxo real do Renovar ERP, o cliente deve estar na Carteira de Clientes para ser selecionado no pedido. A venda usa produtos com estoque calculado a partir das producoes e registra total, custo, lucro, margem, pagamento e status de expedicao.",
    camposPrincipais: [
      "Cliente cadastrado, cliente do pedido e data.",
      "Status de pagamento: pendente, pago, parcial ou cancelado.",
      "Forma de pagamento: pix, dinheiro, cartao, boleto, transferencia ou outro.",
      "Item: produto, quantidade, margem desejada, valor unitario e desconto.",
      "Resumo: bruto, desconto, total, custo, lucro e margem.",
    ],
    passos: [
      "Cadastre o cliente em Comercial > CRM.",
      "Abra Comercial > Vendas.",
      "Selecione o cliente da carteira; o nome e telefone sao puxados para o pedido.",
      "Informe a data e os dados de pagamento.",
      "Selecione um produto com saldo, informe quantidade, margem desejada e aplique margem se quiser preco sugerido.",
      "Ajuste valor unitario e desconto se necessario.",
      "Clique em Adicionar Item e revise o resumo.",
      "Clique em Finalizar Pedido.",
    ],
    aposSalvar: [
      "O pedido recebe numero automatico PED-0001, PED-0002 e assim por diante.",
      "O historico de pedidos, expedicao, Dashboard, CRM e Financeiro passam a considerar a venda.",
      "O estoque de produtos acabados considera a venda como saida no calculo produzido menos vendido.",
    ],
    cuidados: [
      "A venda valida estoque disponivel e impede vender quantidade maior que o saldo.",
      "Venda com pagamento pendente aparece como A Receber no Financeiro; venda paga entra em Entradas Recebidas.",
      "Pedido cancelado deve ter status ajustado para nao distorcer a leitura comercial.",
    ],
    exemplos: [
      "Cliente Maria compra 2 caixas. O usuario seleciona Maria no CRM, adiciona 2 caixas, aplica margem de 40%, registra PIX pago e finaliza o pedido.",
    ],
  },
];

export const tutoriaisPorModulo = [
  {
    modulo: "Dashboard",
    categoria: "Gestao",
    descricao:
      "Painel executivo com faturamento, lucro, saldo, ticket medio, graficos, ranking de produtos e ultimos pedidos.",
    objetivo:
      "Dar uma leitura rapida da operacao sem precisar abrir cada modulo.",
    acesso: "Menu Principal > Dashboard.",
    camposPrincipais: [
      "Faturamento: soma do total das vendas.",
      "Lucro: soma do lucro registrado nos pedidos.",
      "Saldo: faturamento menos despesas.",
      "Ticket medio: faturamento dividido pelo numero de pedidos.",
      "Status operacional: total de pedidos, pendentes, insumos zerados e total produzido.",
    ],
    passos: [
      "Abra o Dashboard apos registrar vendas, despesas, insumos e producoes.",
      "Confira os cards principais.",
      "Analise os graficos de faturamento por dia e producao por periodo.",
      "Use Lucro por Produto para identificar itens com melhor resultado.",
      "Confira os ultimos pedidos e status de expedicao.",
    ],
    aposSalvar: [
      "O Dashboard e atualizado a partir dos registros ja salvos em vendas, producao, insumos e financeiro.",
    ],
    cuidados: [
      "Se nao houver dados, os graficos e rankings aparecem vazios.",
      "Pedidos pendentes no Dashboard consideram expedicao diferente de Entregue.",
    ],
    exemplos: [
      "Depois de finalizar pedidos e lancar despesas, use o saldo para entender se o periodo esta positivo.",
    ],
  },
  {
    modulo: "CRM",
    categoria: "Comercial",
    descricao:
      "Carteira de clientes com cadastro, historico de compras, recompra inteligente e follow-up conforme o plano.",
    objetivo:
      "Organizar clientes e permitir selecionar clientes cadastrados na venda.",
    acesso: "Menu Comercial > CRM.",
    camposPrincipais: [
      "Nome, telefone, e-mail, documento, cidade, UF e endereco.",
      "Tipo de cliente: Final, Revendedor, Distribuidor ou Outro.",
      "Status de relacionamento, proxima acao, data da proxima acao e observacoes em planos com follow-up.",
      "Metricas: ultima compra, frequencia media, proxima compra, total comprado e ticket medio.",
    ],
    passos: [
      "Clique em Novo cliente.",
      "Preencha pelo menos o nome.",
      "Adicione telefone e documento para evitar duplicidade.",
      "Escolha o tipo de cliente.",
      "Se o plano liberar follow-up, registre proxima acao e observacoes.",
      "Salve o cliente.",
    ],
    aposSalvar: [
      "O cliente fica disponivel no select Cliente cadastrado da tela Vendas.",
      "As vendas vinculadas alimentam historico, total comprado, ticket medio e status de recompra.",
    ],
    cuidados: [
      "O sistema bloqueia cliente duplicado por nome ou telefone.",
      "Cliente com historico comercial nao deve ser excluido; use Desativar para preservar auditoria.",
      "CRM Comercial so aparece a partir do plano Basico.",
    ],
    exemplos: [
      "Cadastre uma revendedora com telefone. Depois, ao vender, selecione essa cliente na carteira para manter o historico de compras.",
    ],
  },
  {
    modulo: "Vendas",
    categoria: "Comercial",
    descricao:
      "Pedido com cliente, itens, margem desejada, desconto, pagamento, expedicao e historico.",
    objetivo:
      "Registrar vendas reais e alimentar estoque, CRM, financeiro, dashboard e DRE.",
    acesso: "Menu Comercial > Vendas.",
    camposPrincipais: [
      "Cliente cadastrado e cliente do pedido.",
      "Data do pedido.",
      "Status e forma de pagamento, data e observacao do pagamento.",
      "Produto, quantidade, margem desejada, valor unitario e desconto.",
      "Status de expedicao: Pendente, Separado, Enviado, Entregue ou Cancelado.",
    ],
    passos: [
      "Cadastre o cliente no CRM.",
      "Na venda, selecione o cliente da carteira.",
      "Informe data e dados de pagamento.",
      "Adicione um ou mais itens ao pedido.",
      "Use Aplicar margem para sugerir preco a partir do custo medio do produto.",
      "Revise bruto, desconto, total, custo, lucro e margem.",
      "Finalize o pedido.",
      "Acompanhe historico e area de expedicao.",
    ],
    aposSalvar: [
      "O pedido entra no historico com numero automatico.",
      "O estoque de produtos acabados reduz pelo calculo vendido.",
      "O CRM passa a considerar a compra no historico do cliente.",
      "O Financeiro cria uma entrada automatica da venda, como Recebido, Pendente, Parcial ou Cancelado.",
      "Dashboard e DRE passam a usar totais, custo, lucro e desconto da venda.",
    ],
    cuidados: [
      "Nao e possivel adicionar item acima do saldo disponivel.",
      "Desconto nao pode ser negativo nem maior que o valor bruto do item.",
      "Margem desejada deve ser maior que 0% e menor que 100%.",
      "PDF profissional do pedido depende do plano Profissional.",
    ],
    exemplos: [
      "Pedido PED-0007: cliente Joao, 3 unidades, margem desejada de 35%, R$ 10 de desconto, PIX pago e expedicao Pendente.",
    ],
  },
  {
    modulo: "Insumos",
    categoria: "Operacional",
    descricao:
      "Cadastro de materias-primas, compras, custo medio, estoque real e historico de compras.",
    objetivo:
      "Controlar materias-primas que alimentam a ficha tecnica e a producao.",
    acesso: "Menu Operacao > Insumos.",
    camposPrincipais: [
      "Nome e unidade do insumo.",
      "Compra: insumo, data, quantidade comprada e valor total.",
      "Indicadores: total comprado, total consumido, estoque atual, custo medio e valor em estoque.",
    ],
    passos: [
      "Cadastre o insumo.",
      "Registre compras com quantidade e valor total.",
      "Confira custo medio e estoque atual.",
      "Use o historico para editar ou excluir compras quando houver erro.",
    ],
    aposSalvar: [
      "Compras aumentam o estoque e formam o custo medio.",
      "Producoes consomem insumos e reduzem o estoque real automaticamente.",
    ],
    cuidados: [
      "Unidades de medida vem dos Parametros da Empresa.",
      "Custo medio incorreto impacta produto, producao, vendas e DRE.",
    ],
    exemplos: [
      "Cadastre Essencia em ml e registre cada compra para o custo medio acompanhar variacao de preco.",
    ],
  },
  {
    modulo: "Produtos",
    categoria: "Operacional",
    descricao:
      "Ficha tecnica que transforma consumo de insumos em custo, lucro, margem e preco de venda.",
    objetivo:
      "Criar produtos que possam ser produzidos, vendidos e analisados por margem.",
    acesso: "Menu Operacao > Produtos.",
    camposPrincipais: [
      "Codigo, nome, tipo de produto, categoria/tipo e data.",
      "Peso/volume, conteudo por produto, quantidade produzida e preco de venda.",
      "Consumo de insumos por unidade ou por produto final.",
    ],
    passos: [
      "Configure tipos de produto em Parametros Empresa.",
      "Preencha dados do produto.",
      "Informe consumo de cada insumo.",
      "Confira custo unitario, custo de producao, lucro, margem e valor unitario.",
      "Salve o produto.",
    ],
    aposSalvar: [
      "O produto fica disponivel para Producao.",
      "Margem e custo passam a aparecer nos cadastros, vendas e relatorios.",
    ],
    cuidados: [
      "Produtos nao entram no estoque apenas por cadastro; e necessario registrar Producao.",
      "Consumos zerados podem deixar custo artificialmente baixo.",
    ],
    exemplos: [
      "Produto VELA-001 com consumo de parafina, pavio e essencia gera custo de producao e margem calculada automaticamente.",
    ],
  },
  {
    modulo: "Producao",
    categoria: "Operacional",
    descricao:
      "Registro de fabricacao com calculo de consumo de insumos e custo real da producao.",
    objetivo:
      "Gerar estoque de produto acabado e baixar insumos conforme a ficha tecnica.",
    acesso: "Menu Operacao > Producao.",
    camposPrincipais: [
      "Produto, quantidade produzida e data.",
      "Previa de consumo de insumos, estoque atual, custo medio e status.",
      "Historico com custo total e custo unitario.",
    ],
    passos: [
      "Selecione o produto.",
      "Informe quantidade e data.",
      "Confira se todos os insumos estao OK.",
      "Registre a producao.",
    ],
    aposSalvar: [
      "A quantidade produzida aumenta o saldo de produto acabado.",
      "Os insumos usados sao considerados como consumidos no estoque real.",
      "O custo da producao alimenta estoque e venda.",
    ],
    cuidados: [
      "Falta de insumo bloqueia a producao, exceto Energia, que e tratada como custo.",
      "Excluir producao altera estoque e historico.",
    ],
    exemplos: [
      "Ao produzir 100 unidades, o custo total e dividido para formar custo unitario usado nas vendas.",
    ],
  },
  {
    modulo: "Estoque",
    categoria: "Operacional",
    descricao:
      "Visao de insumos e produtos acabados, alertas, valor em estoque e estoque minimo por produto.",
    objetivo:
      "Acompanhar disponibilidade para producao e venda.",
    acesso: "Menu Operacao > Estoque.",
    camposPrincipais: [
      "Valor em insumos e valor de produto acabado.",
      "Produtos em alerta e insumos zerados.",
      "Estoque de insumos: estoque, custo medio, valor e status.",
      "Estoque de produtos: produzido, vendido, saldo, custo medio, valor e minimo.",
    ],
    passos: [
      "Abra Estoque depois de registrar compras, producoes e vendas.",
      "Confira alertas de produtos e insumos.",
      "Edite estoque minimo dos produtos quando quiser receber alerta.",
      "Use saldo de produto acabado para planejar novas producoes.",
    ],
    aposSalvar: [
      "Estoque minimo salvo passa a ser usado nos alertas da tela.",
      "Saldos sao calculados a partir dos registros existentes.",
    ],
    cuidados: [
      "Produto acabado e calculado como produzido menos vendido.",
      "Insumo e calculado por compras menos consumo de producoes.",
    ],
    exemplos: [
      "Se produziu 50 caixas e vendeu 12, o saldo de produto acabado sera 38 caixas.",
    ],
  },
  {
    modulo: "Financeiro",
    categoria: "Financeiro",
    descricao:
      "Fluxo de caixa com entradas automaticas das vendas, despesas manuais, saldo e DRE quando liberado.",
    objetivo:
      "Entender caixa, contas a receber, despesas e resultado da empresa.",
    acesso: "Menu Gestao > Financeiro.",
    camposPrincipais: [
      "Filtros por periodo.",
      "Entradas Recebidas, A Receber, Saidas, Saldo e Ticket Medio.",
      "Despesa: descricao, categoria, valor, data e status Pago/Pendente.",
      "Fluxo de Caixa e Despesas Cadastradas.",
      "DRE com receita, descontos, custos, despesas e resultado quando o plano permite.",
    ],
    passos: [
      "Use filtros de inicio e fim para analisar um periodo.",
      "Confira entradas recebidas e valores a receber.",
      "Cadastre despesas com categoria, valor, data e status.",
      "Acompanhe fluxo de caixa.",
      "Se o plano permitir, leia o DRE na mesma tela.",
    ],
    aposSalvar: [
      "Despesas entram como Saida no fluxo de caixa.",
      "Vendas entram automaticamente como Entrada, usando data de pagamento ou data da venda.",
      "DRE usa vendas, descontos, custo dos produtos vendidos e despesas.",
    ],
    cuidados: [
      "Venda pendente nao entra em Entradas Recebidas; entra em A Receber.",
      "Categorias de despesa vem dos Parametros da Empresa.",
      "DRE completo depende de plano Profissional ou superior.",
    ],
    exemplos: [
      "Uma venda paga de R$ 200 aparece como Entrada Recebida; uma despesa pendente de R$ 80 aparece em Despesas Pendentes.",
    ],
  },
  {
    modulo: "DRE",
    categoria: "Financeiro",
    descricao:
      "Demonstrativo de resultado com receita bruta, descontos, receita liquida, custos, despesas e resultado liquido.",
    objetivo:
      "Mostrar se a operacao esta gerando lucro depois de custos e despesas.",
    acesso: "Menu Gestao > Financeiro ou Gestao > Relatorios, conforme permissao e plano.",
    camposPrincipais: [
      "Receita Bruta.",
      "Descontos concedidos.",
      "Receita Liquida.",
      "Custo dos Produtos Vendidos.",
      "Lucro Bruto.",
      "Despesas Operacionais por categoria.",
      "Resultado Liquido, margem bruta e margem liquida.",
    ],
    passos: [
      "Registre vendas com custos e descontos corretos.",
      "Cadastre despesas no Financeiro.",
      "Use filtro de periodo.",
      "Abra o bloco DRE no Financeiro ou o relatorio DRE em Relatorios.",
    ],
    aposSalvar: [
      "O DRE e recalculado com base nas vendas e despesas filtradas.",
      "Relatorios em PDF dependem do recurso de PDF profissional.",
    ],
    cuidados: [
      "Se o DRE estiver bloqueado, confira se o plano atual libera o recurso.",
      "Custos incorretos em produtos e producao afetam diretamente o DRE.",
    ],
    exemplos: [
      "Receita liquida de R$ 1.000, custo de R$ 450 e despesas de R$ 200 geram resultado liquido de R$ 350.",
    ],
  },
  {
    modulo: "Usuarios da Empresa",
    categoria: "Usuarios e Permissoes",
    descricao:
      "Convites, perfis, status de usuarios, limite do plano e separacao entre empresa e Admin Master SaaS.",
    objetivo:
      "Controlar quem acessa a empresa ativa e quais modulos cada pessoa enxerga.",
    acesso: "Menu Conta > Usuarios da Empresa.",
    camposPrincipais: [
      "Novo usuario: nome, e-mail e perfil.",
      "Tabela: usuario, perfil, status, UID Auth, criado em, expira em e envio de e-mail.",
      "Acoes: enviar convite por e-mail, copiar link, gerar novo link, editar perfil, ativar/desativar e cancelar convite.",
    ],
    passos: [
      "Clique em Novo usuario.",
      "Informe nome, e-mail e perfil.",
      "Crie o convite.",
      "Envie por e-mail ou copie o link.",
      "Acompanhe o status Pendente ate o aceite.",
      "Depois do aceite, ajuste perfil ou status se necessario.",
    ],
    aposSalvar: [
      "O usuario fica como convite pendente ate aceitar pelo link.",
      "Ao aceitar, o usuario passa a ter UID Auth e acesso conforme o perfil.",
      "O contador de usuarios usados considera o dono da conta.",
    ],
    cuidados: [
      "Dono da empresa permanece como Administrador da Empresa.",
      "Admin Master SaaS e diferente de Administrador da Empresa.",
      "Limite de usuarios depende do plano ou de liberacao manual.",
      "Cada perfil enxerga apenas os modulos permitidos.",
    ],
    exemplos: [
      "Convide alguem do financeiro com perfil Financeiro para ver Dashboard, Financeiro e Relatorios, sem liberar Producao.",
    ],
  },
  {
    modulo: "Parametros da Empresa",
    categoria: "Parametros da Empresa",
    descricao:
      "Listas operacionais isoladas por empresa para padronizar cadastros e lancamentos.",
    objetivo:
      "Evitar nomes soltos e melhorar consistencia dos dados.",
    acesso: "Menu Conta > Parametros Empresa.",
    camposPrincipais: [
      "Unidades de Medida usadas em insumos, estoque e producao.",
      "Tipos de Produto usados no cadastro de produtos e ficha tecnica.",
      "Categorias de Despesa usadas nos lancamentos financeiros.",
    ],
    passos: [
      "Escolha a aba desejada.",
      "Adicione parametros ativos.",
      "Edite nomes quando necessario.",
      "Desative itens que nao devem mais aparecer.",
    ],
    aposSalvar: [
      "Os parametros ativos aparecem nos formularios relacionados.",
      "A configuracao nao interfere em outras empresas.",
    ],
    cuidados: [
      "Planeje os nomes antes de cadastrar dados em massa.",
      "Nao exclua parametros que ja fazem sentido historico.",
    ],
    exemplos: [
      "Categorias de despesa bem definidas deixam o DRE por categoria mais facil de interpretar.",
    ],
  },
  {
    modulo: "Planos",
    categoria: "Gestao",
    descricao:
      "Tela para consultar plano atual, recursos liberados, limites e opcoes de upgrade.",
    objetivo:
      "Entender quais modulos e limites estao disponiveis para a conta.",
    acesso: "Menu Conta > Planos.",
    camposPrincipais: [
      "Plano atual e status da assinatura.",
      "Recursos e limitacoes de Gratis, Basico, Profissional e Premium.",
      "Acoes de upgrade por cartao, PIX ou boleto conforme tela de planos.",
    ],
    passos: [
      "Abra Planos.",
      "Compare recursos e limitacoes.",
      "Verifique usuarios, empresas, vendas, CRM, DRE, PDF, relatorios e personalizacao.",
      "Escolha uma forma de pagamento se quiser fazer upgrade.",
    ],
    aposSalvar: [
      "Quando o pagamento e confirmado, o plano ativo libera recursos conforme configuracao.",
    ],
    cuidados: [
      "Plano Gratis nao tem Vendas nem CRM.",
      "DRE e PDF profissional entram no plano Profissional.",
      "Personalizacao completa e relatorios avancados entram no Premium.",
    ],
    exemplos: [
      "Se o usuario precisa vender e cadastrar clientes, o minimo funcional para Comercial e o plano Basico.",
    ],
  },
  {
    modulo: "Configuracoes",
    categoria: "Gestao",
    descricao:
      "Dados cadastrais, logo e personalizacao visual da empresa ativa.",
    objetivo:
      "Manter documentos e identidade visual alinhados com a empresa selecionada.",
    acesso: "Menu Conta > Configuracoes.",
    camposPrincipais: [
      "Dados da empresa.",
      "Logo da empresa.",
      "Nome do sistema e cores de tema quando o plano permite.",
    ],
    passos: [
      "Selecione a empresa correta no switcher.",
      "Abra Configuracoes.",
      "Atualize dados cadastrais.",
      "Se liberado, carregue logo e ajuste tema.",
      "Salve.",
    ],
    aposSalvar: [
      "Dados aparecem em relatorios, PDFs e identidade visual.",
      "Tema e white label sao aplicados na interface quando disponiveis.",
    ],
    cuidados: [
      "A personalizacao exige plano Premium, exceto administradores master.",
      "A imagem da logo deve ser pequena para evitar problemas em PDFs.",
    ],
    exemplos: [
      "Antes de gerar relatorio para cliente, confira CNPJ, cidade, telefone e logo.",
    ],
  },
];

export const guiasRapidos = [
  {
    titulo: "Como calcular custo do produto",
    categoria: "Operacional",
    conteudo:
      "O custo do produto vem do consumo de insumos informado na ficha tecnica multiplicado pelo custo medio de cada insumo.",
    objetivo: "Conferir se o preco de venda e a margem estao coerentes.",
    acesso: "Menu Operacao > Produtos.",
    camposPrincipais: [
      "Consumo de cada insumo.",
      "Custo medio dos insumos.",
      "Custo unitario, custo de producao, lucro e margem.",
    ],
    passos: [
      "Registre compras reais nos insumos.",
      "Abra o produto.",
      "Informe o consumo correto de cada insumo.",
      "Confira o Resultado da Ficha Tecnica.",
    ],
    cuidados: [
      "Sem compras cadastradas, o custo medio do insumo pode ficar zerado.",
      "Se o consumo estiver subestimado, a margem parecer mais alta do que e.",
    ],
    exemplos: [
      "Consumo de 0,2 kg com custo medio de R$ 30/kg gera R$ 6 de custo parcial.",
    ],
  },
  {
    titulo: "Como entender o DRE",
    categoria: "Financeiro",
    conteudo:
      "O DRE separa receita, descontos, custos de produtos vendidos, despesas e resultado liquido.",
    objetivo: "Entender se a empresa lucra depois dos custos e despesas.",
    acesso: "Financeiro > DRE ou Relatorios > DRE Gerencial.",
    passos: [
      "Filtre o periodo desejado.",
      "Leia receita bruta e descontos.",
      "Compare receita liquida com custo dos produtos vendidos.",
      "Subtraia despesas operacionais para chegar no resultado liquido.",
    ],
    cuidados: [
      "DRE depende de plano Profissional ou superior.",
      "Vendas sem custo correto distorcem lucro bruto.",
    ],
    exemplos: [
      "Desconto alto pode reduzir receita liquida mesmo quando o faturamento bruto parece bom.",
    ],
  },
  {
    titulo: "Como controlar recompra no CRM",
    categoria: "Comercial",
    conteudo:
      "O CRM calcula historico e recompra a partir das vendas vinculadas ao cliente, ignorando vendas canceladas.",
    objetivo: "Identificar clientes em dia, proximos da recompra, atrasados ou inativos.",
    acesso: "Menu Comercial > CRM.",
    passos: [
      "Cadastre clientes com dados claros.",
      "Selecione o cliente cadastrado ao vender.",
      "Acompanhe ultima compra, frequencia media, proxima compra e status de recompra.",
      "Use proxima acao e data quando o plano liberar follow-up.",
    ],
    cuidados: [
      "Se vender digitando o nome sem selecionar o cliente, o vinculo pode depender apenas da comparacao do nome.",
      "Recompra inteligente depende de plano Profissional.",
    ],
    exemplos: [
      "Cliente com compras regulares pode aparecer como Proximo da recompra quando a data prevista estiver chegando.",
    ],
  },
  {
    titulo: "Como convidar um usuario",
    categoria: "Usuarios e Permissoes",
    conteudo:
      "O convite cria um usuario pendente na empresa ativa e gera link de aceite.",
    objetivo: "Adicionar pessoas com acesso controlado por perfil.",
    acesso: "Menu Conta > Usuarios da Empresa.",
    passos: [
      "Clique em Novo usuario.",
      "Preencha nome, e-mail e perfil.",
      "Crie o convite.",
      "Envie por e-mail ou copie o link.",
      "Acompanhe se o usuario aceitou antes do vencimento.",
    ],
    cuidados: [
      "Convite pendente nao pode ser ativado manualmente; precisa passar pelo fluxo de aceite/login.",
      "Limite de usuarios pode bloquear novos convites.",
    ],
    exemplos: [
      "Convide um colaborador de producao com perfil Producao para liberar apenas operacao.",
    ],
  },
  {
    titulo: "Como definir permissoes",
    categoria: "Usuarios e Permissoes",
    conteudo:
      "Permissoes sao definidas pelo perfil da empresa e controlam menus e rotas liberadas.",
    objetivo: "Liberar acesso suficiente sem expor areas desnecessarias.",
    acesso: "Menu Conta > Usuarios da Empresa.",
    camposPrincipais: [
      "Administrador da Empresa: todas as permissoes.",
      "Financeiro: Dashboard, Financeiro e Relatorios.",
      "Producao: Dashboard, Insumos, Produtos, Producao e Estoque.",
      "Comercial: Dashboard, Vendas, CRM e Relatorios.",
      "Estoque: Dashboard, Insumos e Estoque.",
      "Visualizacao: Dashboard e Relatorios, somente leitura.",
    ],
    passos: [
      "Abra o menu de acoes do usuario.",
      "Clique em Editar perfil.",
      "Escolha o perfil adequado.",
      "Salve.",
    ],
    cuidados: [
      "O dono permanece Administrador da Empresa.",
      "Admin Master SaaS e um papel global, separado dos perfis de empresa.",
    ],
    exemplos: [
      "Uma pessoa de vendas normalmente usa o perfil Comercial; uma pessoa de contas a pagar usa Financeiro.",
    ],
  },
];

export const checklistImplantacao = [
  {
    titulo: "Configurar empresa",
    descricao:
      "Preencha nome, CNPJ, cidade, telefone e e-mail para relatorios e documentos sairem corretos.",
  },
  {
    titulo: "Inserir logo",
    descricao:
      "Carregue uma logo leve quando o plano permitir; isso melhora PDFs e identidade visual.",
  },
  {
    titulo: "Configurar parametros",
    descricao:
      "Crie unidades, tipos de produto e categorias de despesa antes dos cadastros operacionais.",
  },
  {
    titulo: "Cadastrar insumos",
    descricao:
      "Registre materias-primas com unidade correta para montar fichas tecnicas.",
  },
  {
    titulo: "Cadastrar produtos",
    descricao:
      "Monte ficha tecnica, preco de venda e consumo de insumos para calcular custos e margens.",
  },
  {
    titulo: "Configurar estoque inicial",
    descricao:
      "Lance compras de insumos e registre producoes iniciais para formar saldos reais.",
  },
  {
    titulo: "Realizar primeira producao",
    descricao:
      "Valide consumo de insumos, custo total e entrada de produto acabado.",
  },
  {
    titulo: "Realizar primeira venda",
    descricao:
      "Cadastre o cliente no CRM, selecione na venda, adicione itens e finalize o pedido.",
  },
  {
    titulo: "Convidar usuarios",
    descricao:
      "Crie convites para a equipe respeitando o limite do plano ativo.",
  },
  {
    titulo: "Definir roles",
    descricao:
      "Atribua perfis conforme a area: Comercial, Financeiro, Producao, Estoque ou Administrador.",
  },
  {
    titulo: "Validar dashboard",
    descricao:
      "Confira se vendas, lucro, producao, estoque e ultimos pedidos aparecem como esperado.",
  },
  {
    titulo: "Validar DRE",
    descricao:
      "Se o plano permitir, confira receita, descontos, custos, despesas e resultado liquido.",
  },
];

export const faqAprendizagem = [
  {
    pergunta: "Preciso cadastrar cliente antes de vender?",
    resposta:
      "Sim, esse e o fluxo recomendado. Cadastre o cliente em CRM e selecione-o em Vendas para manter historico, recompra, ticket medio e total comprado por cliente.",
  },
  {
    pergunta: "O que acontece com o estoque ao finalizar uma venda?",
    resposta:
      "A venda entra no calculo de produtos acabados como quantidade vendida. O saldo exibido no Estoque e calculado por produto como produzido menos vendido.",
  },
  {
    pergunta: "Como o financeiro e alimentado?",
    resposta:
      "Vendas viram entradas automaticas no Fluxo de Caixa. Se o status de pagamento for pago, entram como Recebido; se for pendente, entram em A Receber. Despesas sao lancadas manualmente.",
  },
  {
    pergunta: "O que significa usuario pendente?",
    resposta:
      "Significa que o convite foi criado, mas o usuario ainda nao aceitou pelo link de convite e ainda nao possui UID Auth vinculado a empresa.",
  },
  {
    pergunta: "O que e role/perfil?",
    resposta:
      "E o conjunto de permissoes do usuario dentro da empresa. Ele define quais menus e rotas aparecem, como Comercial, Financeiro, Producao, Estoque ou Administrador da Empresa.",
  },
  {
    pergunta: "Por que alguns modulos nao aparecem para meu usuario?",
    resposta:
      "Pode ser limitacao do perfil da empresa, do plano contratado ou do status do usuario. Cada usuario ve apenas os modulos permitidos pelo perfil e liberados pelo plano.",
  },
  {
    pergunta: "Como funciona o limite de usuarios do plano?",
    resposta:
      "O limite efetivo vem do plano ativo e inclui o dono da conta. Gratis tem 1 usuario, Basico 3, Profissional 8 e Premium 25, salvo liberacao manual por Admin Master.",
  },
  {
    pergunta: "Por que o DRE pode estar bloqueado?",
    resposta:
      "O DRE e um recurso liberado a partir do plano Profissional. Se o plano atual nao liberar DRE, a tela mostra o bloqueio e direciona para Planos.",
  },
  {
    pergunta: "Como preparar a empresa para comecar a usar o ERP?",
    resposta:
      "Configure empresa e parametros, cadastre insumos e compras, crie produtos com ficha tecnica, registre producao inicial, cadastre clientes no CRM e finalize a primeira venda.",
  },
  {
    pergunta: "O que e multiempresa?",
    resposta:
      "E a possibilidade de operar empresas diferentes no mesmo login. Os dados de configuracao, parametros, usuarios e registros ficam separados por empresa ativa.",
  },
  {
    pergunta: "Administrador da Empresa e Admin Master SaaS sao a mesma coisa?",
    resposta:
      "Nao. Administrador da Empresa controla a empresa ativa. Admin Master SaaS e um papel global usado para administracao do Renovar ERP e rotas administrativas.",
  },
  {
    pergunta: "Posso excluir cliente com historico?",
    resposta:
      "A tela de CRM bloqueia exclusao quando existe historico comercial, compras ou total comprado. Use Desativar cliente para preservar relatorios e auditoria.",
  },
];
