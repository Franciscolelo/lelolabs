/* LeloLabs — loja pública e área do cliente */
'use strict';
(function () {
  const { h, sb } = LL;
  const raiz = document.getElementById('raiz');
  if (!LL.configurado) { raiz.replaceChildren(LL.avisoConfig()); return; }

  let loja = {}, produtos = [], trabalhos = [], sessao = null, perfil = null;
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
    const [l, p, t] = await Promise.all([
      sb.from('loja').select('dados').eq('id', 1).maybeSingle(),
      sb.from('produtos').select('*').eq('ativo', true).order('ordem').order('criado'),
      sb.from('trabalhos').select('*').order('ordem').order('criado', { ascending: false })
    ]);
    if (l.error || p.error || t.error) {
      principal.replaceChildren(h('div', { class: 'container py-5 text-center' }, h('p', { class: 'fw-semibold', text: 'Não foi possível carregar a loja.' }), h('p', { class: 'text-body-secondary', text: LL.erro(l.error || p.error || t.error) })));
      return;
    }
    loja = (l.data && l.data.dados) || {}; produtos = p.data; trabalhos = t.data;
    document.title = loja.nome || 'LeloLabs';
    carrinho = carrinho.filter(i => produtos.some(x => x.id === i.id));
    renderTudo();
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
      if (s) carregarPerfil(); else { perfil = null; pararAvisos(); renderTopo(); }
    }, 0);
  });
  async function carregarPerfil() {
    const { data } = await sb.from('perfis').select('*').eq('id', sessao.user.id).maybeSingle();
    perfil = data || { id: sessao.user.id, nome: '', email: sessao.user.email, telefone: '' };
    renderTopo(); iniciarAvisos();
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
  function renderTudo() { renderTopo(); principal.replaceChildren(secHeroi(), secLoja(), secTrabalhos(), secContacto()); renderRodape(); renderCarrinho(); }
  const totalItens = () => carrinho.reduce((s, i) => s + i.qtd, 0);

  function renderTopo() {
    const n = totalItens();
    topo.replaceChildren(h('div', { class: 'container' },
      h('a', { class: 'marca', href: '#inicio' }, LL.logo(), loja.nome || 'LeloLabs'),
      h('nav', { 'aria-label': 'Secções' }, h('a', { href: '#loja', text: 'Serviços' }), h('a', { href: '#trabalhos', text: 'Trabalhos' }), h('a', { href: '#contacto', text: 'Contacto' })),
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
          h('div', null, h('div', { class: 'preco', text: LL.kz(p.preco) }), h('div', { class: 'small text-body-secondary', text: p.unidade })),
          h('div', { class: 'd-flex gap-2' },
            h('button', { class: 'btn btn-outline-secondary', type: 'button', onclick: () => abrirDetalhe(p), text: 'Detalhes' }),
            h('button', { class: 'btn ' + (no ? 'btn-outline-primary' : 'btn-primary'), type: 'button', onclick: () => adicionar(p.id) }, no ? 'Mais 1 (' + no.qtd + ')' : 'Adicionar')))));
  }

  function abrirDetalhe(p) {
    mDetalhe.titulo(p.nome);
    mDetalhe.corpo.replaceChildren(h('div', { class: 'd-grid gap-3' },
      LL.galeria(p.imagens, p.nome, 'capa-grande'),
      h('div', { class: 'd-flex justify-content-between align-items-end flex-wrap gap-2' },
        h('div', null, h('span', { class: 'etiqueta', text: p.categoria }), h('div', { class: 'preco mt-2', text: LL.kz(p.preco) }), h('div', { class: 'small text-body-secondary', text: p.unidade })),
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => { adicionar(p.id); mDetalhe.fechar(); } }, LL.icone('carrinho'), ' Adicionar ao carrinho')),
      p.descricao ? h('p', { class: 'mb-0', text: p.descricao }) : null,
      (p.itens || []).length ? h('ul', { class: 'lista-itens' }, p.itens.map(i => h('li', { text: i }))) : null));
    mDetalhe.abrir();
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
            h('div', { class: 'mt-auto d-flex gap-3 flex-wrap' },
              LL.url(t.video_url) ? h('a', { class: 'fw-semibold text-decoration-none', href: LL.url(t.video_url), target: '_blank', rel: 'noopener noreferrer', text: '▶ Ver vídeo' }) : null,
              LL.url(t.link) ? h('a', { class: 'fw-semibold text-decoration-none', href: LL.url(t.link), target: '_blank', rel: 'noopener noreferrer', text: 'Abrir projeto ↗' }) : null))))))
        : h('div', { class: 'vazio', text: 'Os trabalhos serão publicados em breve.' })));
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
      h('span', { text: '© ' + new Date().getFullYear() + ' ' + (loja.nome || '') + ' · ' + (loja.dono || '') }), h('span', { text: loja.local || '' })));
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
    const form = h('form', { class: 'row g-3', novalidate: true, onsubmit: async e => {
      e.preventDefault(); erro.textContent = ''; ok.textContent = '';
      const em = email.campo.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { erro.textContent = 'Escreva um email válido.'; return; }
      botao.disabled = true;
      try {
        if (modo === 'recuperar') {
          const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
          if (error) throw error; ok.textContent = 'Se existir uma conta com este email, enviámos uma ligação para criar uma nova palavra-passe.';
        } else if (modo === 'registo') {
          if (nome.campo.value.trim().length < 3) throw new Error('Escreva o seu nome completo.');
          if (LL.digitos(tel.campo.value).length < 9) throw new Error('Escreva um telefone com 9 algarismos.');
          if (senha.campo.value.length < 8) throw new Error('A palavra-passe tem de ter pelo menos 8 caracteres.');
          const { data, error } = await sb.auth.signUp({ email: em, password: senha.campo.value, options: { data: { nome: nome.campo.value.trim(), telefone: LL.digitos(tel.campo.value) }, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) { form.replaceChildren(h('div', { class: 'col-12 text-center d-grid gap-2 py-3' }, LL.icone('email', 40), h('h3', { class: 'h5', text: 'Confirme o seu email' }), h('p', { class: 'mb-0', text: 'Enviámos uma mensagem para ' + em + '. Abra a ligação para ativar a conta e depois entre.' }))); return; }
          mAuth.fechar(); LL.aviso('Conta criada. Bem-vindo!');
        } else {
          const { error } = await sb.auth.signInWithPassword({ email: em, password: senha.campo.value });
          if (error) throw error;
          mAuth.fechar(); LL.aviso('Sessão iniciada');
        }
      } catch (er) { erro.textContent = LL.erro(er); }
      botao.disabled = false;
    } },
      modo === 'registo' ? nome : null, email, modo === 'registo' ? tel : null, modo !== 'recuperar' ? senha : null,
      h('div', { class: 'col-12' }, erro, ok), h('div', { class: 'col-12 d-grid' }, botao),
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
      const { data, error } = await sb.from('pedidos').insert({ itens: carrinho.map(i => ({ id: i.id, qtd: i.qtd })), notas: notas.campo.value.trim(), metodo_pagamento: escolhido, parcelas }).select().single();
      botao.disabled = false;
      if (error) { erro.textContent = LL.erro(error); return; }
      carrinho = []; guardarCarrinho(); mPedido.fechar();
      LL.aviso('Pedido ' + data.codigo + ' enviado. Vai receber a validação no chat.');
      abrirConta('pedidos');
    } },
      h('div', { class: 'p-3 rounded-3 caixa-suave' },
        r.linhas.map(l => h('div', { class: 'd-flex justify-content-between gap-2 small' }, h('span', { text: l.qtd + ' × ' + l.nome }), h('span', { class: 'mono', text: l.preco == null ? 'sob consulta' : LL.kz(l.preco * l.qtd) }))),
        h('div', { class: 'total-linha border-top mt-2 pt-2' }, h('span', { text: 'Total' }), h('span', { text: LL.kz(r.total) + (r.consulta ? ' + sob consulta' : '') }))),
      h('div', { class: 'small text-body-secondary', text: 'Pedido em nome de ' + (perfil.nome || perfil.email) + ' · ' + perfil.email }),
      metodos.length ? h('fieldset', null, h('legend', { class: 'form-label fs-6', text: 'Como vai pagar?' }), h('div', { class: 'row g-2' }, metodos.map((m, i) => {
        const r2 = h('input', { type: 'radio', name: 'pd-metodo', id: 'pd-m-' + i, value: m.nome }); r2.checked = m.nome === escolhido;
        r2.addEventListener('change', () => { escolhido = m.nome; mostrarDetalhes(); });
        return h('div', { class: 'col-sm-6' }, h('label', { class: 'opcao-canal', for: 'pd-m-' + i }, r2, h('span', { class: 'fw-semibold', text: m.nome })));
      })), h('div', { class: 'mt-2' }, h('div', { class: 'form-text mb-1', text: 'Dados para pagamento (pague só depois de o pedido ser validado):' }), detalhes)) : null,
      blocoParcelas, notas, erro,
      h('p', { class: 'small text-body-secondary mb-0', text: 'Primeiro valido o pedido e confirmo o valor final. Depois paga e envia o comprovativo aqui no site.' }),
      h('div', { class: 'd-flex justify-content-end gap-2' }, h('button', { class: 'btn btn-outline-secondary', type: 'button', 'data-bs-dismiss': 'modal', text: 'Voltar' }), botao)));
    mostrarDetalhes(); mPedido.abrir();
  }

  // ================= A minha conta =================
  async function abrirConta(aba) {
    if (!sessao) { abrirAuth('entrar', () => abrirConta(aba)); return; }
    if (chatAtivo) { chatAtivo.parar(); chatAtivo = null; }
    const abas = [['pedidos', 'Pedidos'], ['conversa', 'Conversa' + (naoLidas ? ' (' + naoLidas + ')' : '')], ['dados', 'Os meus dados']];
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
      h('div', null, h('button', { class: 'btn btn-link btn-sm px-0', type: 'button', onclick: () => { abrirConta.texto = 'Sobre o pedido ' + p.codigo + ': '; abrirConta('conversa'); } }, LL.icone('chat', 14), ' Falar sobre este pedido'))));
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
        h('button', { class: 'btn btn-outline-danger ms-auto', type: 'button', onclick: async () => { await sb.auth.signOut(); mConta.fechar(); LL.aviso('Sessão terminada'); }, text: 'Terminar sessão' }))));
  }

  carregar();
})();
