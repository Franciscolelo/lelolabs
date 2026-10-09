/* LeloLabs — painel de administração local (corre no navegador do administrador). */
(function () {
  'use strict';
  var IMG_OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  var VID_OK = /^data:video\/(mp4|webm);base64,[A-Za-z0-9+/=]+$/;
  var ESTADOS = { novo: ['Novo', 'text-bg-warning'], confirmado: ['Confirmado', 'text-bg-info'], pago: ['Pago', 'text-bg-primary'], entregue: ['Entregue', 'text-bg-success'], cancelado: ['Cancelado', 'text-bg-secondary'] };
  var TIPOS = { imagem: 'Imagem', video: 'Vídeo', projeto: 'Projeto' };
  var estado = { loja: { nome: '', dono: '', slogan: '', sobre: '', stack: '', local: '', telAlt: '' }, canais: [], produtos: [], trabalhos: [] };
  var carrinho = lerLocal('ll_carrinho', []);
  var filtroCat = 'Todos', busca = '', filtroTrab = 'todos';
  var alterado = false;
  var SESSAO_MS = 2 * 60 * 60 * 1000;
  var MAX_VIDEO = 4 * 1024 * 1024;
  var LIMITE = 25 * 1024 * 1024;
  var ORIGINAL = JSON.stringify(estado);
  var vendas = [], pararVendas = null, tentativas = 0, bloqueadoAte = 0;

  // ----- Base de dados local (localStorage), com a mesma interface usada pelo painel -----
  var CHAVE_BD = 'lelolabs_painel_bd', ouvintes = [];
  function lerBD() { try { return JSON.parse(localStorage.getItem(CHAVE_BD)) || {}; } catch (e) { return {}; } }
  function gravarBD(o) { localStorage.setItem(CHAVE_BD, JSON.stringify(o)); ouvintes.forEach(function (f) { f(); }); }
  function colecao(filtros) {
    return {
      doc: function (id) {
        return {
          id: id,
          get: function () { var b = lerBD(); return Promise.resolve({ exists: !!b[id], data: function () { return b[id]; } }); },
          set: function (d) { try { var b = lerBD(); b[id] = JSON.parse(JSON.stringify(d)); gravarBD(b); return Promise.resolve(); } catch (e) { return Promise.reject(e); } },
          update: function (d) { var b = lerBD(); if (!b[id]) return Promise.reject(new Error('Documento inexistente')); Object.assign(b[id], d); gravarBD(b); return Promise.resolve(); },
          delete: function () { var b = lerBD(); delete b[id]; gravarBD(b); return Promise.resolve(); }
        };
      },
      where: function (campo, op, valor) { return colecao(filtros.concat([[campo, valor]])); },
      onSnapshot: function (seguinte) {
        var f = function () {
          var b = lerBD();
          seguinte({ docs: Object.keys(b).filter(function (k) { return b[k] && filtros.every(function (x) { return b[k][x[0]] === x[1]; }); })
            .map(function (k) { return { id: k, data: function () { return b[k]; } }; }) });
        };
        ouvintes.push(f); f();
        return function () { ouvintes = ouvintes.filter(function (g) { return g !== f; }); };
      }
    };
  }
  var cap = { artefacto: null, user: null, db: { collection: function () { return colecao([]); } }, uid: 'local' };
  // ================= Utilitários =================
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // só para SVG constantes
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) junta(el, arguments[i]);
    return el;
  }
  function junta(el, f) {
    if (f == null || f === false) return;
    if (Array.isArray(f)) { f.forEach(function (x) { junta(el, x); }); return; }
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  var SVG = {
    carrinho: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
    whatsapp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9c.4 2.4 2.4 4.6 5 5"/>',
    sms: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
    chamada: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'
  };
  function icone(n, t) { return h('span', { class: 'ico', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" width="' + (t || 18) + '" height="' + (t || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + SVG[n] + '</svg>' }); }
  function logo() { return h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="var(--acento)"/><path d="M16 14v36h18" stroke="var(--acento-tinta)" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 14v22h16" stroke="#F0B84A" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' }); }

  function kz(n) { return n == null || n === '' || isNaN(n) ? 'Sob consulta' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' Kz'; }
  function urlSegura(s) { try { var u = new URL(String(s).trim()); return u.protocol === 'https:' ? u.href : ''; } catch (e) { return ''; } }
  function digitos(s) { return String(s || '').replace(/\D/g, ''); }
  function intl(s) { var d = digitos(s); return d.length === 9 ? '244' + d : d; }
  function iniciais(t) { return String(t || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase(); }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function codigoPedido() { return 'LL-' + Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase(); }
  function lerLocal(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function gravarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function sessao(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function canal(id) { return estado.canais.filter(function (c) { return c.id === id; })[0]; }
  function produto(id) { return estado.produtos.filter(function (p) { return p.id === id; })[0]; }
  function b64url(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function deB64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function dataCurta(ms) { var d = new Date(ms); return d.toLocaleDateString('pt-PT') + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }); }

  function copiar(texto, botao, alvo) {
    var ok = function () { var t = botao.innerHTML; botao.textContent = 'Copiado'; setTimeout(function () { botao.innerHTML = t; }, 1500); };
    try { navigator.clipboard.writeText(texto).then(ok, function () { selecionar(alvo); }); } catch (e) { selecionar(alvo); }
  }
  function selecionar(el) { if (!el) return; var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  // Bootstrap (com alternativa simples se o CDN falhar)
  function mostrar(el, tipo) {
    if (window.bootstrap && bootstrap[tipo]) { bootstrap[tipo].getOrCreateInstance(el).show(); return; }
    el.classList.add('show'); el.style.display = 'block'; el.removeAttribute('aria-hidden');
  }
  function esconder(el, tipo) {
    if (window.bootstrap && bootstrap[tipo]) { var i = bootstrap[tipo].getInstance(el); if (i) i.hide(); return; }
    el.classList.remove('show'); el.style.display = 'none';
  }
  function aviso(texto) {
    var t = h('div', { class: 'toast align-items-center', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'd-flex' }, h('div', { class: 'toast-body', text: texto })));
    zonaAvisos.append(t);
    if (window.bootstrap) { var x = bootstrap.Toast.getOrCreateInstance(t, { delay: 2200 }); t.addEventListener('hidden.bs.toast', function () { t.remove(); }); x.show(); }
    else setTimeout(function () { t.remove(); }, 2200);
  }

  // Tema do Bootstrap acompanha o tema do Claude
  function sincronizarTema() {
    var r = document.documentElement, t = r.getAttribute('data-theme');
    if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    r.setAttribute('data-bs-theme', t);
  }
  sincronizarTema();
  new MutationObserver(sincronizarTema).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sincronizarTema); } catch (e) {}

  // ================= Estrutura =================
  var raiz = document.getElementById('raiz');
  var topo = h('header', { class: 'topo' });
  var principal = h('main');
  var rodape = h('footer', { class: 'rodape' });
  var zonaAvisos = h('div', { class: 'toast-container position-fixed bottom-0 start-50 translate-middle-x p-3', style: 'z-index:1090' });
  var camadaAdmin = h('div');

  var corpoCarrinho = h('div', { class: 'offcanvas-body d-flex flex-column' });
  var oc = h('div', { class: 'offcanvas offcanvas-end', tabindex: '-1', id: 'oc-carrinho', 'aria-labelledby': 'tit-carrinho' },
    h('div', { class: 'offcanvas-header border-bottom' }, h('h5', { class: 'offcanvas-title', id: 'tit-carrinho', text: 'O seu carrinho' }),
      h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'offcanvas', 'aria-label': 'Fechar' })),
    corpoCarrinho);

  var corpoPedido = h('div', { class: 'modal-body' });
  var modalPedido = h('div', { class: 'modal fade', tabindex: '-1', 'aria-labelledby': 'tit-pedido', 'aria-hidden': 'true' },
    h('div', { class: 'modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg' }, h('div', { class: 'modal-content' },
      h('div', { class: 'modal-header' }, h('h5', { class: 'modal-title', id: 'tit-pedido', text: 'Finalizar pedido' }),
        h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal', 'aria-label': 'Fechar' })),
      corpoPedido)));

  var corpoGeral = h('div', { class: 'modal-body' });
  var tituloGeral = h('h5', { class: 'modal-title', id: 'tit-geral' });
  var modalGeral = h('div', { class: 'modal fade', tabindex: '-1', 'aria-labelledby': 'tit-geral', 'aria-hidden': 'true' },
    h('div', { class: 'modal-dialog modal-dialog-centered modal-lg' }, h('div', { class: 'modal-content' },
      h('div', { class: 'modal-header' }, tituloGeral, h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal', 'aria-label': 'Fechar' })),
      corpoGeral)));

  raiz.append(topo, principal, rodape, oc, modalPedido, modalGeral, camadaAdmin, zonaAvisos);

  // ================= Página pública =================
  function renderTudo() { renderTopo(); renderPrincipal(); renderRodape(); renderCarrinho(); }

  function totalItens() { return carrinho.reduce(function (s, i) { return s + i.qtd; }, 0); }

  function renderTopo() {
    var n = totalItens();
    topo.replaceChildren(h('div', { class: 'container' },
      h('a', { class: 'marca', href: '#inicio' }, logo(), estado.loja.nome),
      h('nav', { 'aria-label': 'Secções' }, h('a', { href: '#loja', text: 'Serviços' }), h('a', { href: '#trabalhos', text: 'Trabalhos' }), h('a', { href: '#contacto', text: 'Contacto' })),
      h('div', { class: 'acoes-topo' },
        h('button', { class: 'btn btn-primary btn-carrinho', type: 'button', 'aria-label': 'Abrir carrinho, ' + n + ' itens', onclick: function () { mostrar(oc, 'Offcanvas'); } },
          icone('carrinho'), h('span', { class: 'd-none d-sm-inline ms-1', text: 'Carrinho' }), n ? h('span', { class: 'badge rounded-pill', text: n }) : null))));
  }

  function renderPrincipal() {
    principal.replaceChildren(secHeroi(), secLoja(), secTrabalhos(), secContacto());
  }

  function linhaCanal(c) {
    return h('div', { class: 'canal-linha' }, h('span', { class: 'ponto' + (c.ativo ? ' on' : '') }), icone(c.id),
      h('div', { style: 'min-width:0' }, h('div', { class: 'nome', text: c.nome }), h('div', { class: 'hor', text: c.horario })),
      h('span', { class: 'estado-canal' + (c.ativo ? ' on' : ''), text: c.ativo ? 'Disponível' : 'Indisponível' }));
  }

  function secHeroi() {
    return h('section', { class: 'container heroi', id: 'inicio' }, h('div', { class: 'row g-4 align-items-end' },
      h('div', { class: 'col-lg-7' },
        h('span', { class: 'rotulo', text: 'Programador · ' + estado.loja.local }),
        h('h1', { text: estado.loja.slogan }),
        h('p', { class: 'sobre', text: estado.loja.sobre }),
        h('div', { class: 'd-flex flex-wrap gap-2 mt-4' },
          h('a', { class: 'btn btn-primary btn-lg', href: '#loja', text: 'Ver serviços e preços' }),
          h('a', { class: 'btn btn-outline-secondary btn-lg', href: '#trabalhos', text: 'Ver trabalhos' })),
        h('p', { class: 'mono small text-body-secondary mt-3 mb-0', text: estado.loja.stack })),
      h('div', { class: 'col-lg-5' }, h('div', { class: 'disponibilidade' },
        h('div', { class: 'd-flex justify-content-between align-items-center mb-1' }, h('span', { class: 'rotulo', text: 'Onde me pode contactar' })),
        estado.canais.map(linhaCanal)))));
  }

  function secLoja() {
    var ativos = estado.produtos.filter(function (p) { return p.ativo; });
    var cats = ['Todos'].concat(ativos.map(function (p) { return p.categoria; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }));
    var q = busca.trim().toLowerCase();
    var lista = ativos.filter(function (p) {
      return (filtroCat === 'Todos' || p.categoria === filtroCat) && (!q || (p.nome + ' ' + p.descricao + ' ' + p.categoria).toLowerCase().indexOf(q) >= 0);
    });
    var campoBusca = h('input', { class: 'form-control', type: 'search', id: 'busca', placeholder: 'Procurar serviço', 'aria-label': 'Procurar serviço' });
    campoBusca.value = busca;
    campoBusca.addEventListener('input', function () { busca = campoBusca.value; var pos = campoBusca.selectionStart; renderPrincipalLoja(); var c = document.getElementById('busca'); if (c) { c.focus(); try { c.setSelectionRange(pos, pos); } catch (e) {} } });
    return h('section', { class: 'seccao', id: 'loja' }, h('div', { class: 'container' },
      h('div', { class: 'd-flex flex-wrap align-items-end justify-content-between gap-3 mb-4' },
        h('div', null, h('span', { class: 'rotulo', text: 'Loja · preços em kwanzas' }), h('h2', { text: 'Serviços' })),
        h('div', { style: 'min-width:min(280px,100%)' }, campoBusca)),
      h('ul', { class: 'nav nav-pills gap-2 mb-4', role: 'group', 'aria-label': 'Categorias' }, cats.map(function (c) {
        return h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link' + (filtroCat === c ? ' active' : ''), 'aria-pressed': String(filtroCat === c), onclick: function () { filtroCat = c; renderPrincipalLoja(); } }, c));
      })),
      lista.length ? h('div', { class: 'row g-4' }, lista.map(function (p) { return h('div', { class: 'col-sm-6 col-lg-4' }, cartaoProduto(p)); }))
        : h('div', { class: 'vazio', text: 'Nenhum serviço encontrado. Experimente outra categoria ou pesquisa.' })));
  }
  function renderPrincipalLoja() { var velho = document.getElementById('loja'); if (velho) velho.replaceWith(secLoja()); }

  function capaProduto(p) {
    var c = IMG_OK.test(p.img || '') ? h('div', { class: 'capa' }, h('img', { src: p.img, alt: p.nome, loading: 'lazy' })) : h('div', { class: 'capa capa-grelha', 'aria-hidden': 'true' }, h('span', { text: iniciais(p.nome) }));
    if (p.destaque) c.append(h('span', { class: 'selo-destaque', text: 'Mais procurado' }));
    return c;
  }

  function cartaoProduto(p) {
    var noCarrinho = carrinho.filter(function (i) { return i.id === p.id; })[0];
    return h('article', { class: 'card produto' + (p.destaque ? ' destaque' : '') }, capaProduto(p),
      h('div', { class: 'card-body d-flex flex-column gap-3' },
        h('div', { class: 'd-flex align-items-center gap-2 flex-wrap' }, h('span', { class: 'etiqueta', text: p.categoria })),
        h('div', null, h('h3', { class: 'h5 mb-1', text: p.nome }), h('p', { class: 'text-body-secondary mb-0', text: p.descricao })),
        h('ul', { class: 'lista-itens' }, (p.itens || []).map(function (i) { return h('li', { text: i }); })),
        h('div', { class: 'mt-auto d-flex align-items-end justify-content-between gap-2 flex-wrap' },
          h('div', null, h('div', { class: 'preco', text: kz(p.preco) }), h('div', { class: 'small text-body-secondary', text: p.unidade })),
          h('button', { class: 'btn ' + (noCarrinho ? 'btn-outline-primary' : 'btn-primary'), type: 'button', onclick: function () { adicionar(p.id); } },
            noCarrinho ? 'Adicionar mais (' + noCarrinho.qtd + ')' : 'Adicionar ao carrinho'))));
  }

  function secTrabalhos() {
    var conta = function (t) { return estado.trabalhos.filter(function (x) { return t === 'todos' || x.tipo === t; }).length; };
    var lista = estado.trabalhos.filter(function (t) { return filtroTrab === 'todos' || t.tipo === filtroTrab; });
    return h('section', { class: 'seccao', id: 'trabalhos' }, h('div', { class: 'container' },
      h('div', { class: 'd-flex flex-wrap align-items-end justify-content-between gap-3 mb-4' },
        h('div', null, h('span', { class: 'rotulo', text: 'Portfólio' }), h('h2', { text: 'Trabalhos realizados' })),
        h('ul', { class: 'nav nav-pills gap-2', role: 'group', 'aria-label': 'Filtrar trabalhos' },
          [['todos', 'Todos'], ['imagem', 'Imagens'], ['video', 'Vídeos'], ['projeto', 'Projetos']].filter(function (f) { return f[0] === 'todos' || conta(f[0]); }).map(function (f) {
            return h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link' + (filtroTrab === f[0] ? ' active' : ''), 'aria-pressed': String(filtroTrab === f[0]), onclick: function () { filtroTrab = f[0]; var s = document.getElementById('trabalhos'); s.replaceWith(secTrabalhos()); } }, f[1] + ' ', h('span', { class: 'mono small opacity-75', text: conta(f[0]) })));
          }))),
      lista.length ? h('div', { class: 'row g-4' }, lista.map(function (t) { return h('div', { class: 'col-sm-6 col-lg-4' }, cartaoTrabalho(t)); }))
        : h('div', { class: 'vazio', text: 'Ainda não há trabalhos nesta categoria.' })));
  }

  function cartaoTrabalho(t) {
    var capa, link = urlSegura(t.link), img = IMG_OK.test(t.img || ''), vid = VID_OK.test(t.video || '');
    if (vid) capa = h('div', { class: 'capa' }, h('video', { src: t.video, controls: true, preload: 'metadata', playsinline: true, poster: img ? t.img : null }));
    else if (img && t.tipo === 'video' && link) capa = h('a', { class: 'capa', href: link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Ver vídeo: ' + t.titulo }, h('img', { src: t.img, alt: '' }), h('span', { class: 'selo-destaque', text: '▶ Ver vídeo' }));
    else if (img) capa = h('button', { class: 'capa', type: 'button', 'aria-label': 'Ampliar ' + t.titulo, onclick: function () { abrirGeral(t.titulo, h('img', { src: t.img, alt: t.titulo, class: 'w-100 rounded' })); } }, h('img', { src: t.img, alt: t.titulo, loading: 'lazy' }));
    else capa = h('div', { class: 'capa capa-grelha', 'aria-hidden': 'true' }, h('span', { text: iniciais(t.titulo) }));
    return h('article', { class: 'card h-100 overflow-hidden' }, capa, h('div', { class: 'card-body d-flex flex-column gap-2' },
      h('div', { class: 'd-flex gap-2 align-items-center flex-wrap' }, h('span', { class: 'etiqueta', text: TIPOS[t.tipo] || 'Projeto' }), t.categoria ? h('span', { class: 'rotulo', text: t.categoria }) : null),
      h('h3', { class: 'h5 mb-0', text: t.titulo }), t.descricao ? h('p', { class: 'text-body-secondary mb-0', text: t.descricao }) : null,
      link ? h('a', { class: 'mt-auto fw-semibold text-decoration-none', href: link, target: '_blank', rel: 'noopener noreferrer', text: t.tipo === 'video' ? 'Ver vídeo ↗' : 'Abrir ligação ↗' }) : null));
  }

  function cartaoContacto(rotulo, valor, ic, ativo, horario) {
    var v = h('div', { class: 'valor', text: valor });
    var b = h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button' }, icone('copiar', 16), ' Copiar');
    b.addEventListener('click', function () { copiar(valor, b, v); });
    return h('div', { class: 'col-sm-6 col-lg-3' }, h('div', { class: 'card h-100 contacto-card' }, h('div', { class: 'card-body d-flex flex-column gap-2' },
      h('div', { class: 'd-flex align-items-center gap-2' }, icone(ic), h('span', { class: 'rotulo', text: rotulo }),
        ativo == null ? null : h('span', { class: 'badge ms-auto ' + (ativo ? 'text-bg-success' : 'text-bg-secondary'), text: ativo ? 'Disponível' : 'Indisponível' })),
      v, horario ? h('div', { class: 'small text-body-secondary', text: horario }) : null, h('div', { class: 'mt-auto' }, b))));
  }

  function secContacto() {
    var cards = estado.canais.map(function (c) { return cartaoContacto(c.nome, c.id === 'email' ? c.valor : formatarTel(c.valor), c.id, c.ativo, c.horario); });
    return h('section', { class: 'seccao', id: 'contacto' }, h('div', { class: 'container' },
      h('span', { class: 'rotulo', text: 'Fale comigo' }), h('h2', { class: 'mb-4', text: 'Contactos' }),
      h('div', { class: 'row g-3' }, cards),
      estado.loja.telAlt ? h('p', { class: 'mt-3 text-body-secondary' }, 'Telefone alternativo: ', h('span', { class: 'mono', text: estado.loja.telAlt })) : null,
      h('div', { class: 'privacidade mt-4' }, h('strong', { text: 'Os seus dados ficam consigo. ' }),
        'Este site não guarda o seu nome nem o seu telefone. Ao fazer um pedido, a mensagem é preparada no seu aparelho e só é enviada quando a enviar pelo canal que escolher.')));
  }
  function formatarTel(v) { var d = digitos(v); return d.length === 9 ? d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : v; }

  function renderRodape() {
    rodape.replaceChildren(h('div', { class: 'container d-flex flex-wrap justify-content-between gap-2' },
      h('span', { text: '© ' + new Date().getFullYear() + ' ' + estado.loja.nome + ' · ' + estado.loja.dono }),
      h('span', { text: estado.loja.local })));
  }

  function abrirGeral(titulo, conteudo) { tituloGeral.textContent = titulo; corpoGeral.replaceChildren(conteudo); mostrar(modalGeral, 'Modal'); }

  // ================= Carrinho =================
  function guardarCarrinho() {
    carrinho = carrinho.filter(function (i) { return produto(i.id) && produto(i.id).ativo && i.qtd > 0; });
    gravarLocal('ll_carrinho', carrinho); renderTopo(); renderCarrinho(); renderPrincipalLoja();
  }
  function adicionar(id) {
    var i = carrinho.filter(function (x) { return x.id === id; })[0];
    if (i) i.qtd = Math.min(99, i.qtd + 1); else carrinho.push({ id: id, qtd: 1 });
    guardarCarrinho(); aviso(produto(id).nome + ' adicionado ao carrinho');
  }
  function resumoCarrinho() {
    var linhas = carrinho.map(function (i) { var p = produto(i.id); return { id: p.id, nome: p.nome, preco: p.preco, qtd: i.qtd, unidade: p.unidade }; });
    var total = linhas.reduce(function (s, l) { return s + (l.preco == null ? 0 : l.preco * l.qtd); }, 0);
    return { linhas: linhas, total: total, consulta: linhas.some(function (l) { return l.preco == null; }) };
  }
  function renderCarrinho() {
    carrinho = carrinho.filter(function (i) { return produto(i.id) && produto(i.id).ativo; });
    if (!carrinho.length) {
      corpoCarrinho.replaceChildren(h('div', { class: 'vazio my-auto' }, h('p', { class: 'mb-3', text: 'O carrinho está vazio.' }),
        h('a', { class: 'btn btn-primary', href: '#loja', 'data-bs-dismiss': 'offcanvas', text: 'Ver serviços' })));
      return;
    }
    var r = resumoCarrinho();
    corpoCarrinho.replaceChildren(
      h('div', { class: 'flex-grow-1' }, r.linhas.map(function (l) {
        var mudar = function (d) { var i = carrinho.filter(function (x) { return x.id === l.id; })[0]; i.qtd = Math.max(0, Math.min(99, i.qtd + d)); guardarCarrinho(); };
        return h('div', { class: 'item-carrinho' },
          h('div', { style: 'min-width:0' }, h('div', { class: 'fw-semibold', text: l.nome }), h('div', { class: 'small text-body-secondary', text: kz(l.preco) + (l.preco != null ? ' · ' + l.unidade : '') })),
          h('div', { class: 'fw-semibold text-end mono', text: l.preco == null ? '—' : kz(l.preco * l.qtd) }),
          h('div', { class: 'qtd' }, h('button', { type: 'button', 'aria-label': 'Menos um', onclick: function () { mudar(-1); } }, '−'), h('span', { text: l.qtd }), h('button', { type: 'button', 'aria-label': 'Mais um', onclick: function () { mudar(1); } }, '+')),
          h('button', { class: 'btn btn-sm btn-link text-body-secondary text-end', type: 'button', onclick: function () { mudar(-99); } }, 'Remover'));
      })),
      h('div', { class: 'pt-3 d-grid gap-2' },
        h('div', { class: 'total-linha' }, h('span', { text: 'Total' }), h('span', { class: 'preco', text: kz(r.total) })),
        r.consulta ? h('div', { class: 'small text-body-secondary', text: 'Inclui serviços com preço sob consulta, a combinar.' }) : null,
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: function () { esconder(oc, 'Offcanvas'); abrirPedido(); } }, 'Finalizar pedido')));
  }

  // ================= Pedido e mensagens =================
  var pedido = { nome: '', tel: '', notas: '', canal: '' };

  function abrirPedido() {
    var disponiveis = estado.canais.filter(function (c) { return c.ativo; });
    if (!pedido.canal || !canal(pedido.canal) || !canal(pedido.canal).ativo) pedido.canal = disponiveis[0] ? disponiveis[0].id : '';
    var erro = h('div', { class: 'text-danger small', role: 'alert' });
    var nome = h('input', { class: 'form-control', id: 'pd-nome', autocomplete: 'name', maxlength: '80', required: true });
    var tel = h('input', { class: 'form-control', id: 'pd-tel', type: 'tel', autocomplete: 'tel', maxlength: '20', required: true, placeholder: '9XX XXX XXX' });
    var notas = h('textarea', { class: 'form-control', id: 'pd-notas', rows: '3', maxlength: '500', placeholder: 'Ex.: preciso do site até ao fim do mês.' });
    nome.value = pedido.nome; tel.value = pedido.tel; notas.value = pedido.notas;
    var opcoes = estado.canais.map(function (c) {
      var r = h('input', { type: 'radio', name: 'pd-canal', value: c.id, id: 'pd-c-' + c.id, disabled: !c.ativo });
      r.checked = pedido.canal === c.id;
      r.addEventListener('change', function () { pedido.canal = c.id; });
      return h('div', { class: 'col-sm-6' }, h('label', { class: 'opcao-canal' + (c.ativo ? '' : ' off'), for: 'pd-c-' + c.id }, r, icone(c.id, 20),
        h('span', { style: 'min-width:0' }, h('span', { class: 'd-block fw-semibold', text: c.nome }), h('span', { class: 'd-block small text-body-secondary', text: c.ativo ? c.horario : 'Indisponível de momento' }))));
    });
    var r = resumoCarrinho();
    var form = h('form', { class: 'd-grid gap-3', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      pedido.nome = nome.value.trim(); pedido.tel = tel.value.trim(); pedido.notas = notas.value.trim();
      if (pedido.nome.length < 2) { erro.textContent = 'Escreva o seu nome.'; nome.focus(); return; }
      if (digitos(pedido.tel).length < 9) { erro.textContent = 'Escreva um número de telefone válido, com 9 algarismos.'; tel.focus(); return; }
      if (!pedido.canal) { erro.textContent = 'Escolha por onde quer ser contactado.'; return; }
      mostrarMensagem();
    } },
      h('div', { class: 'p-3 rounded-3', style: 'background:var(--superficie-2)' },
        r.linhas.map(function (l) { return h('div', { class: 'd-flex justify-content-between gap-2 small' }, h('span', { text: l.qtd + ' × ' + l.nome }), h('span', { class: 'mono', text: l.preco == null ? 'sob consulta' : kz(l.preco * l.qtd) })); }),
        h('div', { class: 'total-linha border-top mt-2 pt-2' }, h('span', { text: 'Total' }), h('span', { text: kz(r.total) + (r.consulta ? ' + sob consulta' : '') }))),
      h('div', { class: 'row g-3' },
        h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: 'pd-nome', text: 'Nome' }), nome),
        h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: 'pd-tel', text: 'Telefone' }), tel)),
      h('div', null, h('label', { class: 'form-label', for: 'pd-notas', text: 'Observações (opcional)' }), notas),
      h('fieldset', null, h('legend', { class: 'form-label fs-6', text: 'Por onde quer enviar o pedido?' }), h('div', { class: 'row g-2' }, opcoes)),
      erro,
      h('div', { class: 'd-flex justify-content-end gap-2' },
        h('button', { class: 'btn btn-outline-secondary', type: 'button', 'data-bs-dismiss': 'modal', text: 'Voltar' }),
        h('button', { class: 'btn btn-primary', type: 'submit', text: 'Preparar mensagem' })));
    corpoPedido.replaceChildren(form);
    mostrar(modalPedido, 'Modal');
  }

  function montarMensagem(id, p) {
    var L = estado.loja, r = p.resumo, c = canal(id);
    var tag = '#LL:' + b64url(JSON.stringify({ c: p.codigo, n: p.nome, t: p.tel, k: id, o: p.notas, i: r.linhas.map(function (l) { return [l.id, l.qtd]; }) }));
    var itens = r.linhas.map(function (l) { return '- ' + l.qtd + ' x ' + l.nome + ': ' + (l.preco == null ? 'sob consulta' : kz(l.preco * l.qtd)); }).join('\n');
    var total = kz(r.total) + (r.consulta ? ' + itens sob consulta' : '');
    var primeiro = L.dono.split(' ')[0];
    if (id === 'whatsapp') return { texto:
      'Olá ' + primeiro + ', quero fazer um pedido na *' + L.nome + '*.\n\n*Pedido ' + p.codigo + '*\n' + itens + '\n*Total: ' + total + '*\n\n*Nome:* ' + p.nome + '\n*Telefone:* ' + p.tel + (p.notas ? '\n*Observações:* ' + p.notas : '') + '\n\nObrigado!\n\nRef: ' + tag,
      link: 'https://wa.me/' + intl(c.valor) + '?text=' };
    if (id === 'sms') return { texto:
      L.nome + ' - Pedido ' + p.codigo + ': ' + r.linhas.map(function (l) { return l.qtd + 'x ' + l.nome; }).join(', ') + '. Total ' + total + '. ' + p.nome + ', ' + p.tel + '.' + (p.notas ? ' Obs: ' + p.notas : '') + ' Ref: ' + tag,
      link: 'sms:' + digitos(c.valor) + '?&body=' };
    if (id === 'email') return { assunto: 'Pedido ' + p.codigo + ' - ' + L.nome, texto:
      'Bom dia, ' + L.dono + '.\n\nGostaria de fazer o seguinte pedido:\n\nPedido: ' + p.codigo + '\n' + itens + '\nTotal: ' + total + '\n\nNome: ' + p.nome + '\nTelefone: ' + p.tel + (p.notas ? '\nObservações: ' + p.notas : '') + '\n\nFico a aguardar o seu contacto.\n\nCumprimentos,\n' + p.nome + '\n\nRef: ' + tag,
      link: 'mailto:' + c.valor + '?subject=' };
    return { texto:
      'Ligue para ' + formatarTel(c.valor) + ' (' + c.horario + ') e diga:\n\n"Olá, ' + primeiro + '. Chamo-me ' + p.nome + ' e quero fazer o pedido ' + p.codigo + ': ' + r.linhas.map(function (l) { return l.qtd + ' ' + l.nome; }).join(', ') + '. O total é ' + total + '. O meu número é ' + p.tel + '."' + (p.notas ? '\n\nNão se esqueça de referir: ' + p.notas : '') + '\n\nRef: ' + tag,
      link: 'tel:' + digitos(c.valor) };
  }

  function mostrarMensagem() {
    var p = { codigo: codigoPedido(), nome: pedido.nome, tel: pedido.tel, notas: pedido.notas, resumo: resumoCarrinho() };
    var c = canal(pedido.canal), m = montarMensagem(pedido.canal, p);
    var caixa = h('div', { class: 'mensagem-pronta', text: (m.assunto ? 'Assunto: ' + m.assunto + '\n\n' : '') + m.texto });
    var bCopiar = h('button', { class: 'btn btn-outline-secondary', type: 'button' }, icone('copiar', 16), ' Copiar mensagem');
    bCopiar.addEventListener('click', function () { copiar(m.texto, bCopiar, caixa); });
    var href = pedido.canal === 'email' ? m.link + encodeURIComponent(m.assunto) + '&body=' + encodeURIComponent(m.texto)
      : pedido.canal === 'chamada' ? m.link : m.link + encodeURIComponent(m.texto);
    var rotuloAbrir = { whatsapp: 'Abrir no WhatsApp', sms: 'Abrir app de SMS', email: 'Abrir app de email', chamada: 'Ligar agora' }[pedido.canal];
    var passos = {
      whatsapp: 'Carregue em "Abrir no WhatsApp". A mensagem já vai escrita; só precisa de a enviar.',
      sms: 'Copie a mensagem e envie-a por SMS para ' + formatarTel(c.valor) + '. O botão abaixo pode abrir a app de SMS, se o seu aparelho permitir.',
      email: 'Copie a mensagem e envie-a para ' + c.valor + '. O botão abaixo pode abrir a sua app de email, se o seu aparelho permitir.',
      chamada: 'Ligue para ' + formatarTel(c.valor) + ' e use o texto abaixo como guia.'
    }[pedido.canal];
    corpoPedido.replaceChildren(h('div', { class: 'd-grid gap-3' },
      h('div', { class: 'd-flex align-items-center gap-2' }, icone(pedido.canal, 22), h('div', null, h('div', { class: 'rotulo', text: 'Pedido ' + p.codigo }), h('div', { class: 'fw-semibold', text: 'Mensagem pronta para ' + c.nome }))),
      h('p', { class: 'mb-0', text: passos }),
      pedido.canal !== 'chamada' && pedido.canal !== 'whatsapp' ? h('div', { class: 'p-3 rounded-3 mono', style: 'background:var(--ambar-fundo)' }, h('span', { class: 'rotulo d-block mb-1', text: 'Enviar para' }), h('span', { style: 'user-select:all', text: c.id === 'email' ? c.valor : formatarTel(c.valor) })) : null,
      caixa,
      h('div', { class: 'd-flex flex-wrap justify-content-end gap-2' },
        h('button', { class: 'btn btn-link text-body-secondary me-auto', type: 'button', onclick: abrirPedido, text: '← Mudar dados ou canal' }),
        bCopiar,
        h('a', { class: 'btn btn-primary', href: href, target: pedido.canal === 'whatsapp' ? '_blank' : null, rel: 'noopener noreferrer' }, icone(pedido.canal, 16), ' ' + rotuloAbrir)),
      h('div', { class: 'border-top pt-3 d-flex flex-wrap align-items-center gap-2' },
        h('span', { class: 'small text-body-secondary me-auto', text: 'Depois de enviar, pode esvaziar o carrinho.' }),
        h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', onclick: function () { carrinho = []; pedido.notas = ''; guardarCarrinho(); esconder(modalPedido, 'Modal'); aviso('Obrigado! Responderei o mais breve possível.'); } }, 'Já enviei, esvaziar carrinho'))));
  }

  // ================= Administração =================
  function _iniciarAdminClaude() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    Promise.all([claude.use('artifact'), claude.use('user'), claude.use('db')]).then(function (r) {
      if (!r[0] || !r[1]) return null;
      return r[1].canEdit().then(function (pode) {
        if (!pode) return null;
        cap.artefacto = r[0]; cap.user = r[1]; cap.db = r[2];
        return r[1].id().then(function (id) { cap.uid = id; mostrarBotaoAdmin(); });
      });
    }).catch(function () {});
  }

  function mostrarBotaoAdmin() {
    camadaAdmin.replaceChildren(h('button', { class: 'btn btn-dark btn-admin', type: 'button', onclick: abrirLogin }, icone('cadeado', 16), ' Administração', alterado ? h('span', { class: 'badge text-bg-warning ms-2', text: 'por publicar' }) : null));
  }

  function refConfig() { return cap.db.collection('data/users/' + cap.uid).doc('config'); }
  function refVendas() { return cap.db.collection('data/users/' + cap.uid); }

  function bytesB64(b) { var s = ''; b.forEach(function (x) { s += String.fromCharCode(x); }); return btoa(s); }
  function b64Bytes(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function derivar(senha, salB64) {
    var sal = salB64 ? b64Bytes(salB64) : crypto.getRandomValues(new Uint8Array(16));
    return crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: sal, iterations: 150000, hash: 'SHA-256' }, k, 256);
    }).then(function (bits) { return { hash: bytesB64(new Uint8Array(bits)), sal: bytesB64(sal) }; });
  }
  function sessaoValida() { var a = Number(sessao('ll_admin_ate') || 0); return a > Date.now(); }

  function abrirLogin() {
    if (sessaoValida()) { abrirPainel(); return; }
    if (!cap.db) { abrirGeral('Administração', h('p', { text: 'O armazenamento deste navegador está bloqueado. Saia do modo privado e tente outra vez.' })); return; }
    var caixa = h('div', { class: 'd-grid gap-3 login-caixa mx-auto' }, h('p', { class: 'text-body-secondary mb-0', text: 'A verificar…' }));
    abrirGeral('Entrar na administração', caixa);
    refConfig().get().then(function (snap) {
      var cfg = snap.exists ? snap.data() : null;
      var s1 = h('input', { class: 'form-control', type: 'password', id: 'lg-senha', autocomplete: cfg ? 'current-password' : 'new-password', minlength: '8', required: true });
      var s2 = cfg ? null : h('input', { class: 'form-control', type: 'password', id: 'lg-senha2', autocomplete: 'new-password', minlength: '8', required: true });
      var erro = h('div', { class: 'text-danger small', role: 'alert' });
      var btn = h('button', { class: 'btn btn-primary', type: 'submit', text: cfg ? 'Entrar' : 'Criar palavra-passe e entrar' });
      var form = h('form', { class: 'd-grid gap-3', onsubmit: function (e) {
        e.preventDefault(); erro.textContent = '';
        if (Date.now() < bloqueadoAte) { erro.textContent = 'Demasiadas tentativas. Espere um minuto.'; return; }
        if (s1.value.length < 8) { erro.textContent = 'A palavra-passe tem de ter pelo menos 8 caracteres.'; return; }
        if (s2 && s1.value !== s2.value) { erro.textContent = 'As palavras-passe não coincidem.'; return; }
        btn.disabled = true;
        derivar(s1.value, cfg ? cfg.sal : null).then(function (d) {
          if (!cfg) return refConfig().set({ tipo: 'config', hash: d.hash, sal: d.sal, criado: Date.now() }).then(function () { return true; });
          return d.hash === cfg.hash;
        }).then(function (ok) {
          if (ok) { tentativas = 0; sessao('ll_admin_ate', String(Date.now() + SESSAO_MS)); esconder(modalGeral, 'Modal'); abrirPainel(); }
          else { tentativas++; if (tentativas >= 5) { bloqueadoAte = Date.now() + 60000; tentativas = 0; } erro.textContent = 'Palavra-passe errada.'; btn.disabled = false; s1.value = ''; s1.focus(); }
        }).catch(function () { erro.textContent = 'Não foi possível verificar agora. Tente outra vez.'; btn.disabled = false; });
      } },
        h('p', { class: 'text-body-secondary mb-0', text: cfg ? 'Escreva a sua palavra-passe de administrador.' : 'Primeira vez: crie uma palavra-passe de administrador (mínimo 8 caracteres). Fica guardada encriptada apenas neste navegador.' }),
        h('div', null, h('label', { class: 'form-label', for: 'lg-senha', text: 'Palavra-passe' }), s1),
        s2 ? h('div', null, h('label', { class: 'form-label', for: 'lg-senha2', text: 'Repita a palavra-passe' }), s2) : null,
        erro, btn);
      caixa.replaceChildren(form); setTimeout(function () { s1.focus(); }, 300);
    }).catch(function () { caixa.replaceChildren(h('p', { class: 'text-danger', text: 'Não foi possível ligar ao armazenamento. Recarregue a página e tente outra vez.' })); });
  }

  // ---- Painel ----
  var separador = 'vendas', filtroVendas = 'todos';
  var corpoPainel = h('div', { class: 'container py-4' });
  var pePainel = h('div', { class: 'modal-footer justify-content-between gap-2' });
  var navPainel = h('ul', { class: 'nav nav-pills gap-1 flex-wrap' });
  var modalPainel = h('div', { class: 'modal fade painel-admin', tabindex: '-1', 'aria-labelledby': 'tit-painel', 'aria-hidden': 'true' },
    h('div', { class: 'modal-dialog modal-fullscreen' }, h('div', { class: 'modal-content' },
      h('div', { class: 'modal-header flex-wrap gap-2' }, h('h5', { class: 'modal-title me-3 d-flex align-items-center gap-2', id: 'tit-painel' }, logo(), 'Administração'), navPainel,
        h('button', { type: 'button', class: 'btn-close ms-auto', 'data-bs-dismiss': 'modal', 'aria-label': 'Fechar' })),
      h('div', { class: 'modal-body p-0' }, corpoPainel), pePainel)));
  modalPainel.querySelector('.modal-header svg').parentNode.style.cssText = 'width:28px;height:28px;display:inline-flex';
  raiz.append(modalPainel);
  modalPainel.addEventListener('hidden.bs.modal', mostrarBotaoAdmin);

  function abrirPainel() {
    if (!pararVendas && cap.db) {
      pararVendas = refVendas().where('tipo', '==', 'venda').onSnapshot(function (snap) {
        vendas = snap.docs.map(function (d) { var x = d.data(); x._id = d.id; return x; }).sort(function (a, b) { return b.data - a.data; });
        if (separador === 'vendas') renderPainel();
      }, function () { pararVendas = null; });
    }
    renderPainel(); mostrar(modalPainel, 'Modal');
  }

  function renderPainel() {
    if (!sessaoValida()) { esconder(modalPainel, 'Modal'); return; }
    navPainel.replaceChildren.apply(navPainel, [['vendas', 'Vendas'], ['produtos', 'Serviços'], ['trabalhos', 'Trabalhos'], ['contactos', 'Contactos e loja'], ['seguranca', 'Segurança']].map(function (s) {
      return h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link' + (separador === s[0] ? ' active' : ''), onclick: function () { separador = s[0]; renderPainel(); } }, s[1]));
    }));
    corpoPainel.replaceChildren();
    ({ vendas: painelVendas, produtos: painelProdutos, trabalhos: painelTrabalhos, contactos: painelContactos, seguranca: painelSeguranca })[separador](corpoPainel);
    renderPePainel();
  }

  function marcar() { alterado = true; renderTudo(); renderPePainel(); }

  function renderPePainel() {
    var tam = gerarHTML().length, perc = Math.min(100, tam / LIMITE * 100);
    var msg = h('span', { class: 'small ' + (alterado ? 'text-warning-emphasis' : 'text-body-secondary'), id: 'msg-pub', role: 'status', text: alterado ? 'Exporte o dados.json e envie-o para o GitHub para os visitantes verem as alterações.' : 'Sem alterações por exportar. As vendas ficam guardadas neste navegador; faça cópias em Segurança.' });
    var pub = h('button', { class: 'btn btn-primary', type: 'button', disabled: !alterado, onclick: function () { publicar(pub, 0); } }, 'Exportar dados.json');
    var desc = h('button', { class: 'btn btn-outline-secondary', type: 'button', disabled: !alterado, onclick: function () {
      if (desc.dataset.c) { estado = JSON.parse(ORIGINAL); alterado = false; renderTudo(); renderPainel(); } else { desc.dataset.c = '1'; desc.textContent = 'Confirmar descartar'; }
    } }, 'Descartar');
    pePainel.replaceChildren(
      h('div', { style: 'min-width:200px;flex:1 1 260px' }, msg, h('div', { class: 'd-flex align-items-center gap-2 mt-1' }, h('div', { class: 'barra flex-grow-1' + (perc > 90 ? ' cheia' : '') }, h('i', { style: 'width:' + perc.toFixed(1) + '%' })), h('span', { class: 'small mono text-body-secondary', text: (tam / 1048576).toFixed(1) + ' MB' }))),
      h('div', { class: 'd-flex gap-2' }, desc, pub));
  }

  function msgPub(t, cls) { var m = document.getElementById('msg-pub'); if (m) { m.textContent = t; m.className = 'small ' + (cls || ''); } }

  // ---- Vendas ----
  function painelVendas(c) {
    var validas = vendas.filter(function (v) { return v.estado !== 'cancelado'; });
    var faturado = vendas.filter(function (v) { return v.estado === 'pago' || v.estado === 'entregue'; }).reduce(function (s, v) { return s + (v.total || 0); }, 0);
    var porFechar = vendas.filter(function (v) { return v.estado === 'novo' || v.estado === 'confirmado'; });
    var nPagos = vendas.filter(function (v) { return v.estado === 'pago' || v.estado === 'entregue'; }).length;
    var porProd = {};
    validas.forEach(function (v) { (v.itens || []).forEach(function (i) { porProd[i.nome] = (porProd[i.nome] || 0) + i.qtd; }); });
    var top = Object.keys(porProd).map(function (k) { return [k, porProd[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4);
    var maxTop = top.length ? top[0][1] : 1;
    var porCanal = {}; validas.forEach(function (v) { porCanal[v.canal] = (porCanal[v.canal] || 0) + 1; });

    var kpi = function (r, v, s) { return h('div', { class: 'col-6 col-lg-3' }, h('div', { class: 'kpi' }, h('div', { class: 'rotulo', text: r }), h('div', { class: 'v', text: v }), s ? h('div', { class: 'small text-body-secondary mt-1', text: s }) : null)); };

    // Importar pedido
    var area = h('textarea', { class: 'form-control mono', id: 'imp-texto', rows: '3', placeholder: 'Cole aqui a mensagem que o cliente lhe enviou (com a linha Ref: #LL:…)' });
    var impMsg = h('div', { class: 'small', role: 'status' });
    var importar = h('button', { class: 'btn btn-primary', type: 'button', onclick: function () {
      var m = /#LL:([A-Za-z0-9_-]+)/.exec(area.value);
      impMsg.className = 'small text-danger';
      if (!m) { impMsg.textContent = 'Não encontrei a referência #LL: na mensagem. Use "Registar venda manual".'; return; }
      var d; try { d = JSON.parse(deB64url(m[1])); } catch (e) { impMsg.textContent = 'A referência está incompleta. Copie a mensagem inteira.'; return; }
      if (!d || typeof d.c !== 'string' || !Array.isArray(d.i)) { impMsg.textContent = 'A referência não é válida.'; return; }
      if (vendas.some(function (v) { return v.codigo === d.c; })) { impMsg.textContent = 'O pedido ' + d.c + ' já está no histórico.'; return; }
      var itens = d.i.slice(0, 50).map(function (x) { var p = produto(String(x[0])); var q = Math.max(1, Math.min(99, parseInt(x[1], 10) || 1)); return { id: String(x[0]), nome: p ? p.nome : 'Serviço removido', preco: p ? p.preco : null, qtd: q }; });
      guardarVenda({ codigo: String(d.c).slice(0, 20), cliente: String(d.n || '').slice(0, 80), telefone: String(d.t || '').slice(0, 20), canal: String(d.k || '').slice(0, 12), nota: String(d.o || '').slice(0, 500), itens: itens }, impMsg, function () { area.value = ''; });
    } }, 'Importar pedido');

    var filtros = ['todos'].concat(Object.keys(ESTADOS)).map(function (e) {
      var n = e === 'todos' ? vendas.length : vendas.filter(function (v) { return v.estado === e; }).length;
      return h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link py-1' + (filtroVendas === e ? ' active' : ''), onclick: function () { filtroVendas = e; renderPainel(); } }, (e === 'todos' ? 'Todos' : ESTADOS[e][0]) + ' ', h('span', { class: 'mono small opacity-75', text: n })));
    });
    var lista = vendas.filter(function (v) { return filtroVendas === 'todos' || v.estado === filtroVendas; });
    var bCsv = h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', disabled: !vendas.length }, icone('copiar', 14), ' Copiar CSV');
    bCsv.addEventListener('click', function () {
      var linhas = [['Data', 'Pedido', 'Cliente', 'Telefone', 'Canal', 'Itens', 'Total (Kz)', 'Estado']].concat(vendas.map(function (v) {
        return [dataCurta(v.data), v.codigo, v.cliente, v.telefone, v.canal, (v.itens || []).map(function (i) { return i.qtd + 'x ' + i.nome; }).join('; '), v.total || 0, (ESTADOS[v.estado] || [''])[0]];
      }));
      copiar(linhas.map(function (l) { return l.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(';'); }).join('\n'), bCsv, null);
    });

    c.append(
      h('div', { class: 'row g-3 mb-4' },
        kpi('Faturado', kz(faturado), 'Pedidos pagos ou entregues'),
        kpi('Pedidos', String(validas.length), vendas.length - validas.length ? (vendas.length - validas.length) + ' cancelados' : 'Sem cancelamentos'),
        kpi('Por fechar', String(porFechar.length), kz(porFechar.reduce(function (s, v) { return s + (v.total || 0); }, 0)) + ' em aberto'),
        kpi('Valor médio', kz(nPagos ? faturado / nPagos : 0), 'Por pedido pago')),
      h('div', { class: 'row g-3 mb-4' },
        h('div', { class: 'col-lg-7' }, h('div', { class: 'card h-100' }, h('div', { class: 'card-body d-grid gap-2' },
          h('h6', { class: 'mb-0', text: 'Importar pedido de um cliente' }),
          h('p', { class: 'small text-body-secondary mb-0', text: 'Quando um cliente lhe enviar o pedido por WhatsApp, SMS ou email, cole a mensagem aqui. O sistema lê os serviços, o nome e o telefone e junta ao histórico.' }),
          area, impMsg, h('div', { class: 'd-flex gap-2 flex-wrap' }, importar, h('button', { class: 'btn btn-outline-secondary', type: 'button', onclick: vendaManual, text: 'Registar venda manual' }))))),
        h('div', { class: 'col-lg-5' }, h('div', { class: 'card h-100' }, h('div', { class: 'card-body' },
          h('h6', { text: 'Mais vendidos' }),
          top.length ? h('div', { class: 'd-grid gap-2' }, top.map(function (t) {
            return h('div', null, h('div', { class: 'd-flex justify-content-between small' }, h('span', { text: t[0] }), h('span', { class: 'mono', text: t[1] })), h('div', { class: 'barra mt-1' }, h('i', { style: 'width:' + (t[1] / maxTop * 100).toFixed(0) + '%' })));
          })) : h('p', { class: 'small text-body-secondary', text: 'Os serviços mais pedidos aparecem aqui.' }),
          Object.keys(porCanal).length ? h('p', { class: 'small text-body-secondary mt-3 mb-0', text: 'Pedidos por canal: ' + Object.keys(porCanal).map(function (k) { return (canal(k) ? canal(k).nome : k) + ' ' + porCanal[k]; }).join(' · ') }) : null)))),
      h('div', { class: 'card' }, h('div', { class: 'card-body' },
        h('div', { class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 mb-3' }, h('h6', { class: 'mb-0', text: 'Histórico de vendas' }), bCsv),
        h('ul', { class: 'nav nav-pills gap-1 mb-3 small' }, filtros),
        lista.length ? h('div', { class: 'tabela-wrap' }, h('table', { class: 'table table-hover align-middle mb-0' },
          h('thead', null, h('tr', null, ['Data', 'Pedido', 'Cliente', 'Itens', 'Canal', 'Total', 'Estado', ''].map(function (t, i) { return h('th', { class: i === 5 ? 'num' : '', text: t }); }))),
          h('tbody', null, lista.map(linhaVenda))))
          : h('div', { class: 'vazio', text: vendas.length ? 'Nenhuma venda com este estado.' : 'Ainda não há vendas. Importe o primeiro pedido acima ou registe uma venda manual.' }))));
  }

  function linhaVenda(v) {
    var sel = h('select', { class: 'form-select form-select-sm estado-venda', 'aria-label': 'Estado do pedido ' + v.codigo });
    Object.keys(ESTADOS).forEach(function (k) { var o = h('option', { value: k, text: ESTADOS[k][0] }); if (v.estado === k) o.selected = true; sel.append(o); });
    sel.addEventListener('change', function () { sel.disabled = true; refVendas().doc(v._id).update({ estado: sel.value, atualizado: Date.now() }).then(function () { aviso('Estado atualizado'); }).catch(function () { aviso('Não foi possível atualizar. Tente outra vez.'); sel.disabled = false; }); });
    var apagar = h('button', { class: 'btn btn-sm btn-outline-danger', type: 'button', 'aria-label': 'Apagar pedido ' + v.codigo, onclick: function () {
      if (apagar.dataset.c) refVendas().doc(v._id).delete().catch(function () { aviso('Não foi possível apagar.'); });
      else { apagar.dataset.c = '1'; apagar.textContent = 'Confirmar'; }
    } }, 'Apagar');
    return h('tr', null,
      h('td', { class: 'mono small', text: dataCurta(v.data) }),
      h('td', { class: 'mono', text: v.codigo }),
      h('td', null, h('div', { class: 'fw-semibold', text: v.cliente || '—' }), h('div', { class: 'small text-body-secondary mono', text: v.telefone || '' })),
      h('td', { class: 'small', style: 'white-space:normal;min-width:180px', text: (v.itens || []).map(function (i) { return i.qtd + '× ' + i.nome; }).join(', ') }),
      h('td', { class: 'small', text: canal(v.canal) ? canal(v.canal).nome : (v.canal || '—') }),
      h('td', { class: 'num mono', text: kz(v.total || 0) }),
      h('td', null, sel), h('td', null, apagar));
  }

  function guardarVenda(d, msgEl, depois) {
    var total = d.itens.reduce(function (s, i) { return s + (i.preco == null ? 0 : i.preco * i.qtd); }, 0);
    var doc = { tipo: 'venda', codigo: d.codigo, data: Date.now(), cliente: d.cliente, telefone: d.telefone, canal: d.canal, nota: d.nota || '', itens: d.itens, total: total, estado: 'novo' };
    return refVendas().doc('v_' + d.codigo.replace(/[^A-Za-z0-9-]/g, '')).set(doc).then(function () {
      if (msgEl) { msgEl.className = 'small text-success'; msgEl.textContent = 'Pedido ' + d.codigo + ' adicionado ao histórico.'; }
      if (depois) depois();
    }).catch(function () { if (msgEl) { msgEl.className = 'small text-danger'; msgEl.textContent = 'Não foi possível guardar. Verifique a ligação e tente outra vez.'; } });
  }

  function vendaManual() {
    var qtds = {};
    var cliente = h('input', { class: 'form-control', id: 'vm-cliente', maxlength: '80' });
    var tel = h('input', { class: 'form-control', id: 'vm-tel', type: 'tel', maxlength: '20' });
    var can = h('select', { class: 'form-select', id: 'vm-canal' }, estado.canais.map(function (c) { return h('option', { value: c.id, text: c.nome }); }), h('option', { value: 'presencial', text: 'Presencial' }));
    var precoLivre = h('input', { class: 'form-control', id: 'vm-valor', type: 'number', min: '0', step: '1000', placeholder: 'Opcional' });
    var erro = h('div', { class: 'small', role: 'status' });
    var linhas = estado.produtos.map(function (p) {
      var q = h('input', { class: 'form-control form-control-sm', type: 'number', min: '0', max: '99', value: '0', id: 'vm-q-' + p.id, style: 'width:80px' });
      q.addEventListener('input', function () { qtds[p.id] = Math.max(0, Math.min(99, parseInt(q.value, 10) || 0)); });
      return h('div', { class: 'd-flex align-items-center justify-content-between gap-2 py-1 border-bottom' }, h('label', { for: 'vm-q-' + p.id, class: 'small', text: p.nome + ' · ' + kz(p.preco) }), q);
    });
    var guardar = h('button', { class: 'btn btn-primary', type: 'button', onclick: function () {
      var itens = Object.keys(qtds).filter(function (k) { return qtds[k] > 0; }).map(function (k) { var p = produto(k); return { id: k, nome: p.nome, preco: p.preco, qtd: qtds[k] }; });
      var extra = parseInt(precoLivre.value, 10);
      if (extra > 0) itens.push({ id: 'extra', nome: 'Valor combinado', preco: extra, qtd: 1 });
      erro.className = 'small text-danger';
      if (!cliente.value.trim()) { erro.textContent = 'Escreva o nome do cliente.'; return; }
      if (!itens.length) { erro.textContent = 'Indique pelo menos um serviço ou um valor combinado.'; return; }
      guardar.disabled = true;
      guardarVenda({ codigo: codigoPedido(), cliente: cliente.value.trim(), telefone: tel.value.trim(), canal: can.value, itens: itens }, erro, function () { esconder(modalGeral, 'Modal'); aviso('Venda registada'); });
    } }, 'Guardar venda');
    abrirGeral('Registar venda manual', h('div', { class: 'd-grid gap-3' },
      h('div', { class: 'row g-3' },
        h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: 'vm-cliente', text: 'Cliente' }), cliente),
        h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: 'vm-tel', text: 'Telefone' }), tel),
        h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: 'vm-canal', text: 'Canal' }), can),
        h('div', { class: 'col-sm-6' }, h('label', { class: 'form-label', for: 'vm-valor', text: 'Valor combinado (Kz)' }), precoLivre)),
      h('div', null, h('div', { class: 'form-label', text: 'Serviços e quantidades' }), linhas),
      erro, h('div', { class: 'd-flex justify-content-end' }, guardar)));
  }

  // ---- Ficheiros ----
  function lerImagem(f) {
    return new Promise(function (res, rej) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) return rej(new Error('Use uma imagem JPG, PNG ou WebP.'));
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        var r = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.8)); // remove metadados (GPS, câmara)
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Não foi possível ler esta imagem.')); };
      img.src = url;
    });
  }
  function lerVideo(f) {
    return new Promise(function (res, rej) {
      if (!/^video\/(mp4|webm)$/.test(f.type)) return rej(new Error('Use um vídeo MP4 ou WebM.'));
      if (f.size > MAX_VIDEO) return rej(new Error('O vídeo tem ' + (f.size / 1048576).toFixed(1) + ' MB; o máximo é 4 MB. Para vídeos maiores, publique no YouTube e cole a ligação.'));
      var fr = new FileReader(); fr.onload = function () { res(String(fr.result)); }; fr.onerror = function () { rej(new Error('Não foi possível ler o vídeo.')); }; fr.readAsDataURL(f);
    });
  }
  function campo(id, rotulo, valor, mudar, o) {
    o = o || {};
    var el = o.area ? h('textarea', { class: 'form-control', id: id, rows: o.rows || '3', maxlength: o.max || '800' }) : h('input', { class: 'form-control', id: id, type: o.tipo || 'text', maxlength: o.max || '200', placeholder: o.ph || null, min: o.min || null, step: o.step || null });
    el.value = valor == null ? '' : valor;
    if (mudar) el.addEventListener('input', function () { mudar(el.value); });
    return h('div', { class: o.col || 'col-12' }, h('label', { class: 'form-label', for: id, text: rotulo }), el, o.ajuda ? h('div', { class: 'form-text', text: o.ajuda }) : null);
  }

  // ---- Serviços (produtos) ----
  function painelProdutos(c) {
    c.append(h('div', { class: 'd-flex justify-content-between align-items-center mb-3 flex-wrap gap-2' },
      h('div', null, h('h6', { class: 'mb-0', text: 'Serviços na loja (' + estado.produtos.length + ')' }), h('div', { class: 'small text-body-secondary', text: 'Deixe o preço vazio para mostrar "Sob consulta".' })),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: function () {
        estado.produtos.unshift({ id: novoId(), nome: 'Novo serviço', categoria: 'Geral', preco: null, unidade: 'pagamento único', descricao: '', itens: [], img: '', destaque: false, ativo: false });
        marcar(); renderPainel();
      } }, 'Adicionar serviço')),
      h('div', { class: 'row g-3' }, estado.produtos.map(function (p, i) { return h('div', { class: 'col-lg-6' }, editorProduto(p, i)); })));
  }

  function editorProduto(p, i) {
    var aviso2 = h('div', { class: 'small', role: 'status' });
    var foto = h('input', { class: 'form-control', type: 'file', id: 'pr-img-' + p.id, accept: 'image/jpeg,image/png,image/webp' });
    foto.addEventListener('change', function () {
      var f = foto.files[0]; if (!f) return; aviso2.className = 'small'; aviso2.textContent = 'A preparar a imagem…';
      lerImagem(f).then(function (d) { p.img = d; if (gerarHTML().length > LIMITE) { p.img = ''; throw new Error('Sem espaço para esta imagem.'); } marcar(); renderPainel(); })
        .catch(function (e) { foto.value = ''; aviso2.className = 'small text-danger'; aviso2.textContent = e.message; });
    });
    var chk = function (id, rot, k) { var x = h('input', { class: 'form-check-input', type: 'checkbox', id: id }); x.checked = !!p[k]; x.addEventListener('change', function () { p[k] = x.checked; marcar(); }); return h('div', { class: 'form-check form-switch' }, x, h('label', { class: 'form-check-label', for: id, text: rot })); };
    var mover = function (d) { var j = i + d, a = estado.produtos; if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; marcar(); renderPainel(); };
    var rem = h('button', { class: 'btn btn-sm btn-outline-danger', type: 'button', onclick: function () { if (rem.dataset.c) { estado.produtos.splice(i, 1); marcar(); renderPainel(); } else { rem.dataset.c = '1'; rem.textContent = 'Confirmar'; } } }, 'Remover');
    return h('div', { class: 'card h-100' }, h('div', { class: 'card-body d-grid gap-3' },
      h('div', { class: 'd-flex align-items-center gap-2' },
        IMG_OK.test(p.img || '') ? h('img', { class: 'mini', src: p.img, alt: '' }) : h('span', { class: 'mini', text: iniciais(p.nome) }),
        h('strong', { class: 'text-truncate', text: p.nome }),
        h('span', { class: 'badge ms-auto ' + (p.ativo ? 'text-bg-success' : 'text-bg-secondary'), text: p.ativo ? 'Visível' : 'Escondido' })),
      h('div', { class: 'row g-2' },
        campo('pr-nome-' + p.id, 'Nome', p.nome, function (v) { p.nome = v.trim() || 'Serviço'; marcar(); }, { col: 'col-sm-7', max: '60' }),
        campo('pr-cat-' + p.id, 'Categoria', p.categoria, function (v) { p.categoria = v.trim() || 'Geral'; marcar(); }, { col: 'col-sm-5', max: '40' }),
        campo('pr-preco-' + p.id, 'Preço (Kz)', p.preco, function (v) { var n = parseInt(String(v).replace(/\D/g, ''), 10); p.preco = isNaN(n) ? null : n; marcar(); }, { col: 'col-sm-5', tipo: 'number', min: '0', step: '1000', ph: 'Sob consulta' }),
        campo('pr-uni-' + p.id, 'Nota do preço', p.unidade, function (v) { p.unidade = v.trim(); marcar(); }, { col: 'col-sm-7', max: '40', ph: 'Ex.: por mês' }),
        campo('pr-desc-' + p.id, 'Descrição', p.descricao, function (v) { p.descricao = v.trim(); marcar(); }, { area: true, rows: '2', max: '300' }),
        campo('pr-itens-' + p.id, 'O que inclui (um por linha)', (p.itens || []).join('\n'), function (v) { p.itens = v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 10); marcar(); }, { area: true, rows: '3', max: '600' }),
        h('div', { class: 'col-12' }, h('label', { class: 'form-label', for: 'pr-img-' + p.id, text: 'Imagem (opcional)' }), foto, aviso2,
          p.img ? h('button', { class: 'btn btn-sm btn-link px-0', type: 'button', onclick: function () { p.img = ''; marcar(); renderPainel(); } }, 'Remover imagem') : null)),
      h('div', { class: 'd-flex flex-wrap gap-3' }, chk('pr-at-' + p.id, 'Visível na loja', 'ativo'), chk('pr-de-' + p.id, 'Destacar', 'destaque')),
      h('div', { class: 'd-flex gap-2' },
        h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', disabled: i === 0, 'aria-label': 'Mover para cima', onclick: function () { mover(-1); } }, '↑'),
        h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', disabled: i === estado.produtos.length - 1, 'aria-label': 'Mover para baixo', onclick: function () { mover(1); } }, '↓'),
        h('span', { class: 'ms-auto' }), rem)));
  }

  // ---- Trabalhos ----
  function painelTrabalhos(c) {
    var novo = { tipo: 'imagem', titulo: '', categoria: '', descricao: '', img: '', video: '', link: '' };
    var msg = h('div', { class: 'small', role: 'status' });
    var tipo = h('select', { class: 'form-select', id: 'tr-tipo' }, h('option', { value: 'imagem', text: 'Imagem' }), h('option', { value: 'video', text: 'Vídeo' }), h('option', { value: 'projeto', text: 'Projeto (sem multimédia)' }));
    var fImg = h('input', { class: 'form-control', type: 'file', id: 'tr-img', accept: 'image/jpeg,image/png,image/webp' });
    var fVid = h('input', { class: 'form-control', type: 'file', id: 'tr-vid', accept: 'video/mp4,video/webm' });
    var grupoVid = h('div', { class: 'col-12' }, h('label', { class: 'form-label', for: 'tr-vid', text: 'Vídeo curto (até 4 MB)' }), fVid, h('div', { class: 'form-text', text: 'Ou deixe vazio e cole a ligação do YouTube abaixo.' }));
    tipo.addEventListener('change', function () { novo.tipo = tipo.value; grupoVid.hidden = tipo.value !== 'video'; });
    grupoVid.hidden = true;
    fImg.addEventListener('change', function () { var f = fImg.files[0]; if (!f) return; msg.className = 'small'; msg.textContent = 'A preparar a imagem…'; lerImagem(f).then(function (d) { novo.img = d; msg.textContent = 'Imagem pronta.'; }).catch(function (e) { fImg.value = ''; msg.className = 'small text-danger'; msg.textContent = e.message; }); });
    fVid.addEventListener('change', function () { var f = fVid.files[0]; if (!f) return; msg.className = 'small'; msg.textContent = 'A preparar o vídeo…'; lerVideo(f).then(function (d) { novo.video = d; msg.textContent = 'Vídeo pronto.'; }).catch(function (e) { fVid.value = ''; msg.className = 'small text-danger'; msg.textContent = e.message; }); });
    var add = h('button', { class: 'btn btn-primary', type: 'button', onclick: function () {
      msg.className = 'small text-danger';
      if (!novo.titulo.trim()) { msg.textContent = 'Escreva um título.'; return; }
      if (novo.link && !urlSegura(novo.link)) { msg.textContent = 'A ligação tem de começar por https://'; return; }
      if (novo.tipo === 'imagem' && !novo.img) { msg.textContent = 'Escolha uma imagem.'; return; }
      if (novo.tipo === 'video' && !novo.video && !urlSegura(novo.link)) { msg.textContent = 'Escolha um vídeo ou cole uma ligação.'; return; }
      estado.trabalhos.unshift({ id: novoId(), tipo: novo.tipo, titulo: novo.titulo.trim(), categoria: novo.categoria.trim(), descricao: novo.descricao.trim(), img: novo.img, video: novo.tipo === 'video' ? novo.video : '', link: urlSegura(novo.link) });
      if (gerarHTML().length > LIMITE) { estado.trabalhos.shift(); msg.textContent = 'Não há espaço. Remova trabalhos ou use ligação em vez de ficheiro.'; return; }
      marcar(); renderPainel(); aviso('Trabalho adicionado');
    } }, 'Adicionar trabalho');
    c.append(h('div', { class: 'row g-4' },
      h('div', { class: 'col-lg-5' }, h('div', { class: 'card' }, h('div', { class: 'card-body' }, h('h6', { text: 'Novo trabalho' }), h('div', { class: 'row g-2' },
        h('div', { class: 'col-12' }, h('label', { class: 'form-label', for: 'tr-tipo', text: 'Tipo' }), tipo),
        campo('tr-tit', 'Título', '', function (v) { novo.titulo = v; }, { max: '90' }),
        campo('tr-cat', 'Categoria', '', function (v) { novo.categoria = v; }, { max: '60', ph: 'Ex.: Sistema web' }),
        campo('tr-desc', 'Descrição', '', function (v) { novo.descricao = v; }, { area: true, rows: '2', max: '300' }),
        h('div', { class: 'col-12' }, h('label', { class: 'form-label', for: 'tr-img', text: 'Imagem ou capa' }), fImg, h('div', { class: 'form-text', text: 'Reduzida automaticamente e sem metadados de localização.' })),
        grupoVid,
        campo('tr-link', 'Ligação (opcional)', '', function (v) { novo.link = v; }, { tipo: 'url', max: '500', ph: 'https://' }),
        h('div', { class: 'col-12' }, msg), h('div', { class: 'col-12' }, add))))),
      h('div', { class: 'col-lg-7' }, h('div', { class: 'card' }, h('div', { class: 'card-body' }, h('h6', { text: 'Trabalhos publicados (' + estado.trabalhos.length + ')' }),
        estado.trabalhos.length ? h('div', { class: 'd-grid gap-2' }, estado.trabalhos.map(function (t, i) {
          var mover = function (d) { var j = i + d, a = estado.trabalhos; if (j < 0 || j >= a.length) return; var x = a[i]; a[i] = a[j]; a[j] = x; marcar(); renderPainel(); };
          var rem = h('button', { class: 'btn btn-sm btn-outline-danger', type: 'button', onclick: function () { if (rem.dataset.c) { estado.trabalhos.splice(i, 1); marcar(); renderPainel(); } else { rem.dataset.c = '1'; rem.textContent = 'Confirmar'; } } }, 'Remover');
          return h('div', { class: 'd-flex align-items-center gap-2 p-2 border rounded-3' },
            IMG_OK.test(t.img || '') ? h('img', { class: 'mini', src: t.img, alt: '' }) : h('span', { class: 'mini', text: iniciais(t.titulo) }),
            h('div', { style: 'min-width:0', class: 'flex-grow-1' }, h('div', { class: 'fw-semibold text-truncate', text: t.titulo }), h('div', { class: 'small text-body-secondary', text: (TIPOS[t.tipo] || '') + (t.categoria ? ' · ' + t.categoria : '') })),
            h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', disabled: i === 0, 'aria-label': 'Subir', onclick: function () { mover(-1); } }, '↑'),
            h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', disabled: i === estado.trabalhos.length - 1, 'aria-label': 'Descer', onclick: function () { mover(1); } }, '↓'), rem);
        })) : h('div', { class: 'vazio', text: 'Ainda não há trabalhos.' }))))));
  }

  // ---- Contactos e loja ----
  function painelContactos(c) {
    var L = estado.loja, m = function (k) { return function (v) { L[k] = v; marcar(); }; };
    c.append(h('div', { class: 'row g-4' },
      h('div', { class: 'col-lg-6' }, h('div', { class: 'card' }, h('div', { class: 'card-body' },
        h('h6', { text: 'Canais de contacto' }), h('p', { class: 'small text-body-secondary', text: 'Desligue um canal quando não estiver disponível. O cliente só pode escolher os canais ligados.' }),
        h('div', { class: 'd-grid gap-3' }, estado.canais.map(function (k) {
          var sw = h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: 'cn-at-' + k.id }); sw.checked = k.ativo;
          sw.addEventListener('change', function () { k.ativo = sw.checked; marcar(); });
          return h('div', { class: 'p-3 border rounded-3 d-grid gap-2' },
            h('div', { class: 'd-flex align-items-center gap-2' }, icone(k.id), h('strong', { text: k.nome }), h('div', { class: 'form-check form-switch ms-auto mb-0' }, sw, h('label', { class: 'form-check-label small', for: 'cn-at-' + k.id, text: 'Disponível' }))),
            h('div', { class: 'row g-2' },
              campo('cn-v-' + k.id, k.id === 'email' ? 'Endereço' : 'Número', k.valor, function (v) { k.valor = v.trim(); marcar(); }, { col: 'col-sm-6', max: '120', tipo: k.id === 'email' ? 'email' : 'tel' }),
              campo('cn-h-' + k.id, 'Horário', k.horario, function (v) { k.horario = v.trim(); marcar(); }, { col: 'col-sm-6', max: '60' })));
        }))))),
      h('div', { class: 'col-lg-6' }, h('div', { class: 'card' }, h('div', { class: 'card-body' }, h('h6', { text: 'Informação da loja' }), h('div', { class: 'row g-2' },
        campo('lj-nome', 'Nome da loja', L.nome, m('nome'), { col: 'col-sm-6', max: '40' }),
        campo('lj-dono', 'O seu nome', L.dono, m('dono'), { col: 'col-sm-6', max: '80' }),
        campo('lj-slogan', 'Frase principal', L.slogan, m('slogan'), { max: '90' }),
        campo('lj-sobre', 'Sobre mim', L.sobre, m('sobre'), { area: true, max: '500' }),
        campo('lj-stack', 'Tecnologias', L.stack, m('stack'), { max: '90' }),
        campo('lj-local', 'Localização', L.local, m('local'), { col: 'col-sm-6', max: '60' }),
        campo('lj-alt', 'Telefone alternativo', L.telAlt, m('telAlt'), { col: 'col-sm-6', max: '30', ajuda: 'Deixe vazio para esconder.' })))))));
  }

  // ---- Segurança ----
  function _painelSegurancaClaude(c) {
    var a = h('input', { class: 'form-control', type: 'password', id: 'sg-atual', autocomplete: 'current-password' });
    var n1 = h('input', { class: 'form-control', type: 'password', id: 'sg-nova', autocomplete: 'new-password' });
    var n2 = h('input', { class: 'form-control', type: 'password', id: 'sg-nova2', autocomplete: 'new-password' });
    var msg = h('div', { class: 'small', role: 'status' });
    var b = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Alterar palavra-passe' });
    c.append(h('div', { class: 'row g-4' },
      h('div', { class: 'col-lg-6' }, h('div', { class: 'card' }, h('form', { class: 'card-body d-grid gap-3', onsubmit: function (e) {
        e.preventDefault(); msg.className = 'small text-danger';
        if (n1.value.length < 8) { msg.textContent = 'A nova palavra-passe tem de ter pelo menos 8 caracteres.'; return; }
        if (n1.value !== n2.value) { msg.textContent = 'As novas palavras-passe não coincidem.'; return; }
        b.disabled = true;
        refConfig().get().then(function (s) { var cfg = s.data(); return derivar(a.value, cfg.sal).then(function (d) { return d.hash === cfg.hash; }); })
          .then(function (ok) { if (!ok) throw new Error('A palavra-passe atual está errada.'); return derivar(n1.value, null); })
          .then(function (d) { return refConfig().set({ tipo: 'config', hash: d.hash, sal: d.sal, criado: Date.now() }); })
          .then(function () { msg.className = 'small text-success'; msg.textContent = 'Palavra-passe alterada.'; a.value = n1.value = n2.value = ''; b.disabled = false; })
          .catch(function (er) { msg.textContent = er.message || 'Não foi possível alterar.'; b.disabled = false; });
      } }, h('h6', { class: 'mb-0', text: 'Palavra-passe de administrador' }),
        h('div', null, h('label', { class: 'form-label', for: 'sg-atual', text: 'Palavra-passe atual' }), a),
        h('div', null, h('label', { class: 'form-label', for: 'sg-nova', text: 'Nova palavra-passe' }), n1),
        h('div', null, h('label', { class: 'form-label', for: 'sg-nova2', text: 'Repita a nova palavra-passe' }), n2), msg, b))),
      h('div', { class: 'col-lg-6' }, h('div', { class: 'card' }, h('div', { class: 'card-body d-grid gap-2' },
        h('h6', { class: 'mb-0', text: 'Como a loja está protegida' }),
        h('ul', { class: 'small mb-0 d-grid gap-1' },
          h('li', { text: 'O painel só aparece para a conta do Claude dona do site. Mesmo que alguém descubra a palavra-passe, não consegue publicar sem essa conta.' }),
          h('li', { text: 'A palavra-passe é guardada encriptada (PBKDF2), nunca em texto.' }),
          h('li', { text: 'O histórico de vendas e os dados dos clientes ficam numa área privada, fora da página pública.' }),
          h('li', { text: 'As fotos perdem os metadados de localização ao serem carregadas.' }),
          h('li', { text: 'A sessão termina sozinha ao fim de 2 horas.' })),
        h('button', { class: 'btn btn-outline-danger mt-2', type: 'button', onclick: function () { sessao('ll_admin_ate', null); esconder(modalPainel, 'Modal'); aviso('Sessão terminada'); } }, 'Terminar sessão'))))));
  }

  // ================= Exportar e cópias de segurança =================
  function baixar(nome, texto, tipo) {
    var url = URL.createObjectURL(new Blob([texto], { type: tipo || 'application/json' }));
    var a = h('a', { href: url, download: nome }); document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function gerarHTML() { return JSON.stringify(estado, null, 1); }
  function publicar(botao) {
    baixar('dados.json', JSON.stringify(estado, null, 1));
    ORIGINAL = JSON.stringify(estado); alterado = false; renderPePainel();
    msgPub('dados.json exportado. Substitua o ficheiro no repositório e faça commit; o site atualiza em 1 a 2 minutos.', 'small text-success');
  }

  function painelSeguranca(c) {
    var a = h('input', { class: 'form-control', type: 'password', id: 'sg-atual', autocomplete: 'current-password' });
    var n1 = h('input', { class: 'form-control', type: 'password', id: 'sg-nova', autocomplete: 'new-password' });
    var n2 = h('input', { class: 'form-control', type: 'password', id: 'sg-nova2', autocomplete: 'new-password' });
    var msg = h('div', { class: 'small', role: 'status' });
    var b = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Alterar palavra-passe' });
    var copiaMsg = h('div', { class: 'small', role: 'status' });
    var fic = h('input', { class: 'form-control', type: 'file', id: 'sg-restaurar', accept: 'application/json,.json' });
    fic.addEventListener('change', function () {
      var f = fic.files[0]; if (!f) return;
      f.text().then(function (t) {
        var d = JSON.parse(t);
        if (!d || d.formato !== 'lelolabs-vendas' || typeof d.dados !== 'object') throw new Error('Este ficheiro não é uma cópia de segurança do LeloLabs.');
        var b2 = lerBD(), n = 0;
        Object.keys(d.dados).forEach(function (k) { var v = d.dados[k]; if (v && v.tipo === 'venda' && !b2[k]) { b2[k] = v; n++; } });
        gravarBD(b2); copiaMsg.className = 'small text-success'; copiaMsg.textContent = n + ' vendas restauradas (as que já existiam foram mantidas).';
      }).catch(function (e) { copiaMsg.className = 'small text-danger'; copiaMsg.textContent = e.message || 'Ficheiro inválido.'; });
      fic.value = '';
    });
    c.append(h('div', { class: 'row g-4' },
      h('div', { class: 'col-lg-6' }, h('div', { class: 'card' }, h('form', { class: 'card-body d-grid gap-3', onsubmit: function (e) {
        e.preventDefault(); msg.className = 'small text-danger';
        if (n1.value.length < 8) { msg.textContent = 'A nova palavra-passe tem de ter pelo menos 8 caracteres.'; return; }
        if (n1.value !== n2.value) { msg.textContent = 'As novas palavras-passe não coincidem.'; return; }
        b.disabled = true;
        refConfig().get().then(function (s) { var cfg = s.data(); return derivar(a.value, cfg.sal).then(function (d) { return d.hash === cfg.hash; }); })
          .then(function (ok) { if (!ok) throw new Error('A palavra-passe atual está errada.'); return derivar(n1.value, null); })
          .then(function (d) { return refConfig().set({ tipo: 'config', hash: d.hash, sal: d.sal, criado: Date.now() }); })
          .then(function () { msg.className = 'small text-success'; msg.textContent = 'Palavra-passe alterada.'; a.value = n1.value = n2.value = ''; b.disabled = false; })
          .catch(function (er) { msg.textContent = er.message || 'Não foi possível alterar.'; b.disabled = false; });
      } }, h('h6', { class: 'mb-0', text: 'Palavra-passe do painel' }),
        h('div', null, h('label', { class: 'form-label', for: 'sg-atual', text: 'Palavra-passe atual' }), a),
        h('div', null, h('label', { class: 'form-label', for: 'sg-nova', text: 'Nova palavra-passe' }), n1),
        h('div', null, h('label', { class: 'form-label', for: 'sg-nova2', text: 'Repita a nova palavra-passe' }), n2), msg, b))),
      h('div', { class: 'col-lg-6' }, h('div', { class: 'card' }, h('div', { class: 'card-body d-grid gap-3' },
        h('h6', { class: 'mb-0', text: 'Cópias de segurança das vendas' }),
        h('p', { class: 'small text-body-secondary mb-0', text: 'As vendas ficam guardadas só neste navegador. Exporte uma cópia todas as semanas e guarde-a fora do repositório público.' }),
        h('div', { class: 'd-flex flex-wrap gap-2' },
          h('button', { class: 'btn btn-outline-primary', type: 'button', onclick: function () {
            var b2 = lerBD(), so = {}; Object.keys(b2).forEach(function (k) { if (b2[k] && b2[k].tipo === 'venda') so[k] = b2[k]; });
            baixar('vendas-lelolabs-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ formato: 'lelolabs-vendas', exportado: Date.now(), dados: so }));
            copiaMsg.className = 'small text-success'; copiaMsg.textContent = 'Cópia exportada. Nunca a envie para o GitHub: contém dados de clientes.';
          } }, 'Exportar cópia')),
        h('div', null, h('label', { class: 'form-label', for: 'sg-restaurar', text: 'Restaurar uma cópia' }), fic), copiaMsg,
        h('button', { class: 'btn btn-outline-danger', type: 'button', onclick: function () { sessao('ll_admin_ate', null); esconder(modalPainel, 'Modal'); aviso('Sessão terminada'); } }, 'Terminar sessão'))))));
  }

  // ================= Arranque do painel =================
  function carregarDados(d) {
    if (!d || !d.loja || !Array.isArray(d.produtos)) throw new Error('Este ficheiro não é o dados.json da loja.');
    estado = d; ORIGINAL = JSON.stringify(d); alterado = false; renderTudo(); mostrarBotaoAdmin(); abrirLogin();
  }
  function ecraInicial(erro) {
    var f = h('input', { class: 'form-control', type: 'file', id: 'ini-dados', accept: 'application/json,.json' });
    var m = h('div', { class: 'small text-danger', role: 'alert', text: erro || '' });
    f.addEventListener('change', function () {
      var x = f.files[0]; if (!x) return;
      x.text().then(function (t) { carregarDados(JSON.parse(t)); }).catch(function (e) { m.textContent = e.message || 'Ficheiro inválido.'; });
    });
    principal.replaceChildren(h('div', { class: 'container py-5' }, h('div', { class: 'card mx-auto', style: 'max-width:520px' }, h('div', { class: 'card-body d-grid gap-3' },
      h('div', { class: 'd-flex align-items-center gap-2' }, h('span', { style: 'width:34px;height:34px;display:inline-flex' }, logo()), h('h1', { class: 'h4 mb-0', text: 'Painel LeloLabs' })),
      h('p', { class: 'text-body-secondary mb-0', text: 'Abra o ficheiro dados.json que está na pasta principal do projeto.' }),
      h('div', null, h('label', { class: 'form-label', for: 'ini-dados', text: 'Ficheiro dados.json' }), f), m))));
  }
  topo.hidden = true;
  fetch('dados.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (d) { topo.hidden = false; carregarDados(d); })
    .catch(function () { ecraInicial(''); });
  var reabrir = sessao('ll_reabrir'); if (reabrir) sessao('ll_reabrir', null);
})();
