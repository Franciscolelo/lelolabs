/* LeloLabs — loja pública e área do cliente */
'use strict';
(function () {
  const { h, sb } = LL;
  const raiz = document.getElementById('raiz');
  if (!LL.configurado) { raiz.replaceChildren(LL.avisoConfig()); return; }

  let loja = {}, produtos = [], trabalhos = [], sessao = null, perfil = null;
  let avaliacoes = [], gostosTotal = {}, meusGostos = new Set(), minhasAvaliacoes = {};
  let carrinho = LL.lerLocal('ll_carrinho', []);
  let filtroCat = 'Todos', busca = '', naoLidas = 0, canalAvisos = null, depoisDeEntrar = null, chatAtivo = null;

  const topo = h('header', { class: 'topo' });
  const principal = h('main', { id: 'conteudo' });
  const rodape = h('footer', { class: 'rodape' });
  raiz.append(topo, principal, rodape);

  const corpoCarrinho = h('div', { class: 'offcanvas-body d-flex flex-column' });
  const oc = h('div', { class: 'offcanvas offcanvas-end', tabindex: '-1', 'aria-labelledby': 'tit-carrinho' },
    h('div', { class: 'offcanvas-header border-bottom' }, h('h5', { class: 'offcanvas-title', id: 'tit-carrinho', text: 'O seu carrinho' }),
      h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'offcanvas', 'aria-label': 'Fechar' })), corpoCarrinho);
  document.body.append(oc);
  const mAuth = LL.modal({ titulo: 'Entrar' });
  const mPedido = LL.modal({ titulo: 'Finalizar pedido', tamanho: 'modal-lg' });
  const mConta = LL.modal({ titulo: 'A minha conta', tamanho: 'modal-xl modal-fullscreen-md-down' });
  const mDetalhe = LL.modal({ titulo: '', tamanho: 'modal-lg' });
  mConta.el.addEventListener('hidden.bs.modal', () => { if (chatAtivo) { chatAtivo.parar(); chatAtivo = null; } });

  // ================= Dados =================
  async function carregar() {
    principal.replaceChildren(h('div', { class: 'container py-5 text-center text-body-secondary', text: 'A carregar a loja…' }));
    const [l, p, t, av, gt] = await Promise.all([
      sb.from('loja').select('dados').eq('id', 1).maybeSingle(),
      sb.from('produtos').select('*').eq('ativo', true).order('ordem').order('criado'),
      sb.from('trabalhos').select('*').order('ordem').order('criado', { ascending: false }),
      sb.from('avaliacoes').select('id,produto_id,nome_publico,servicos,estrelas,recomenda,comentario,resposta,criado').eq('visivel', true).order('criado', { ascending: false }).limit(200),
      sb.rpc('contar_gostos')
    ]);
    avaliacoes = av.data || []; gostosTotal = {}; (gt.data || []).forEach(g => { gostosTotal[g.trabalho_id] = Number(g.total); });
    if (l.error || p.error || t.error) {
      principal.replaceChildren(h('div', { class: 'container py-5 text-center' }, h('p', { class: 'fw-semibold', text: 'Não foi possível carregar a loja.' }), h('p', { class: 'text-body-secondary', text: LL.erro(l.error || p.error || t.error) })));
      return;
    }
    loja = (l.data && l.data.dados) || {}; produtos = p.data; trabalhos = t.data;
    document.title = loja.nome || 'LeloLabs';
    carrinho = carrinho.filter(i => produtos.some(x => x.id === i.id));
    renderTudo();
    // Ligação direta para um serviço (partilhada nas redes)
    const m = /^#servico-([0-9a-f-]{36})$/.exec(location.hash); if (m) { const p0 = produtos.find(x => x.id === m[1]); if (p0) abrirDetalhe(p0); }
  }

  sb.auth.onAuthStateChange((evento, s) => {
    const anterior = sessao && sessao.user.id;
    sessao = s;
    if (anterior && (!s || s.user.id !== anterior)) {   // mudou de conta: limpa tudo o que era da conta anterior
      carrinho = []; LL.gravarLocal('ll_carrinho', []); perfil = null;
      if (chatAtivo) { chatAtivo.parar(); chatAtivo = null; }
      mConta.corpo.replaceChildren(); mConta.fechar(); renderCarrinho();
    }
    setTimeout(() => {                       // fora do callback, como recomenda o Supabase
      if (evento === 'PASSWORD_RECOVERY') abrirNovaSenha();
      if (s) carregarPerfil(); else { perfil = null; pararAvisos(); renderTopo(); carregarGostos(); }
    }, 0);
  });
  async function carregarGostos() {
    meusGostos = new Set();
    if (sessao) { const { data } = await sb.from('gostos').select('trabalho_id').eq('cliente_id', sessao.user.id); (data || []).forEach(g => meusGostos.add(g.trabalho_id)); }
    const s = document.getElementById('trabalhos'); if (s) s.replaceWith(secTrabalhos());
  }
  async function alternarGosto(t) {
    if (!sessao) { abrirAuth('entrar', () => alternarGosto(t)); return; }
    const tem = meusGostos.has(t.id);
    // Atualização otimista: muda já no ecrã e confirma no servidor
    if (tem) { meusGostos.delete(t.id); gostosTotal[t.id] = Math.max(0, (gostosTotal[t.id] || 1) - 1); } else { meusGostos.add(t.id); gostosTotal[t.id] = (gostosTotal[t.id] || 0) + 1; }
    const s = document.getElementById('trabalhos'); if (s) s.replaceWith(secTrabalhos());
    const r = tem ? await sb.from('gostos').delete().eq('trabalho_id', t.id).eq('cliente_id', sessao.user.id) : await sb.from('gostos').insert({ trabalho_id: t.id });
    if (r.error && !/duplicate/i.test(r.error.message)) { LL.aviso(LL.erro(r.error), 'erro'); carregarGostos(); }
  }
  async function carregarPerfil() {
    const { data } = await sb.from('perfis').select('*').eq('id', sessao.user.id).maybeSingle();
    perfil = data || { id: sessao.user.id, nome: '', email: sessao.user.email, telefone: '' };
    renderTopo(); iniciarAvisos(); carregarGostos();
    if (depoisDeEntrar) { const f = depoisDeEntrar; depoisDeEntrar = null; f(); }
  }
  async function contarNaoLidas() {
    const { count } = await sb.from('mensagens').select('id', { count: 'exact', head: true }).eq('cliente_id', sessao.user.id).eq('autor', 'admin').eq('lida', false);
    naoLidas = count || 0; renderTopo();
  }
  function iniciarAvisos() {
    pararAvisos(); contarNaoLidas();
    canalAvisos = sb.channel('avisos-' + sessao.user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: 'cliente_id=eq.' + sessao.user.id }, ev => {
        if (ev.new.autor === 'admin' && !chatAtivo) { naoLidas++; renderTopo(); LL.aviso(ev.new.tipo === 'sistema' ? ev.new.texto : 'Nova mensagem de ' + (loja.dono || 'LeloLabs').split(' ')[0]); }
      }).subscribe();
  }
  function pararAvisos() { if (canalAvisos) { sb.removeChannel(canalAvisos); canalAvisos = null; } naoLidas = 0; }

  // ================= Página =================
  function renderTudo() { renderTopo(); principal.replaceChildren(secHeroi(), secLoja(), secTrabalhos(), secAvaliacoes(), secContacto()); renderRodape(); renderCarrinho(); }
  const totalItens = () => carrinho.reduce((s, i) => s + i.qtd, 0);

  function renderTopo() {
    const n = totalItens();
    topo.replaceChildren(h('div', { class: 'container' },
      h('a', { class: 'marca', href: '#inicio' }, LL.logo(), loja.nome || 'LeloLabs'),
      h('nav', { 'aria-label': 'Secções' }, h('a', { href: '#loja', text: 'Serviços' }), h('a', { href: '#trabalhos', text: 'Trabalhos' }), h('a', { href: '#avaliacoes', text: 'Avaliações' }), h('a', { href: '#contacto', text: 'Contacto' })),
      h('div', { class: 'acoes-topo d-flex gap-2' },
        h('button', { class: 'btn btn-outline-secondary btn-conta', type: 'button', onclick: () => sessao ? abrirConta('pedidos') : abrirAuth('entrar') },
          LL.icone('pessoa'), h('span', { class: 'd-none d-md-inline ms-1', text: sessao ? ((perfil && perfil.nome.split(' ')[0]) || 'A minha conta') : 'Entrar' }),
          naoLidas ? h('span', { class: 'badge rounded-pill text-bg-danger ms-1', text: naoLidas, 'aria-label': naoLidas + ' mensagens por ler' }) : null),
        h('button', { class: 'btn btn-primary btn-carrinho', type: 'button', 'aria-label': 'Carrinho, ' + n + ' itens', onclick: () => bootstrap.Offcanvas.getOrCreateInstance(oc).show() },
          LL.icone('carrinho'), h('span', { class: 'd-none d-sm-inline ms-1', text: 'Carrinho' }), n ? h('span', { class: 'badge rounded-pill', text: n }) : null))));
  }

  function secHeroi() {
    return h('section', { class: 'container heroi', id: 'inicio' }, h('div', { class: 'row g-4 align-items-end' },
      h('div', { class: 'col-lg-7' },
        h('span', { class: 'rotulo', text: 'Programador · ' + (loja.local || '') }),
        h('h1', { text: loja.slogan || '' }),
        h('p', { class: 'sobre', text: loja.sobre || '' }),
        h('div', { class: 'd-flex flex-wrap gap-2 mt-4' },
          h('a', { class: 'btn btn-primary btn-lg', href: '#loja', text: 'Ver serviços e preços' }),
          h('button', { class: 'btn btn-outline-secondary btn-lg', type: 'button', onclick: () => sessao ? abrirConta('conversa') : abrirAuth('registo', () => abrirConta('conversa')) }, LL.icone('chat'), ' Falar comigo')),
        loja.stack ? h('p', { class: 'mono small text-body-secondary mt-3 mb-0', text: loja.stack }) : null),
      h('div', { class: 'col-lg-5' }, h('div', { class: 'disponibilidade' },
        h('span', { class: 'rotulo', text: 'Como funciona' }),
        [['1', 'Escolha os serviços', 'Junte ao carrinho o que precisa.'], ['2', 'Crie a sua conta', 'Nome, email e telefone. Leva 1 minuto.'], ['3', 'Pague e envie o comprovativo', 'Tudo dentro do site, com chat direto.'], ['4', 'Receba o projeto', 'Os ficheiros ficam na sua conta.']].map(([n, t, s]) =>
          h('div', { class: 'canal-linha' }, h('span', { class: 'passo-n', text: n }), h('div', null, h('div', { class: 'nome', text: t }), h('div', { class: 'hor', text: s }))))))));
  }

  function secLoja() {
    const cats = ['Todos'].concat([...new Set(produtos.map(p => p.categoria).filter(Boolean))]);
    const termos = LL.termos(busca), t0 = performance.now();
    const lista = produtos.filter(p => (filtroCat === 'Todos' || p.categoria === filtroCat) && (!termos.length || LL.corresponde([p.nome, p.descricao, p.categoria, (p.itens || []).join(' ')].join(' '), termos)));
    const sec = h('section', { class: 'seccao', id: 'loja' }, h('div', { class: 'container' },
      h('div', { class: 'text-center mb-4' }, h('span', { class: 'rotulo', text: 'Loja · preços em kwanzas' }), h('h2', { text: 'Serviços' })),
      h('div', { class: 'mx-auto mb-2', style: 'max-width:640px' }, LL.caixaPesquisa({ id: 'busca-loja', placeholder: 'Pesquisar serviços', valor: busca, grande: true, aoMudar: v => { busca = v; atualizarLoja(true); } })),
      termos.length ? h('div', { class: 'text-center' }, LL.contagem(lista.length, performance.now() - t0)) : null,
      h('ul', { class: 'nav nav-pills gap-2 my-4 justify-content-center', 'aria-label': 'Categorias' }, cats.map(c =>
        h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link' + (filtroCat === c ? ' active' : ''), 'aria-pressed': String(filtroCat === c), onclick: () => { filtroCat = c; atualizarLoja(); } }, c)))),
      lista.length ? h('div', { class: 'row g-4' }, lista.map(p => h('div', { class: 'col-sm-6 col-lg-4' }, cartaoProduto(p, termos))))
        : h('div', { class: 'vazio', text: produtos.length ? 'Nenhum serviço encontrado. Experimente outras palavras ou outra categoria.' : 'Os serviços serão publicados em breve.' })));
    return sec;
  }
  function atualizarLoja(manterFoco) {
    const velho = document.getElementById('loja'); if (!velho) return;
    const pos = manterFoco ? document.getElementById('busca-loja').selectionStart : null;
    velho.replaceWith(secLoja());
    if (manterFoco) { const c = document.getElementById('busca-loja'); c.focus(); try { c.setSelectionRange(pos, pos); } catch (e) { /* ignorar */ } }
  }

  function cartaoProduto(p, termos = []) {
    const no = carrinho.find(i => i.id === p.id);
    return h('article', { class: 'card produto h-100' + (p.destaque ? ' destaque' : '') },
      h('div', { class: 'position-relative' }, LL.galeria(p.imagens, p.nome), p.destaque ? h('span', { class: 'selo-destaque', text: 'Mais procurado' }) : null),
      h('div', { class: 'card-body d-flex flex-column gap-3' },
        h('div', null, h('span', { class: 'etiqueta', text: p.categoria })),
        h('div', null, h('h3', { class: 'h5 mb-1' }, LL.destacar(p.nome, termos)), h('p', { class: 'text-body-secondary mb-0 recorte' }, LL.destacar(p.descricao, termos))),
        (p.itens || []).length ? h('ul', { class: 'lista-itens' }, p.itens.slice(0, 4).map(i => h('li', null, LL.destacar(i, termos)))) : null,
        h('div', { class: 'mt-auto d-flex align-items-end justify-content-between gap-2 flex-wrap' },
          h('div', null, h('div', { class: 'preco', text: LL.kz(p.preco) }), h('div', { class: 'small text-body-secondary', text: p.unidade }), resumoNota(p)),
          h('div', { class: 'd-flex gap-2' },
            h('button', { class: 'btn btn-outline-secondary', type: 'button', onclick: () => abrirDetalhe(p), text: 'Detalhes' }),
            h('button', { class: 'btn ' + (no ? 'btn-outline-primary' : 'btn-primary'), type: 'button', onclick: () => adicionar(p.id) }, no ? 'Mais 1 (' + no.qtd + ')' : 'Adicionar')))));
  }

  // Avaliações de um serviço específico
  const avaliacoesDe = id => avaliacoes.filter(a => a.produto_id === id);
  function resumoNota(p) {
    const lista = avaliacoesDe(p.id); if (!lista.length) return null;
    const m = lista.reduce((s, a) => s + a.estrelas, 0) / lista.length;
    return h('button', { class: 'btn btn-link btn-sm p-0 text-decoration-none nota-produto', type: 'button', onclick: () => abrirDetalhe(p, true), 'aria-label': 'Ver ' + lista.length + ' avaliações de ' + p.nome },
      h('span', { class: 'estrelas', text: '★' }), ' ' + m.toFixed(1).replace('.', ',') + ' (' + lista.length + ')');
  }
  function blocoAvaliacoesProduto(p) {
    const lista = avaliacoesDe(p.id), n = lista.length;
    if (!n) return h('div', { class: 'small text-body-secondary', text: 'Este serviço ainda não tem avaliações.' });
    const m = lista.reduce((s, a) => s + a.estrelas, 0) / n, rec = Math.round(lista.filter(a => a.recomenda).length / n * 100);
    return h('div', { class: 'd-grid gap-3', id: 'aval-produto' },
      h('div', { class: 'd-flex align-items-center gap-3 flex-wrap' }, h('span', { class: 'media-aval', text: m.toFixed(1).replace('.', ',') }),
        h('div', null, estrelas(Math.round(m)), h('div', { class: 'small text-body-secondary', text: n + (n === 1 ? ' avaliação' : ' avaliações') + ' · ' + rec + '% recomendam' }))),
      lista.map(a => h('div', { class: 'border-top pt-2 d-grid gap-1' },
        h('div', { class: 'd-flex gap-2 align-items-center flex-wrap' }, h('strong', { text: a.nome_publico }), estrelas(a.estrelas), h('span', { class: 'small ' + (a.recomenda ? 'text-success' : 'text-body-secondary'), text: a.recomenda ? '👍 Recomenda' : 'Não recomenda' }), h('span', { class: 'small text-body-secondary ms-auto', text: new Date(a.criado).toLocaleDateString('pt-PT') })),
        a.comentario ? h('p', { class: 'mb-0', text: a.comentario }) : null,
        a.resposta ? h('div', { class: 'resposta-aval small' }, h('strong', { text: 'Resposta: ' }), a.resposta) : null)));
  }

  const linkServico = p => location.origin + location.pathname + '#servico-' + p.id;
  function abrirDetalhe(p, irParaAvaliacoes) {
    try { history.replaceState(null, '', '#servico-' + p.id); } catch (e) { /* ignorar */ }
    mDetalhe.titulo(p.nome);
    mDetalhe.corpo.replaceChildren(h('div', { class: 'd-grid gap-3' },
      LL.galeria(p.imagens, p.nome, 'capa-grande'),
      h('div', { class: 'd-flex justify-content-between align-items-end flex-wrap gap-2' },
        h('div', null, h('span', { class: 'etiqueta', text: p.categoria }), h('div', { class: 'preco mt-2', text: LL.kz(p.preco) }), h('div', { class: 'small text-body-secondary', text: p.unidade })),
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => { adicionar(p.id); mDetalhe.fechar(); } }, LL.icone('carrinho'), ' Adicionar ao carrinho')),
      p.descricao ? h('p', { class: 'mb-0', text: p.descricao }) : null,
      (p.itens || []).length ? h('ul', { class: 'lista-itens' }, p.itens.map(i => h('li', { text: i }))) : null,
      h('div', { class: 'd-flex gap-2 flex-wrap' },
        h('a', { class: 'btn btn-sm btn-outline-success', target: '_blank', rel: 'noopener', href: 'https://wa.me/?text=' + encodeURIComponent(p.nome + ' — ' + LL.kz(p.preco) + '\n' + linkServico(p)) }, 'Partilhar no WhatsApp'),
        h('a', { class: 'btn btn-sm btn-outline-primary', target: '_blank', rel: 'noopener', href: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(linkServico(p)) }, 'Facebook'),
        (() => { const b = h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', text: 'Copiar ligação' }); b.addEventListener('click', () => { navigator.clipboard.writeText(linkServico(p)).then(() => LL.aviso('Ligação copiada'), () => LL.aviso(linkServico(p))); }); return b; })()),
      h('div', { class: 'border-top pt-3' }, h('h3', { class: 'h5', text: 'Avaliações deste serviço' }), blocoAvaliacoesProduto(p))));
    mDetalhe.abrir();
    if (irParaAvaliacoes) setTimeout(() => { const el = document.getElementById('aval-produto'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 450);
  }

  function secTrabalhos() {
    return h('section', { class: 'seccao', id: 'trabalhos' }, h('div', { class: 'container' },
      h('span', { class: 'rotulo', text: 'Portfólio' }), h('h2', { class: 'mb-4', text: 'Trabalhos realizados' }),
      trabalhos.length ? h('div', { class: 'row g-4' }, trabalhos.map(t => h('div', { class: 'col-sm-6 col-lg-4' },
        h('article', { class: 'card h-100 overflow-hidden' }, LL.galeria(t.imagens, t.titulo),
          h('div', { class: 'card-body d-flex flex-column gap-2' },
            t.categoria ? h('span', { class: 'rotulo', text: t.categoria }) : null,
            h('h3', { class: 'h5 mb-0', text: t.titulo }),
            t.descricao ? h('p', { class: 'text-body-secondary mb-0', text: t.descricao }) : null,
            h('div', { class: 'mt-auto d-flex gap-3 flex-wrap align-items-center' },
              h('button', { class: 'btn btn-sm btn-gosto' + (meusGostos.has(t.id) ? ' ativo' : ''), type: 'button', 'aria-pressed': String(meusGostos.has(t.id)), 'aria-label': (meusGostos.has(t.id) ? 'Retirar gosto' : 'Gosto') + ' — ' + t.titulo, onclick: () => alternarGosto(t) },
                h('span', { 'aria-hidden': 'true', text: meusGostos.has(t.id) ? '♥' : '♡' }), ' ' + (gostosTotal[t.id] || 0)),
              LL.url(t.video_url) ? h('a', { class: 'fw-semibold text-decoration-none', href: LL.url(t.video_url), target: '_blank', rel: 'noopener noreferrer', text: '▶ Ver vídeo' }) : null,
              LL.url(t.link) ? h('a', { class: 'fw-semibold text-decoration-none', href: LL.url(t.link), target: '_blank', rel: 'noopener noreferrer', text: 'Abrir projeto ↗' }) : null))))))
        : h('div', { class: 'vazio', text: 'Os trabalhos serão publicados em breve.' })));
  }

  const estrelas = n => h('span', { class: 'estrelas', 'aria-label': n + ' de 5 estrelas', text: '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n) });
  function secAvaliacoes() {
    const n = avaliacoes.length;
    const media = n ? avaliacoes.reduce((s, a) => s + a.estrelas, 0) / n : 0;
    const recom = n ? Math.round(avaliacoes.filter(a => a.recomenda).length / n * 100) : 0;
    const barras = [5, 4, 3, 2, 1].map(e => { const c = avaliacoes.filter(a => a.estrelas === e).length; return h('div', { class: 'd-flex align-items-center gap-2 small' }, h('span', { class: 'mono', text: e + '★' }), h('div', { class: 'barra flex-grow-1' }, h('i', { style: 'width:' + (n ? c / n * 100 : 0) + '%' })), h('span', { class: 'mono', style: 'min-width:2ch', text: c })); });
    return h('section', { class: 'seccao', id: 'avaliacoes' }, h('div', { class: 'container' },
      h('span', { class: 'rotulo', text: 'Opinião de quem já comprou' }), h('h2', { class: 'mb-4', text: 'Avaliações' }),
      n ? h('div', { class: 'row g-4' },
        h('div', { class: 'col-lg-4' }, h('div', { class: 'card' }, h('div', { class: 'card-body d-grid gap-3' },
          h('div', { class: 'd-flex align-items-end gap-2' }, h('span', { class: 'media-aval', text: media.toFixed(1).replace('.', ',') }), h('div', null, estrelas(Math.round(media)), h('div', { class: 'small text-body-secondary', text: n + (n === 1 ? ' avaliação' : ' avaliações') }))),
          h('div', { class: 'fw-semibold', text: recom + '% recomendam' }), barras,
          h('p', { class: 'small text-body-secondary mb-0', text: 'Só podem avaliar clientes com um projeto concluído.' })))),
        h('div', { class: 'col-lg-8 d-grid gap-3' }, avaliacoes.slice(0, 12).map(a => h('article', { class: 'card' }, h('div', { class: 'card-body d-grid gap-2' },
          h('div', { class: 'd-flex align-items-center gap-2 flex-wrap' }, h('span', { class: 'avatar', text: LL.iniciais(a.nome_publico) }), h('strong', { text: a.nome_publico }), estrelas(a.estrelas),
            h('span', { class: 'badge ms-auto ' + (a.recomenda ? 'text-bg-success' : 'text-bg-secondary'), text: a.recomenda ? '👍 Recomenda' : 'Não recomenda' })),
          a.servicos ? h('div', { class: 'small text-body-secondary', text: a.servicos + ' · ' + new Date(a.criado).toLocaleDateString('pt-PT') }) : null,
          a.comentario ? h('p', { class: 'mb-0', text: a.comentario }) : null,
          a.resposta ? h('div', { class: 'resposta-aval' }, h('div', { class: 'rotulo mb-1', text: 'Resposta de ' + (loja.dono || 'LeloLabs').split(' ')[0] }), h('div', { text: a.resposta })) : null)))))
        : h('div', { class: 'vazio', text: 'Ainda não há avaliações. Depois de concluir o seu projeto, pode deixar a sua opinião na sua conta.' })));
  }

  function formAvaliacao(p, item, atual, contentor) {
    const chave = p.id.slice(0, 8) + '-' + String(item.id).slice(0, 8);
    let est = atual ? atual.estrelas : 5, rec = atual ? atual.recomenda : true;
    const msg = h('div', { class: 'small', role: 'status' });
    const grupoEst = h('div', { class: 'escolher-estrelas', role: 'radiogroup', 'aria-label': 'Estrelas' });
    const desenhar = () => grupoEst.replaceChildren(...[1, 2, 3, 4, 5].map(n => h('button', { type: 'button', role: 'radio', 'aria-checked': String(n === est), 'aria-label': n + ' estrelas', class: n <= est ? 'on' : '', onclick: () => { est = n; desenhar(); }, text: '★' })));
    desenhar();
    const recSim = h('input', { class: 'btn-check', type: 'radio', name: 'rec-' + chave, id: 'rec-s-' + chave }); recSim.checked = rec;
    const recNao = h('input', { class: 'btn-check', type: 'radio', name: 'rec-' + chave, id: 'rec-n-' + chave }); recNao.checked = !rec;
    recSim.addEventListener('change', () => { rec = true; }); recNao.addEventListener('change', () => { rec = false; });
    const com = h('textarea', { class: 'form-control', rows: '3', maxlength: '1000', id: 'com-' + chave, placeholder: 'Conte como correu: qualidade, prazo, atendimento…' }); com.value = atual ? atual.comentario : '';
    return h('form', { class: 'caixa-suave rounded-3 p-3 d-grid gap-2', onsubmit: async e => {
      e.preventDefault(); msg.className = 'small'; msg.textContent = 'A guardar…';
      const dados = { estrelas: est, recomenda: rec, comentario: com.value.trim() };
      const r = atual ? await sb.from('avaliacoes').update(dados).eq('id', atual.id) : await sb.from('avaliacoes').insert(Object.assign({ pedido_id: p.id, produto_id: item.id }, dados));
      if (r.error) { msg.className = 'small text-danger'; msg.textContent = LL.erro(r.error); return; }
      LL.aviso('Obrigado pela sua avaliação!'); contaPedidos(contentor); carregar();
    } },
      h('div', { class: 'fw-semibold', text: (atual ? 'A sua avaliação de ' : 'Avalie: ') + item.nome }), grupoEst,
      h('div', { class: 'd-flex gap-2 flex-wrap' }, recSim, h('label', { class: 'btn btn-sm btn-outline-success', for: recSim.id, text: '👍 Recomendo' }), recNao, h('label', { class: 'btn btn-sm btn-outline-secondary', for: recNao.id, text: 'Não recomendo' })),
      h('label', { class: 'visually-hidden', for: com.id, text: 'Comentário' }), com,
      atual && atual.resposta ? h('div', { class: 'resposta-aval small' }, h('strong', { text: 'Resposta: ' }), atual.resposta) : null,
      msg, h('div', null, h('button', { class: 'btn btn-primary btn-sm', type: 'submit', text: atual ? 'Atualizar avaliação' : 'Publicar avaliação' })));
  }

  function secContacto() {
    return h('section', { class: 'seccao', id: 'contacto' }, h('div', { class: 'container' },
      h('span', { class: 'rotulo', text: 'Fale comigo' }), h('h2', { class: 'mb-4', text: 'Contacto' }),
      h('div', { class: 'row g-3' },
        h('div', { class: 'col-md-6 col-lg-4' }, h('div', { class: 'card h-100' }, h('div', { class: 'card-body d-grid gap-2' },
          h('div', { class: 'd-flex align-items-center gap-2' }, LL.icone('chat'), h('strong', { text: 'Chat no site' }), h('span', { class: 'badge text-bg-success ms-auto', text: 'Recomendado' })),
          h('p', { class: 'small text-body-secondary mb-0', text: 'Converse comigo, envie comprovativos e receba os seus projetos, tudo num só lugar.' }),
          h('button', { class: 'btn btn-primary mt-auto', type: 'button', onclick: () => sessao ? abrirConta('conversa') : abrirAuth('registo', () => abrirConta('conversa')), text: 'Abrir conversa' })))),
        loja.email ? cartaoInfo('email', 'Email', loja.email) : null,
        loja.telefone ? cartaoInfo('telefone', 'Telefone', LL.tel(loja.telefone), loja.horario) : null),
      h('div', { class: 'privacidade mt-4' }, h('strong', { text: 'Os seus dados estão protegidos. ' }),
        'Cada cliente só vê os seus próprios pedidos, mensagens e ficheiros. Os comprovativos e os projetos ficam guardados em área privada, e as palavras-passe nunca são guardadas em texto.')));
  }
  function cartaoInfo(ic, rot, valor, extra) {
    const v = h('div', { class: 'valor mono', text: valor });
    return h('div', { class: 'col-md-6 col-lg-4' }, h('div', { class: 'card h-100' }, h('div', { class: 'card-body d-grid gap-2' },
      h('div', { class: 'd-flex align-items-center gap-2' }, LL.icone(ic), h('span', { class: 'rotulo', text: rot })), v,
      extra ? h('div', { class: 'small text-body-secondary', text: extra }) : null)));
  }
  function renderRodape() {
    rodape.replaceChildren(h('div', { class: 'container d-flex flex-wrap justify-content-between gap-2' },
      h('span', { text: '© ' + new Date().getFullYear() + ' ' + (loja.nome || '') + ' · ' + (loja.dono || '') + ' · ' + (loja.local || '') }),
      h('nav', { class: 'd-flex gap-3', 'aria-label': 'Informação legal' }, h('a', { href: 'termos.html', text: 'Termos de Uso' }), h('a', { href: 'termos.html#privacidade', text: 'Política de Privacidade' }))));
  }

  // ================= Carrinho =================
  function guardarCarrinho() { LL.gravarLocal('ll_carrinho', carrinho); renderTopo(); renderCarrinho(); atualizarLoja(); }
  function adicionar(id) {
    const i = carrinho.find(x => x.id === id);
    if (i) i.qtd = Math.min(99, i.qtd + 1); else carrinho.push({ id, qtd: 1 });
    guardarCarrinho(); LL.aviso((produtos.find(p => p.id === id) || {}).nome + ' adicionado ao carrinho');
  }
  function resumo() {
    const linhas = carrinho.map(i => { const p = produtos.find(x => x.id === i.id); return p && { id: p.id, nome: p.nome, preco: p.preco, unidade: p.unidade, qtd: i.qtd }; }).filter(Boolean);
    return { linhas, total: linhas.reduce((s, l) => s + (l.preco == null ? 0 : l.preco * l.qtd), 0), consulta: linhas.some(l => l.preco == null) };
  }
  function renderCarrinho() {
    if (!carrinho.length) {
      corpoCarrinho.replaceChildren(h('div', { class: 'vazio my-auto' }, h('p', { class: 'mb-3', text: 'O carrinho está vazio.' }), h('a', { class: 'btn btn-primary', href: '#loja', 'data-bs-dismiss': 'offcanvas', text: 'Ver serviços' })));
      return;
    }
    const r = resumo();
    corpoCarrinho.replaceChildren(
      h('div', { class: 'flex-grow-1' }, r.linhas.map(l => {
        const mudar = d => { const i = carrinho.find(x => x.id === l.id); i.qtd = Math.max(0, Math.min(99, i.qtd + d)); carrinho = carrinho.filter(x => x.qtd > 0); guardarCarrinho(); };
        return h('div', { class: 'item-carrinho' },
          h('div', { style: 'min-width:0' }, h('div', { class: 'fw-semibold', text: l.nome }), h('div', { class: 'small text-body-secondary', text: LL.kz(l.preco) + (l.preco != null && l.unidade ? ' · ' + l.unidade : '') })),
          h('div', { class: 'fw-semibold text-end mono', text: l.preco == null ? '—' : LL.kz(l.preco * l.qtd) }),
          h('div', { class: 'qtd' }, h('button', { type: 'button', 'aria-label': 'Menos um', onclick: () => mudar(-1) }, '−'), h('span', { text: l.qtd }), h('button', { type: 'button', 'aria-label': 'Mais um', onclick: () => mudar(1) }, '+')),
          h('button', { class: 'btn btn-sm btn-link text-body-secondary text-end', type: 'button', onclick: () => mudar(-99), text: 'Remover' }));
      })),
      h('div', { class: 'pt-3 d-grid gap-2' },
        h('div', { class: 'total-linha' }, h('span', { text: 'Total' }), h('span', { class: 'preco', text: LL.kz(r.total) })),
        r.consulta ? h('div', { class: 'small text-body-secondary', text: 'Inclui serviços com preço sob consulta; o valor final é indicado na validação.' }) : null,
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => { bootstrap.Offcanvas.getOrCreateInstance(oc).hide(); sessao ? abrirPedido() : abrirAuth('registo', abrirPedido); } }, 'Finalizar pedido')));
  }

  // ================= Contas =================
  function abrirAuth(modo, depois) {
    if (depois) depoisDeEntrar = () => { mAuth.fechar(); depois(); };
    const erro = h('div', { class: 'small text-danger', role: 'alert' });
    const ok = h('div', { class: 'small text-success', role: 'status' });
    const nav = [['entrar', 'Entrar'], ['registo', 'Criar conta']].map(([m, t]) => h('li', { class: 'nav-item flex-fill' }, h('button', { type: 'button', class: 'nav-link w-100' + (modo === m ? ' active' : ''), onclick: () => abrirAuth(m) }, t)));
    const nome = LL.campo('au-nome', 'Nome completo', '', { max: '80', auto: 'name', req: true });
    const email = LL.campo('au-email', 'Email', '', { tipo: 'email', max: '120', auto: 'email', req: true });
    const tel = LL.campo('au-tel', 'Telefone', '', { tipo: 'tel', max: '20', auto: 'tel', ph: '9XX XXX XXX', req: true });
    const senha = LL.campo('au-senha', 'Palavra-passe', '', { tipo: 'password', max: '72', auto: modo === 'registo' ? 'new-password' : 'current-password', req: true, ajuda: modo === 'registo' ? 'Pelo menos 8 caracteres.' : null });
    const botao = h('button', { class: 'btn btn-primary btn-lg', type: 'submit', text: modo === 'registo' ? 'Criar conta' : modo === 'recuperar' ? 'Enviar ligação' : 'Entrar' });
    // Consentimento (Lei 22/11) e proteção contra robôs
    const aceito = h('input', { class: 'form-check-input', type: 'checkbox', id: 'au-termos' });
    const blocoTermos = modo === 'registo' ? h('div', { class: 'col-12 form-check ms-1' }, aceito, h('label', { class: 'form-check-label small', for: 'au-termos' },
      'Li e aceito os ', h('a', { href: 'termos.html', target: '_blank', rel: 'noopener', text: 'Termos de Uso' }), ' e a ', h('a', { href: 'termos.html#privacidade', target: '_blank', rel: 'noopener', text: 'Política de Privacidade' }), '.')) : null;
    const isco = h('input', { type: 'text', name: 'empresa_site', tabindex: '-1', autocomplete: 'off', class: 'isco', 'aria-hidden': 'true' });   // campo invisível: só robôs o preenchem
    const zonaCaptcha = h('div', { class: 'col-12' });
    const t0 = Date.now(); LL.captcha(zonaCaptcha);
    const form = h('form', { class: 'row g-3', novalidate: true, onsubmit: async e => {
      e.preventDefault(); erro.textContent = ''; ok.textContent = '';
      const em = email.campo.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { erro.textContent = 'Escreva um email válido.'; return; }
      if (isco.value || Date.now() - t0 < 2500) { erro.textContent = 'Não foi possível continuar. Tente outra vez.'; return; }
      if (modo === 'registo' && !aceito.checked) { erro.textContent = 'Para criar conta, aceite os Termos de Uso e a Política de Privacidade.'; return; }
      const captchaToken = LL.tokenCaptcha();
      if (LL.captchaAtivo() && !captchaToken) { erro.textContent = 'Confirme que não é um robô.'; return; }
      botao.disabled = true;
      try {
        if (modo === 'recuperar') {
          const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname, captchaToken });
          if (error) throw error; ok.textContent = 'Se existir uma conta com este email, enviámos uma ligação para criar uma nova palavra-passe.';
        } else if (modo === 'registo') {
          if (nome.campo.value.trim().length < 3) throw new Error('Escreva o seu nome completo.');
          if (LL.digitos(tel.campo.value).length < 9) throw new Error('Escreva um telefone com 9 algarismos.');
          if (senha.campo.value.length < 8) throw new Error('A palavra-passe tem de ter pelo menos 8 caracteres.');
          const { data, error } = await sb.auth.signUp({ email: em, password: senha.campo.value, options: { captchaToken, data: { nome: nome.campo.value.trim(), telefone: LL.digitos(tel.campo.value), aceitou_termos: new Date().toISOString() }, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) { form.replaceChildren(h('div', { class: 'col-12 text-center d-grid gap-2 py-3' }, LL.icone('email', 40), h('h3', { class: 'h5', text: 'Confirme o seu email' }), h('p', { class: 'mb-0', text: 'Enviámos uma mensagem para ' + em + '. Abra a ligação para ativar a conta e depois entre.' }))); return; }
          mAuth.fechar(); LL.aviso('Conta criada. Bem-vindo!');
        } else {
          const { error } = await sb.auth.signInWithPassword({ email: em, password: senha.campo.value, options: { captchaToken } });
          if (error) throw error;
          mAuth.fechar(); LL.aviso('Sessão iniciada');
        }
      } catch (er) { erro.textContent = LL.erro(er); LL.reiniciarCaptcha(); }
      botao.disabled = false;
    } },
      isco, modo === 'registo' ? nome : null, email, modo === 'registo' ? tel : null, modo !== 'recuperar' ? senha : null,
      blocoTermos, zonaCaptcha, h('div', { class: 'col-12' }, erro, ok), h('div', { class: 'col-12 d-grid' }, botao),
      h('div', { class: 'col-12 text-center small' }, modo === 'recuperar'
        ? h('button', { class: 'btn btn-link btn-sm', type: 'button', onclick: () => abrirAuth('entrar'), text: '← Voltar a entrar' })
        : modo === 'entrar' ? h('button', { class: 'btn btn-link btn-sm', type: 'button', onclick: () => abrirAuth('recuperar'), text: 'Esqueci-me da palavra-passe' }) : null));
    mAuth.titulo(modo === 'registo' ? 'Criar conta' : modo === 'recuperar' ? 'Recuperar palavra-passe' : 'Entrar');
    mAuth.corpo.replaceChildren(h('div', { class: 'd-grid gap-3' },
      modo !== 'recuperar' ? h('ul', { class: 'nav nav-pills gap-1' }, nav) : null,
      depoisDeEntrar ? h('p', { class: 'small text-body-secondary mb-0', text: 'Para continuar, entre na sua conta ou crie uma nova.' }) : null, form));
    mAuth.abrir();
  }

  function abrirNovaSenha() {
    const s1 = LL.campo('ns-1', 'Nova palavra-passe', '', { tipo: 'password', auto: 'new-password', max: '72' });
    const s2 = LL.campo('ns-2', 'Repita a palavra-passe', '', { tipo: 'password', auto: 'new-password', max: '72' });
    const erro = h('div', { class: 'small text-danger', role: 'alert' });
    mAuth.titulo('Nova palavra-passe');
    mAuth.corpo.replaceChildren(h('form', { class: 'row g-3', onsubmit: async e => {
      e.preventDefault(); erro.textContent = '';
      if (s1.campo.value.length < 8) { erro.textContent = 'Pelo menos 8 caracteres.'; return; }
      if (s1.campo.value !== s2.campo.value) { erro.textContent = 'As palavras-passe não coincidem.'; return; }
      const { error } = await sb.auth.updateUser({ password: s1.campo.value });
      if (error) { erro.textContent = LL.erro(error); return; }
      mAuth.fechar(); LL.aviso('Palavra-passe alterada');
    } }, s1, s2, h('div', { class: 'col-12' }, erro), h('div', { class: 'col-12 d-grid' }, h('button', { class: 'btn btn-primary', type: 'submit', text: 'Guardar' }))));
    mAuth.abrir();
  }

  // ================= Novo pedido =================
  function abrirPedido() {
    const r = resumo();
    if (!r.linhas.length) { LL.aviso('O carrinho está vazio.'); return; }
    const metodos = (loja.pagamentos || []).filter(m => m.ativo);
    let escolhido = metodos[0] ? metodos[0].nome : '';
    const detalhes = h('div', { class: 'mensagem-pronta' });
    const mostrarDetalhes = () => { const m = metodos.find(x => x.nome === escolhido); detalhes.textContent = m ? m.detalhes : 'O método de pagamento é combinado no chat.'; };
    const notas = LL.campo('pd-notas', 'Descreva o que precisa (opcional)', '', { area: true, max: '1000', ph: 'Ex.: quero o site com as cores da minha empresa e pronto até ao fim do mês.' });
    const erro = h('div', { class: 'small text-danger', role: 'alert' });
    const botao = h('button', { class: 'btn btn-primary btn-lg', type: 'submit', text: 'Enviar pedido' });
    // Cupão de desconto (validado no servidor)
    let cupao = '', descCupao = 0;
    const cupaoIn = h('input', { class: 'form-control text-uppercase', id: 'pd-cupao', maxlength: '20', placeholder: 'Código', autocomplete: 'off' });
    const cupaoMsg = h('div', { class: 'small', role: 'status' });
    const totalTxt = h('span', { text: LL.kz(r.total) + (r.consulta ? ' + sob consulta' : '') });
    const blocoCupao = h('div', null, h('label', { class: 'form-label', for: 'pd-cupao', text: 'Tem um cupão de desconto?' }),
      h('div', { class: 'input-group', style: 'max-width:360px' }, cupaoIn, h('button', { class: 'btn btn-outline-primary', type: 'button', onclick: async () => {
        const cod = cupaoIn.value.trim().toUpperCase(); if (!cod) return;
        const { data, error } = await sb.rpc('validar_cupao', { cod, subtotal: r.total });
        if (error || !data) { cupaoMsg.className = 'small text-danger'; cupaoMsg.textContent = LL.erro(error); return; }
        if (!data.ok) { cupao = ''; descCupao = 0; cupaoMsg.className = 'small text-danger'; cupaoMsg.textContent = data.motivo; totalTxt.textContent = LL.kz(r.total); return; }
        cupao = cod; descCupao = Number(data.desconto);
        cupaoMsg.className = 'small text-success'; cupaoMsg.textContent = 'Cupão aplicado: −' + LL.kz(descCupao);
        totalTxt.textContent = LL.kz(r.total - descCupao) + (r.consulta ? ' + sob consulta' : '');
      }, text: 'Aplicar' })), cupaoMsg);
    // Parcelamento: só a partir de 1.000 Kz (o servidor confirma esta regra)
    let parcelas = 1;
    const blocoParcelas = r.total >= 1000
      ? h('fieldset', null, h('legend', { class: 'form-label fs-6', text: 'Pagar de uma vez ou parcelar (até 3 vezes)?' }),
          h('div', { class: 'parcelas-opcoes' }, [1, 2, 3].map(n => {
            const id = 'pd-p-' + n, x = h('input', { class: 'btn-check', type: 'radio', name: 'pd-parc', id, autocomplete: 'off' });
            x.checked = n === 1; x.addEventListener('change', () => { parcelas = n; });
            return [x, h('label', { class: 'btn btn-outline-primary btn-sm', for: id, text: n === 1 ? 'De uma vez · ' + LL.kz(r.total) : n + '× de ' + LL.kz(Math.ceil(r.total / n)) })];
          })),
          r.consulta ? h('div', { class: 'form-text', text: 'Se o valor final mudar na validação, as prestações são recalculadas.' }) : null)
      : h('div', { class: 'small text-body-secondary', text: 'Valores abaixo de 1.000 Kz são pagos de uma só vez, sem parcelamento.' });
    mPedido.corpo.replaceChildren(h('form', { class: 'd-grid gap-3', onsubmit: async e => {
      e.preventDefault(); erro.textContent = ''; botao.disabled = true;
      const { data, error } = await sb.from('pedidos').insert({ itens: carrinho.map(i => ({ id: i.id, qtd: i.qtd })), notas: notas.campo.value.trim(), metodo_pagamento: escolhido, parcelas, cupao }).select().single();
      botao.disabled = false;
      if (error) { erro.textContent = LL.erro(error); return; }
      carrinho = []; guardarCarrinho(); mPedido.fechar();
      LL.aviso('Pedido ' + data.codigo + ' enviado. Vai receber a validação no chat.');
      abrirConta('pedidos');
    } },
      h('div', { class: 'p-3 rounded-3 caixa-suave' },
        r.linhas.map(l => h('div', { class: 'd-flex justify-content-between gap-2 small' }, h('span', { text: l.qtd + ' × ' + l.nome }), h('span', { class: 'mono', text: l.preco == null ? 'sob consulta' : LL.kz(l.preco * l.qtd) }))),
        h('div', { class: 'total-linha border-top mt-2 pt-2' }, h('span', { text: 'Total' }), totalTxt)),
      h('div', { class: 'small text-body-secondary', text: 'Pedido em nome de ' + (perfil.nome || perfil.email) + ' · ' + perfil.email }),
      metodos.length ? h('fieldset', null, h('legend', { class: 'form-label fs-6', text: 'Como vai pagar?' }), h('div', { class: 'row g-2' }, metodos.map((m, i) => {
        const r2 = h('input', { type: 'radio', name: 'pd-metodo', id: 'pd-m-' + i, value: m.nome }); r2.checked = m.nome === escolhido;
        r2.addEventListener('change', () => { escolhido = m.nome; mostrarDetalhes(); });
        return h('div', { class: 'col-sm-6' }, h('label', { class: 'opcao-canal', for: 'pd-m-' + i }, r2, h('span', { class: 'fw-semibold', text: m.nome })));
      })), h('div', { class: 'mt-2' }, h('div', { class: 'form-text mb-1', text: 'Dados para pagamento (pague só depois de o pedido ser validado):' }), detalhes)) : null,
      blocoCupao, blocoParcelas, notas, erro,
      h('p', { class: 'small text-body-secondary mb-0', text: 'Primeiro valido o pedido e confirmo o valor final. Depois paga e envia o comprovativo aqui no site.' }),
      h('div', { class: 'd-flex justify-content-end gap-2' }, h('button', { class: 'btn btn-outline-secondary', type: 'button', 'data-bs-dismiss': 'modal', text: 'Voltar' }), botao)));
    mostrarDetalhes(); mPedido.abrir();
  }

  // ================= A minha conta =================
  async function abrirConta(aba) {
    if (!sessao) { abrirAuth('entrar', () => abrirConta(aba)); return; }
    if (chatAtivo) { chatAtivo.parar(); chatAtivo = null; }
    const abas = [['pedidos', 'Pedidos'], ['historico', 'Histórico e comprovativos'], ['conversa', 'Conversa' + (naoLidas ? ' (' + naoLidas + ')' : '')], ['dados', 'Os meus dados']];
    const conteudo = h('div', { class: 'pt-3' });
    mConta.titulo('Olá, ' + ((perfil && perfil.nome.split(' ')[0]) || 'cliente'));
    mConta.corpo.replaceChildren(h('ul', { class: 'nav nav-pills gap-1' }, abas.map(([a, t]) => h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link' + (aba === a ? ' active' : ''), onclick: () => abrirConta(a) }, t)))), conteudo);
    mConta.abrir();
    if (aba === 'conversa') {
      chatAtivo = LL.chat({ clienteId: sessao.user.id, souAdmin: false, textoInicial: abrirConta.texto || '' }); abrirConta.texto = '';
      naoLidas = 0; renderTopo();
      conteudo.replaceChildren(h('p', { class: 'small text-body-secondary', text: 'Fale diretamente comigo. Pode anexar imagens ou PDF (até 10 MB).' }), chatAtivo.el);
      setTimeout(() => chatAtivo && chatAtivo.focar(), 400);
    } else if (aba === 'dados') contaDados(conteudo);
    else if (aba === 'historico') contaHistorico(conteudo);
    else contaPedidos(conteudo);
  }

  async function contaPedidos(c) {
    c.replaceChildren(h('div', { class: 'text-body-secondary small', text: 'A carregar pedidos…' }));
    // Filtra SEMPRE pela conta atual: o administrador tem acesso a tudo, mas na área de cliente só vê o que é dele.
    const uid = sessao.user.id;
    const p = await sb.from('pedidos').select('*').eq('cliente_id', uid).order('criado', { ascending: false });
    if (p.error) { c.replaceChildren(h('p', { class: 'text-danger', text: LL.erro(p.error) })); return; }
    const ids = p.data.map(x => x.id);
    const e = ids.length ? await sb.from('entregas').select('*').in('pedido_id', ids).order('criado') : { data: [] };
    minhasAvaliacoes = {};
    if (ids.length) { const av = await sb.from('avaliacoes').select('*').eq('cliente_id', uid); (av.data || []).forEach(a => { minhasAvaliacoes[a.pedido_id + ':' + (a.produto_id || '')] = a; }); }
    if (!p.data.length) { c.replaceChildren(h('div', { class: 'vazio' }, h('p', { text: 'Ainda não fez nenhum pedido.' }), h('a', { class: 'btn btn-primary', href: '#loja', 'data-bs-dismiss': 'modal', text: 'Ver serviços' }))); return; }
    c.replaceChildren(h('div', { class: 'd-grid gap-3' }, p.data.map(ped => cartaoPedido(ped, (e.data || []).filter(x => x.pedido_id === ped.id), c))));
  }

  function cartaoPedido(p, entregas, contentor) {
    const metodo = (loja.pagamentos || []).find(m => m.nome === p.metodo_pagamento);
    const podePagar = p.estado === 'validado' || p.estado === 'comprovativo';
    const ficheiro = h('input', { type: 'file', class: 'd-none', accept: 'image/jpeg,image/png,image/webp,application/pdf' });
    const estadoEnvio = h('div', { class: 'small', role: 'status' });
    ficheiro.addEventListener('change', async () => {
      const f = ficheiro.files[0]; ficheiro.value = ''; if (!f) return;
      if (f.size > 10 * 1048576) { estadoEnvio.className = 'small text-danger'; estadoEnvio.textContent = 'O ficheiro tem mais de 10 MB.'; return; }
      if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { estadoEnvio.className = 'small text-danger'; estadoEnvio.textContent = 'Envie uma imagem ou um PDF.'; return; }
      estadoEnvio.className = 'small'; estadoEnvio.textContent = 'A enviar o comprovativo…';
      try {
        const path = sessao.user.id + '/comprovativos/' + p.codigo + '-' + Date.now() + '-' + LL.nomeSeguro(f.name);
        const up = await sb.storage.from('anexos').upload(path, f, { contentType: f.type }); if (up.error) throw up.error;
        const { error } = await sb.from('mensagens').insert({ cliente_id: sessao.user.id, autor: 'cliente', tipo: 'comprovativo', pedido_id: p.id, texto: 'Comprovativo de pagamento do pedido ' + p.codigo + (p.parcelas > 1 ? ' (prestação ' + ((p.parcelas_pagas || 0) + 1) + '/' + p.parcelas + ')' : ''), anexo_path: path, anexo_nome: f.name.slice(0, 120), anexo_tipo: f.type });
        if (error) throw error;
        LL.aviso('Comprovativo enviado. Vou confirmar o pagamento em breve.'); contaPedidos(contentor);
      } catch (er) { estadoEnvio.className = 'small text-danger'; estadoEnvio.textContent = LL.erro(er); }
    });
    return h('article', { class: 'card' }, h('div', { class: 'card-body d-grid gap-3' },
      h('div', { class: 'd-flex flex-wrap align-items-center gap-2' }, h('strong', { class: 'mono', text: p.codigo }), LL.selo(p.estado), h('span', { class: 'small text-body-secondary ms-auto', text: LL.data(p.criado) })),
      LL.linhaTempo(p.estado),
      p.estado === 'pago' ? h('div', { class: 'd-grid gap-1' },
        h('div', { class: 'd-flex justify-content-between small' }, h('span', { class: 'fw-semibold', text: 'Progresso do projeto' + (p.etapa ? ': ' + p.etapa : '') }), h('span', { class: 'mono', text: (p.progresso || 0) + '%' })),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(p.progresso || 0), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Progresso' }, h('div', { class: 'progress-bar', style: 'width:' + (p.progresso || 0) + '%' })),
        p.prazo ? h('div', { class: 'small text-body-secondary', text: 'Entrega prevista: ' + new Date(p.prazo + 'T12:00:00').toLocaleDateString('pt-PT') }) : null) : null,
      p.cupao ? h('div', { class: 'small text-success', text: 'Cupão ' + p.cupao + ' aplicado' }) : null,
      h('div', { class: 'small' }, p.itens.map(i => h('div', { class: 'd-flex justify-content-between gap-2' }, h('span', { text: i.qtd + ' × ' + i.nome }), h('span', { class: 'mono', text: i.preco == null ? 'sob consulta' : LL.kz(i.preco * i.qtd) }))),
        h('div', { class: 'total-linha border-top mt-2 pt-2' }, h('span', { text: 'Total a pagar' }), h('span', { text: LL.kz(p.total) + (p.tem_consulta && p.estado === 'pendente' ? ' + sob consulta' : '') }))),
      Number(p.desconto) > 0 ? h('div', { class: 'small text-success fw-semibold', text: 'Desconto aplicado: ' + LL.kz(p.desconto) }) : null,
      p.estado !== 'pendente' && p.parcelas === 1 && p.total >= 1000 ? h('div', { class: 'small text-body-secondary', text: 'Pagamento de uma só vez.' }) : null,
      p.parcelas > 1 ? h('div', { class: 'small' }, h('strong', { text: p.parcelas + ' prestações de ' + LL.kz(Math.ceil(p.total / p.parcelas)) }), ' · pagas ' + (p.parcelas_pagas || 0) + ' de ' + p.parcelas) : null,
      p.nota_admin ? h('div', { class: 'alert alert-info mb-0 small', text: p.nota_admin }) : null,
      podePagar ? h('div', { class: 'caixa-pagamento d-grid gap-2' },
        h('div', { class: 'fw-semibold', text: 'Pagamento: ' + (p.metodo_pagamento || 'a combinar') }),
        p.parcelas > 1 ? h('div', { text: 'Agora: prestação ' + ((p.parcelas_pagas || 0) + 1) + ' de ' + p.parcelas + ' — ' + LL.kz(Math.ceil(p.total / p.parcelas)) }) : null,
        metodo ? h('div', { class: 'mensagem-pronta', text: metodo.detalhes }) : null,
        p.estado === 'comprovativo' ? h('div', { class: 'small text-body-secondary', text: 'Comprovativo recebido. Pode enviar outro se for preciso.' }) : null,
        h('div', { class: 'd-flex gap-2 flex-wrap' }, h('label', { class: 'btn btn-primary' }, LL.icone('clipe'), ' Enviar comprovativo', ficheiro)), estadoEnvio) : null,
      p.estado === 'concluido' ? h('div', { class: 'd-grid gap-2' }, h('div', { class: 'fw-semibold', text: 'Ficheiros do projeto' }),
        entregas.length ? entregas.map(en => h('button', { class: 'btn btn-outline-primary text-start d-flex align-items-center gap-2', type: 'button', onclick: () => LL.abrirPrivado('entregas', en.path, true) }, LL.icone('descarregar'), h('span', { class: 'flex-grow-1 text-truncate', text: en.nome }), h('span', { class: 'small mono', text: LL.tamanho(en.tamanho) })))
          : h('div', { class: 'small text-body-secondary', text: 'O projeto foi entregue. Veja a conversa para mais detalhes.' })) : null,
      p.estado === 'concluido' ? h('div', { class: 'd-grid gap-2' }, p.itens.map(i => formAvaliacao(p, i, minhasAvaliacoes[p.id + ':' + i.id], contentor))) : null,
      h('div', null, h('button', { class: 'btn btn-link btn-sm px-0', type: 'button', onclick: () => { abrirConta.texto = 'Sobre o pedido ' + p.codigo + ': '; abrirConta('conversa'); } }, LL.icone('chat', 14), ' Falar sobre este pedido'))));
  }

  // ================= Histórico e comprovativos de compra =================
  async function contaHistorico(c) {
    c.replaceChildren(h('div', { class: 'small text-body-secondary', text: 'A carregar…' }));
    const uid = sessao.user.id;
    const [pg, pd] = await Promise.all([
      sb.from('pagamentos').select('*').eq('cliente_id', uid).order('criado', { ascending: false }),
      sb.from('pedidos').select('*').eq('cliente_id', uid).order('criado', { ascending: false })]);
    if (pg.error || pd.error) { c.replaceChildren(h('p', { class: 'text-danger', text: LL.erro(pg.error || pd.error) })); return; }
    const pedidosPorId = {}; pd.data.forEach(p => { pedidosPorId[p.id] = p; });
    const totalPago = pg.data.reduce((s, x) => s + Number(x.valor), 0);
    const emDivida = pd.data.filter(p => p.estado === 'validado' || p.estado === 'comprovativo').reduce((s, p) => s + Number(p.total) - pg.data.filter(x => x.pedido_id === p.id).reduce((a, x) => a + Number(x.valor), 0), 0);
    const kpi = (r, v) => h('div', { class: 'col-6 col-md-3' }, h('div', { class: 'kpi' }, h('div', { class: 'rotulo', text: r }), h('div', { class: 'v', text: v })));
    c.replaceChildren(h('div', { class: 'd-grid gap-3' },
      h('div', { class: 'row g-3' }, kpi('Pedidos', String(pd.data.length)), kpi('Concluídos', String(pd.data.filter(p => p.estado === 'concluido').length)), kpi('Total pago', LL.kz(totalPago)), kpi('Por pagar', LL.kz(Math.max(0, emDivida)))),
      h('h3', { class: 'h6 mb-0 mt-2', text: 'Pagamentos confirmados' }),
      pg.data.length ? h('div', { class: 'tabela-wrap' }, h('table', { class: 'table align-middle mb-0' },
        h('thead', null, h('tr', null, ['Data', 'Comprovativo', 'Pedido', 'Prestação', 'Valor', ''].map((t, i) => h('th', { class: i === 4 ? 'num' : '', text: t })))),
        h('tbody', null, pg.data.map(x => h('tr', null,
          h('td', { class: 'small mono', text: LL.data(x.criado) }), h('td', { class: 'mono', text: x.numero }), h('td', { class: 'mono', text: (pedidosPorId[x.pedido_id] || {}).codigo || '—' }),
          h('td', { text: x.de > 1 ? x.prestacao + ' de ' + x.de : 'Única' }), h('td', { class: 'num mono', text: LL.kz(x.valor) }),
          h('td', null, h('button', { class: 'btn btn-sm btn-outline-primary', type: 'button', onclick: () => comprovativoCompra(x, pedidosPorId[x.pedido_id]), text: 'Ver comprovativo' }))))))) 
        : h('div', { class: 'vazio', text: 'Ainda não há pagamentos confirmados. Os comprovativos aparecem aqui assim que eu confirmar cada pagamento.' }),
      h('h3', { class: 'h6 mb-0 mt-2', text: 'Todos os pedidos' }),
      pd.data.length ? h('div', { class: 'list-group' }, pd.data.map(p => h('div', { class: 'list-group-item d-flex flex-wrap gap-2 align-items-center' },
        h('span', { class: 'mono fw-semibold', text: p.codigo }), LL.selo(p.estado), h('span', { class: 'small text-body-secondary', text: LL.data(p.criado) }),
        h('span', { class: 'small text-truncate', style: 'max-width:260px', text: p.itens.map(i => i.nome).join(', ') }), h('span', { class: 'ms-auto mono fw-semibold', text: LL.kz(p.total) })))) : h('div', { class: 'vazio', text: 'Ainda não fez nenhum pedido.' })));
  }

  // Comprovativo de compra (recibo simples, não é fatura fiscal) — abre numa janela própria para imprimir ou guardar em PDF
  function comprovativoCompra(pag, ped) {
    ped = ped || { codigo: '—', itens: [], total: pag.valor, desconto: 0 };
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const linhas = ped.itens.map(i => '<tr><td>' + i.qtd + ' × ' + esc(i.nome) + '</td><td class="n">' + (i.preco == null ? 'consulta' : esc(LL.kz(i.preco * i.qtd))) + '</td></tr>').join('');
    const html = '<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Comprovativo ' + esc(pag.numero) + '</title><style>'
      + 'body{font:14px/1.5 system-ui,sans-serif;color:#0F201C;max-width:640px;margin:24px auto;padding:0 16px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{padding:6px 0;border-bottom:1px solid #ddd;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}'
      + '.cab{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0E7666;padding-bottom:12px;margin-bottom:12px}.tot{font-size:18px;font-weight:700}.nota{font-size:12px;color:#53645E;margin-top:24px}.selo{display:inline-block;border:2px solid #1B7A3E;color:#1B7A3E;font-weight:700;padding:4px 10px;border-radius:6px;transform:rotate(-4deg)}button{margin-top:16px;padding:10px 16px;font:inherit;background:#0E7666;color:#fff;border:0;border-radius:8px;cursor:pointer}@media print{button{display:none}}'
      + '</style></head><body><div class="cab"><div><h1>' + esc(loja.nome || 'LeloLabs') + '</h1><div>' + esc(loja.dono || '') + '</div><div>' + esc(loja.local || '') + '</div><div>' + esc(loja.email || '') + (loja.telefone ? ' · ' + esc(LL.tel(loja.telefone)) : '') + '</div></div>'
      + '<div style="text-align:right"><strong>COMPROVATIVO DE PAGAMENTO</strong><div>N.º ' + esc(pag.numero) + '</div><div>' + esc(LL.data(pag.criado)) + '</div></div></div>'
      + '<p><strong>Cliente:</strong> ' + esc(perfil.nome) + '<br><strong>Email:</strong> ' + esc(perfil.email) + (perfil.telefone ? '<br><strong>Telefone:</strong> ' + esc(LL.tel(perfil.telefone)) : '') + '</p>'
      + '<p><strong>Pedido:</strong> ' + esc(ped.codigo) + '</p><table><thead><tr><th>Serviço</th><th class="n">Valor</th></tr></thead><tbody>' + linhas + '</tbody></table>'
      + (Number(ped.desconto) > 0 ? '<p class="n">Desconto: −' + esc(LL.kz(ped.desconto)) + '</p>' : '')
      + '<p class="n">Total do pedido: ' + esc(LL.kz(ped.total)) + '</p>'
      + '<p class="n">Pagamento: ' + (pag.de > 1 ? 'prestação ' + pag.prestacao + ' de ' + pag.de : 'pagamento único') + (pag.metodo ? ' · ' + esc(pag.metodo) : '') + '</p>'
      + '<p class="n tot">Valor recebido: ' + esc(LL.kz(pag.valor)) + '</p><p><span class="selo">PAGO</span></p>'
      + '<p class="nota">Este documento comprova o pagamento recebido e não substitui fatura. Verificação: ' + esc(pag.numero) + '.</p>'
      + '<button onclick="window.print()">Imprimir / Guardar em PDF</button></body></html>';
    const w = window.open('', '_blank');
    if (!w) { LL.aviso('Permita janelas pop-up para ver o comprovativo.', 'erro'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  function contaDados(c) {
    const nome = LL.campo('cd-nome', 'Nome', perfil.nome, { max: '80', auto: 'name', col: 'col-md-6' });
    const tel = LL.campo('cd-tel', 'Telefone', perfil.telefone, { tipo: 'tel', max: '20', auto: 'tel', col: 'col-md-6' });
    const msg = h('div', { class: 'small', role: 'status' });
    c.replaceChildren(h('form', { class: 'row g-3', style: 'max-width:640px', onsubmit: async e => {
      e.preventDefault();
      if (nome.campo.value.trim().length < 3) { msg.className = 'small text-danger'; msg.textContent = 'Escreva o seu nome completo.'; return; }
      const { error } = await sb.from('perfis').update({ nome: nome.campo.value.trim(), telefone: LL.digitos(tel.campo.value) }).eq('id', sessao.user.id);
      if (error) { msg.className = 'small text-danger'; msg.textContent = LL.erro(error); return; }
      perfil.nome = nome.campo.value.trim(); perfil.telefone = LL.digitos(tel.campo.value); renderTopo();
      msg.className = 'small text-success'; msg.textContent = 'Dados guardados.';
    } }, nome, tel,
      h('div', { class: 'col-12' }, h('div', { class: 'form-label', text: 'Email' }), h('div', { class: 'mono', text: perfil.email }), h('div', { class: 'form-text', text: 'É para este email que envio avisos sobre os seus projetos.' })),
      h('div', { class: 'col-12' }, msg),
      h('div', { class: 'col-12 d-flex gap-2 flex-wrap' }, h('button', { class: 'btn btn-primary', type: 'submit', text: 'Guardar' }),
        h('button', { class: 'btn btn-outline-danger ms-auto', type: 'button', onclick: async () => { await sb.auth.signOut(); mConta.fechar(); LL.aviso('Sessão terminada'); }, text: 'Terminar sessão' })),
      h('div', { class: 'col-12 border-top pt-3 small text-body-secondary' }, 'Os seus direitos: pode consultar, corrigir ou pedir a eliminação dos seus dados (',
        h('a', { href: 'termos.html#privacidade', target: '_blank', rel: 'noopener', text: 'Política de Privacidade' }), '). ',
        h('button', { class: 'btn btn-link btn-sm p-0 align-baseline', type: 'button', onclick: () => { abrirConta.texto = 'Peço a eliminação da minha conta e dos meus dados pessoais.'; abrirConta('conversa'); }, text: 'Pedir eliminação da conta' }))));
  }

  carregar();
})();
