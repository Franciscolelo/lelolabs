/* LeloLabs — loja pública. Os dados vêm de dados.json (pedido AJAX). */
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

  // ================= Arranque =================
  principal.replaceChildren(h('div', { class: 'container py-5 text-center text-body-secondary', text: 'A carregar a loja…' }));
  fetch('dados.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) { estado = d; document.title = d.loja.nome || document.title; renderTudo(); })
    .catch(function () {
      principal.replaceChildren(h('div', { class: 'container py-5 text-center' },
        h('p', { class: 'fw-semibold', text: 'Não foi possível carregar a loja.' }),
        h('p', { class: 'text-body-secondary', text: 'Verifique a ligação à internet e recarregue a página. Se abriu o ficheiro diretamente no computador, use um servidor (veja o README).' })));
    });
})();
