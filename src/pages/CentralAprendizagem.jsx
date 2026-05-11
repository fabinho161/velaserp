import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  ClipboardCheck,
  FileQuestion,
  GraduationCap,
  Layers3,
  Lightbulb,
  PlayCircle,
  Search,
} from "lucide-react";
import {
  categoriasAprendizagem,
  checklistImplantacao,
  faqAprendizagem,
  guiasRapidos,
  primeirosPassos,
  tutoriaisPorModulo,
} from "../data/centralAprendizagemData";

const CATEGORIA_CHECKLIST = "Checklist de Implantacao";

const normalizar = (valor) =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const textoDoArtigo = (item) =>
  normalizar([
    item.titulo,
    item.modulo,
    item.categoria,
    item.resumo,
    item.objetivo,
    item.acesso,
    item.conteudo,
    item.descricao,
    ...(item.passos || []),
    ...(item.camposPrincipais || []),
    ...(item.aposSalvar || []),
    ...(item.cuidados || []),
    ...(item.exemplos || []),
  ].join(" "));

function LearningInfoBlock({ title, items }) {
  if (!items?.length) return null;

  return (
    <div className="learning-info-block">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function SectionTitle({ icon: Icon, label, title, description }) {
  return (
    <div className="learning-section-heading">
      <span className="learning-section-icon">
        <Icon size={20} />
      </span>

      <div>
        <span className="learning-section-label">{label}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function ArticleCard({ item, variant = "article" }) {
  const titulo = item.titulo || item.modulo;

  return (
    <details className={`learning-article-card learning-article-${variant}`}>
      <summary>
        <span>
          <strong>{titulo}</strong>
          <small>{item.categoria}</small>
          {item.resumo && <em>{item.resumo}</em>}
        </span>
        <ArrowRight size={17} />
      </summary>

      <div className="learning-article-content">
        <p>{item.conteudo || item.descricao}</p>

        {item.objetivo && (
          <div className="learning-info-block learning-info-highlight">
            <strong>Objetivo</strong>
            <p>{item.objetivo}</p>
          </div>
        )}

        {item.acesso && (
          <div className="learning-info-block">
            <strong>Onde acessar</strong>
            <p>{item.acesso}</p>
          </div>
        )}

        {item.passos?.length > 0 && (
          <div className="learning-info-block">
            <strong>Passo a passo</strong>
            <ol>
              {item.passos.map((passo) => (
                <li key={passo}>{passo}</li>
              ))}
            </ol>
          </div>
        )}

        <LearningInfoBlock title="Campos principais" items={item.camposPrincipais} />
        <LearningInfoBlock title="O que acontece apos salvar" items={item.aposSalvar} />
        <LearningInfoBlock title="Cuidados importantes" items={item.cuidados} />
        <LearningInfoBlock title="Exemplos praticos" items={item.exemplos} />
      </div>
    </details>
  );
}

export default function CentralAprendizagem() {
  const [termoBusca, setTermoBusca] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState("todas");
  const [visualizacao, setVisualizacao] = useState("categorias");

  const todosConteudos = useMemo(
    () => [
      ...primeirosPassos,
      ...tutoriaisPorModulo.map((item) => ({
        titulo: item.modulo,
        ...item,
      })),
      ...guiasRapidos,
      ...faqAprendizagem.map((item) => ({
        titulo: item.pergunta,
        categoria: "FAQ",
        conteudo: item.resposta,
      })),
      ...checklistImplantacao.map((item) => ({
        titulo: item.titulo,
        categoria: CATEGORIA_CHECKLIST,
        conteudo: item.descricao,
      })),
    ],
    []
  );

  const totalPorCategoria = useMemo(() => {
    const totais = {};

    todosConteudos.forEach((item) => {
      totais[item.categoria] = (totais[item.categoria] || 0) + 1;
    });

    return totais;
  }, [todosConteudos]);

  const buscaNormalizada = normalizar(termoBusca.trim());

  const filtroCombina = (item) => {
    const categoriaCombina =
      categoriaAtiva === "todas" || item.categoria === categoriaAtiva;

    if (!categoriaCombina) return false;
    if (!buscaNormalizada) return true;

    return textoDoArtigo(item).includes(buscaNormalizada);
  };

  const primeirosPassosFiltrados = primeirosPassos.filter(filtroCombina);
  const tutoriaisFiltrados = tutoriaisPorModulo
    .map((item) => ({ titulo: item.modulo, ...item }))
    .filter(filtroCombina);
  const guiasFiltrados = guiasRapidos.filter(filtroCombina);
  const faqFiltrada = faqAprendizagem.filter((item) =>
    filtroCombina({
      titulo: item.pergunta,
      categoria: "FAQ",
      conteudo: item.resposta,
    })
  );
  const checklistFiltrado = checklistImplantacao.filter((item) =>
    filtroCombina({
      titulo: item.titulo,
      categoria: CATEGORIA_CHECKLIST,
      conteudo: item.descricao,
    })
  );

  const totalResultados =
    primeirosPassosFiltrados.length +
    tutoriaisFiltrados.length +
    guiasFiltrados.length +
    faqFiltrada.length +
    checklistFiltrado.length;

  const abrirCategoria = (categoria) => {
    if (categoria.titulo === CATEGORIA_CHECKLIST) {
      setCategoriaAtiva(CATEGORIA_CHECKLIST);
      setVisualizacao("checklist");
      return;
    }

    setCategoriaAtiva(categoria.titulo);
    setVisualizacao("categorias");
  };

  const voltarParaCategorias = () => {
    setCategoriaAtiva("todas");
    setVisualizacao("categorias");
  };

  const mostrandoChecklist = visualizacao === "checklist";

  return (
    <div className="learning-page">
      <div className="page-header learning-header">
        <div>
          <span className="badge badge-info learning-eyebrow">
            <GraduationCap size={14} />
            Ajuda
          </span>

          <h1 className="page-title">Central de Aprendizagem</h1>

          <p className="page-subtitle">
            Encontre passos, guias rapidos e respostas para orientar a equipe no
            uso do Renovar ERP, do cadastro inicial ate a leitura dos
            indicadores.
          </p>
        </div>
      </div>

      <section className="card learning-search-card">
        <label className="learning-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por titulo, categoria ou conteudo..."
            value={termoBusca}
            onChange={(event) => setTermoBusca(event.target.value)}
          />
        </label>

        <div className="learning-search-result">
          <strong>{totalResultados}</strong>
          <span>resultado(s) encontrados</span>
        </div>
      </section>

      {!mostrandoChecklist && (
        <section className="learning-category-grid">
          <button
            type="button"
            className={
              categoriaAtiva === "todas"
                ? "learning-category-card active"
                : "learning-category-card"
            }
            onClick={voltarParaCategorias}
          >
            <span className="learning-category-icon">
              <Layers3 size={19} />
            </span>
            <strong>Todas as categorias</strong>
            <small>{todosConteudos.length} topicos</small>
          </button>

          {categoriasAprendizagem.map((categoria) => (
            <button
              type="button"
              key={categoria.id}
              className={
                categoriaAtiva === categoria.titulo
                  ? "learning-category-card active"
                  : "learning-category-card"
              }
              onClick={() => abrirCategoria(categoria)}
            >
              <span className="learning-category-icon">
                {categoria.titulo === CATEGORIA_CHECKLIST ? (
                  <ClipboardCheck size={19} />
                ) : (
                  <BookOpen size={19} />
                )}
              </span>
              <strong>{categoria.titulo}</strong>
              <small>{totalPorCategoria[categoria.titulo] || 0} topicos</small>
              <p>{categoria.descricao}</p>
            </button>
          ))}
        </section>
      )}

      {mostrandoChecklist ? (
        <section className="card learning-section-card learning-checklist-detail-card">
          <div className="learning-detail-toolbar">
            <button
              type="button"
              className="learning-back-button"
              onClick={voltarParaCategorias}
            >
              <ArrowLeft size={16} />
              Voltar
            </button>

            <span>Ajuda / Checklist de Implantacao</span>
          </div>

          <SectionTitle
            icon={ClipboardCheck}
            label="Implantacao"
            title="Checklist de Implantacao"
            description="Use esta sequencia para preparar a empresa, validar cadastros e iniciar a operacao com mais confianca."
          />

          <div className="learning-checklist learning-checklist-detail">
            {checklistFiltrado.map((item, index) => (
              <div key={item.titulo} className="learning-checklist-item">
                <span className="learning-checklist-number">{index + 1}</span>
                <span>
                  <strong>{item.titulo}</strong>
                  <small>{item.descricao}</small>
                </span>
                <CheckCircle size={17} />
              </div>
            ))}

            {checklistFiltrado.length === 0 && (
              <div className="empty-state">Nenhum item encontrado.</div>
            )}
          </div>
        </section>
      ) : (
        <>
          {primeirosPassosFiltrados.length > 0 && (
            <section className="card learning-section-card">
              <SectionTitle
                icon={GraduationCap}
                label="Onboarding"
                title="Primeiros passos"
                description="Sequencia inicial para configurar a empresa e registrar as primeiras rotinas."
              />

              <div className="learning-article-grid">
                {primeirosPassosFiltrados.map((item) => (
                  <ArticleCard key={item.titulo} item={item} />
                ))}
              </div>
            </section>
          )}

          {tutoriaisFiltrados.length > 0 && (
            <section className="card learning-section-card">
              <SectionTitle
                icon={BookOpen}
                label="Modulos"
                title="Tutoriais por modulo"
                description="Visao rapida do papel de cada modulo dentro do ERP."
              />

              <div className="learning-module-grid">
                {tutoriaisFiltrados.map((item) => (
                  <ArticleCard key={item.modulo} item={item} variant="module" />
                ))}
              </div>
            </section>
          )}

          {guiasFiltrados.length > 0 && (
            <section className="card learning-section-card">
              <SectionTitle
                icon={Lightbulb}
                label="Guias"
                title="Guias rapidos"
                description="Respostas curtas para tarefas comuns do dia a dia."
              />

              <div className="learning-guide-list">
                {guiasFiltrados.map((item) => (
                  <ArticleCard key={item.titulo} item={item} variant="guide" />
                ))}
              </div>
            </section>
          )}

          {faqFiltrada.length > 0 && (
            <section className="card learning-section-card">
              <SectionTitle
                icon={FileQuestion}
                label="FAQ"
                title="Perguntas frequentes"
                description="Duvidas basicas sobre multiempresa, perfis e funcionamento geral."
              />

              <div className="learning-faq-list">
                {faqFiltrada.map((item) => (
                  <details key={item.pergunta} className="learning-faq-item">
                    <summary>
                      <strong>{item.pergunta}</strong>
                      <ArrowRight size={17} />
                    </summary>
                    <p>{item.resposta}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          <section className="card learning-section-card learning-media-card">
            <SectionTitle
              icon={PlayCircle}
              label="Em breve"
              title="Videos e prints"
              description="Espaco reservado para tutoriais visuais, demonstracoes de tela e exemplos guiados."
            />

            <div className="learning-media-placeholder">
              <PlayCircle size={34} />
              <strong>Biblioteca visual futura</strong>
              <span>Sem backend nesta primeira versao.</span>
            </div>
          </section>

          {totalResultados === 0 && (
            <div className="empty-state learning-empty">
              Nenhum conteudo encontrado para a busca atual.
            </div>
          )}
        </>
      )}
    </div>
  );
}
