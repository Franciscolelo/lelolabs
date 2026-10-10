/* LeloLabs — utilitários partilhados pela loja (index.html) e pelo painel (painel.html) */
'use strict';
window.LL = (function () {
  const cfg = window.LL_CONFIG || {};
  const LL = {};
  LL.configurado = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.SUPABASE_URL || '') && String(cfg.SUPABASE_ANON_KEY || '').length > 30;
  LL.sb = LL.configurado && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL.replace(/\/$/, ''), cfg.SUPABASE_ANON_KEY) : null;

  // ---------- DOM ----------
  const h = LL.h = function (tag, props, ...filhos) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;                 // só para SVG constantes deste ficheiro
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    const junta = f => { if (f == null || f === false) return; if (Array.isArray(f)) f.forEach(junta); else el.append(f instanceof Node ? f : document.createTextNode(String(f))); };
    filhos.forEach(junta);
    return el;
  };

  const SVG = {
    carrinho: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
    lupa: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    clipe: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    descarregar: '<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14"/>',
    enviar: '<path d="M4 12 20 4l-6 16-3-7z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    telefone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    seta: '<path d="M5 12h14m-6-6 6 6-6 6"/>'
  };
  LL.icone = (n, t = 18) => h('span', { class: 'ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SVG[n] || ''}</svg>` });
  LL.logo = () => h('span', { class: 'logo', 'aria-hidden': 'true', html: '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="var(--acento)"/><path d="M16 14v36h18" stroke="var(--acento-tinta)" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 14v22h16" stroke="#F0B84A" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' });

  // ---------- Formatação ----------
  LL.kz = n => (n == null || n === '' || isNaN(n)) ? 'Sob consulta' : String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' Kz';
  LL.digitos = s => String(s || '').replace(/\D/g, '');
  LL.tel = v => { const d = LL.digitos(v); return d.length === 9 ? d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : String(v || ''); };
  LL.iniciais = t => String(t || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  LL.data = ts => { const d = new Date(ts); return d.toLocaleDateString('pt-PT') + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }); };
  LL.tamanho = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  LL.url = s => { try { const u = new URL(String(s).trim()); return u.protocol === 'https:' ? u.href : ''; } catch (e) { return ''; } };
  LL.nomeSeguro = n => String(n || 'ficheiro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  LL.lerLocal = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  LL.gravarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* armazenamento indisponível */ } };
  LL.erro = e => { const m = (e && (e.message || e.error_description)) || ''; if (/Invalid login/i.test(m)) return 'Email ou palavra-passe errados.'; if (/Email not confirmed/i.test(m)) return 'Confirme primeiro o seu email: abra a mensagem que lhe enviámos.'; if (/already registered/i.test(m)) return 'Já existe uma conta com este email. Entre ou recupere a palavra-passe.'; if (/rate limit/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos.'; if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem ligação à internet. Tente outra vez.'; return m || 'Ocorreu um erro. Tente outra vez.'; };

  // ---------- Estados dos pedidos ----------
  LL.ESTADOS = {
    pendente: { t: 'A aguardar validação', c: 'text-bg-warning', p: 0 },
    validado: { t: 'Validado · a aguardar pagamento', c: 'text-bg-info', p: 1 },
    comprovativo: { t: 'Comprovativo enviado', c: 'text-bg-primary', p: 2 },
    pago: { t: 'Pago · em produção', c: 'text-bg-primary', p: 3 },
    concluido: { t: 'Concluído', c: 'text-bg-success', p: 4 },
    cancelado: { t: 'Cancelado', c: 'text-bg-secondary', p: -1 }
  };
  LL.selo = e => h('span', { class: 'badge ' + (LL.ESTADOS[e] || {}).c, text: (LL.ESTADOS[e] || {}).t || e });
  LL.linhaTempo = estado => {
    const p = (LL.ESTADOS[estado] || {}).p;
    if (p < 0) return h('div', { class: 'small text-body-secondary', text: 'Pedido cancelado.' });
    return h('ol', { class: 'passos', 'aria-label': 'Progresso do pedido' }, ['Pedido', 'Validação', 'Pagamento', 'Produção', 'Entrega'].map((n, i) =>
      h('li', { class: i < p ? 'feito' : i === p ? 'atual' : '', 'aria-current': i === p ? 'step' : null }, h('span', { text: n }))));
  };

  // ---------- Pesquisa estilo Google ----------
  LL.norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  LL.termos = q => LL.norm(q).split(/\s+/).filter(Boolean);
  LL.corresponde = (texto, termos) => { const n = LL.norm(texto); return termos.every(t => n.includes(t)); };
  LL.destacar = (texto, termos) => {
    texto = String(texto == null ? '' : texto);
    if (!termos.length) return [document.createTextNode(texto)];
    let norm = ''; const mapa = [];
    for (let i = 0; i < texto.length; i++) for (const x of LL.norm(texto[i])) { norm += x; mapa.push(i); }
    const marca = new Array(texto.length).fill(false);
    termos.forEach(t => { let p = norm.indexOf(t); while (p >= 0) { for (let k = p; k < p + t.length; k++) marca[mapa[k]] = true; p = norm.indexOf(t, p + t.length); } });
    const out = []; let buf = '', em = false;
    const despeja = () => { if (buf) out.push(em ? h('mark', { text: buf }) : document.createTextNode(buf)); buf = ''; };
    for (let i = 0; i < texto.length; i++) { if (marca[i] !== em) { despeja(); em = marca[i]; } buf += texto[i]; }
    despeja(); return out;
  };
  LL.caixaPesquisa = ({ id, placeholder, valor = '', aoMudar, grande = false }) => {
    const inp = h('input', { class: 'pesquisa-campo', type: 'search', id, placeholder, autocomplete: 'off', 'aria-label': placeholder, enterkeyhint: 'search' });
    inp.value = valor;
    let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => aoMudar(inp.value), 150); });
    const limpar = h('button', { class: 'pesquisa-limpar', type: 'button', 'aria-label': 'Limpar pesquisa', onclick: () => { inp.value = ''; aoMudar(''); inp.focus(); } }, '×');
    return h('div', { class: 'pesquisa' + (grande ? ' grande' : '') }, LL.icone('lupa', 20), inp, limpar);
  };
  LL.contagem = (n, ms) => h('div', { class: 'pesquisa-contagem', text: (n === 1 ? '1 resultado' : n + ' resultados') + ' (' + (ms / 1000).toFixed(2).replace('.', ',') + ' segundos)' });

  // ---------- Interface ----------
  LL.modal = ({ titulo = '', tamanho = '', classe = '' } = {}) => {
    const tit = h('h5', { class: 'modal-title', text: titulo });
    const corpo = h('div', { class: 'modal-body' });
    const el = h('div', { class: 'modal fade ' + classe, tabindex: '-1', 'aria-hidden': 'true' },
      h('div', { class: 'modal-dialog modal-dialog-centered modal-dialog-scrollable ' + tamanho },
        h('div', { class: 'modal-content' },
          h('div', { class: 'modal-header' }, tit, h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal', 'aria-label': 'Fechar' })),
          corpo)));
    document.body.append(el);
    const inst = () => bootstrap.Modal.getOrCreateInstance(el);
    return { el, corpo, titulo: t => { tit.textContent = t; }, abrir: () => inst().show(), fechar: () => inst().hide() };
  };
  const zonaAvisos = h('div', { class: 'toast-container position-fixed bottom-0 start-50 translate-middle-x p-3', style: 'z-index:1095' });
  document.addEventListener('DOMContentLoaded', () => document.body.append(zonaAvisos));
  LL.aviso = (texto, tipo) => {
    if (!zonaAvisos.isConnected) document.body.append(zonaAvisos);
    const t = h('div', { class: 'toast align-items-center' + (tipo === 'erro' ? ' toast-erro' : ''), role: 'status', 'aria-live': 'polite' }, h('div', { class: 'toast-body', text: texto }));
    zonaAvisos.append(t);
    const x = bootstrap.Toast.getOrCreateInstance(t, { delay: tipo === 'erro' ? 5000 : 2600 });
    t.addEventListener('hidden.bs.toast', () => t.remove()); x.show();
  };
  LL.confirmarBotao = (botao, texto, acao) => {         // confirmação em dois cliques, sem caixas do navegador
    const original = botao.textContent;
    botao.addEventListener('click', () => {
      if (botao.dataset.c) { delete botao.dataset.c; botao.textContent = original; acao(); }
      else { botao.dataset.c = '1'; botao.textContent = texto; setTimeout(() => { if (botao.dataset.c) { delete botao.dataset.c; botao.textContent = original; } }, 4000); }
    });
    return botao;
  };
  LL.campo = (id, rotulo, valor, o = {}) => {
    const el = o.area ? h('textarea', { class: 'form-control', id, rows: o.rows || '3', maxlength: o.max || '600', placeholder: o.ph || null })
      : o.opcoes ? h('select', { class: 'form-select', id }, o.opcoes.map(([v, t]) => h('option', { value: v, text: t })))
      : h('input', { class: 'form-control', id, type: o.tipo || 'text', maxlength: o.max || '200', placeholder: o.ph || null, autocomplete: o.auto || null, min: o.min || null, step: o.step || null, required: o.req || null });
    el.value = valor == null ? '' : valor;
    const bloco = h('div', { class: o.col || 'col-12' }, h('label', { class: 'form-label', for: id, text: rotulo }), el, o.ajuda ? h('div', { class: 'form-text', text: o.ajuda }) : null);
    bloco.campo = el; return bloco;
  };
  LL.avisoConfig = () => h('div', { class: 'container py-5' }, h('div', { class: 'card mx-auto', style: 'max-width:560px' }, h('div', { class: 'card-body d-grid gap-2' },
    h('h1', { class: 'h4', text: 'Falta ligar a base de dados' }),
    h('p', { class: 'mb-0', text: 'Abra o ficheiro config.js e cole o endereço e a chave "anon" do seu projeto Supabase. Os passos estão no README.md.' }))));
  function sincronizarTema() { document.documentElement.setAttribute('data-bs-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  sincronizarTema(); try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sincronizarTema); } catch (e) { /* navegadores antigos */ }

  // ---------- Imagens e ficheiros ----------
  LL.urlPublica = path => LL.sb.storage.from('publico').getPublicUrl(path).data.publicUrl;
  LL.comprimir = ficheiro => new Promise((resolve, rejeita) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(ficheiro.type)) return rejeita(new Error('Use imagens JPG, PNG ou WebP.'));
    const url = URL.createObjectURL(ficheiro), img = new Image();
    img.onload = () => {
      const r = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : rejeita(new Error('Não foi possível preparar a imagem.')), 'image/jpeg', 0.82);   // remove metadados (GPS)
    };
    img.onerror = () => { URL.revokeObjectURL(url); rejeita(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
  LL.abrirPrivado = async (bucket, path, descarregar) => {
    const janela = window.open('', '_blank');               // abre já, para não ser bloqueada
    const { data, error } = await LL.sb.storage.from(bucket).createSignedUrl(path, 120, descarregar ? { download: true } : undefined);
    if (error || !data) { if (janela) janela.close(); LL.aviso('Não foi possível abrir o ficheiro. Tente outra vez.', 'erro'); return; }
    if (janela) janela.location = data.signedUrl; else location.href = data.signedUrl;
  };

  // Galeria com até 6 imagens (carrossel do Bootstrap)
  let nGaleria = 0;
  LL.galeria = (imagens, alt, classe = '') => {
    imagens = (imagens || []).slice(0, 6);
    if (!imagens.length) return h('div', { class: 'capa capa-grelha ' + classe, 'aria-hidden': 'true' }, h('span', { text: LL.iniciais(alt) }));
    if (imagens.length === 1) return h('div', { class: 'capa ' + classe }, h('img', { src: LL.urlPublica(imagens[0]), alt, loading: 'lazy' }));
    const id = 'gal' + (++nGaleria);
    return h('div', { class: 'capa carousel slide ' + classe, id, 'data-bs-ride': 'false' },
      h('div', { class: 'carousel-indicators' }, imagens.map((_, i) => h('button', { type: 'button', 'data-bs-target': '#' + id, 'data-bs-slide-to': String(i), class: i ? '' : 'active', 'aria-current': i ? null : 'true', 'aria-label': 'Imagem ' + (i + 1) }))),
      h('div', { class: 'carousel-inner h-100' }, imagens.map((p, i) => h('div', { class: 'carousel-item h-100' + (i ? '' : ' active') }, h('img', { src: LL.urlPublica(p), alt: alt + ' — imagem ' + (i + 1), loading: 'lazy' })))),
      h('button', { class: 'carousel-control-prev', type: 'button', 'data-bs-target': '#' + id, 'data-bs-slide': 'prev' }, h('span', { class: 'carousel-control-prev-icon', 'aria-hidden': 'true' }), h('span', { class: 'visually-hidden', text: 'Anterior' })),
      h('button', { class: 'carousel-control-next', type: 'button', 'data-bs-target': '#' + id, 'data-bs-slide': 'next' }, h('span', { class: 'carousel-control-next-icon', 'aria-hidden': 'true' }), h('span', { class: 'visually-hidden', text: 'Seguinte' })));
  };

  // ---------- Chat (usado pelo cliente e pelo administrador) ----------
  LL.chat = ({ clienteId, souAdmin, textoInicial = '' }) => {
    const sb = LL.sb, eu = souAdmin ? 'admin' : 'cliente';
    const lista = h('div', { class: 'chat-lista', role: 'log', 'aria-live': 'polite', 'aria-label': 'Mensagens' });
    const texto = h('textarea', { class: 'form-control', rows: '2', maxlength: '2000', placeholder: 'Escreva uma mensagem…', 'aria-label': 'Mensagem' });
    texto.value = textoInicial;
    const ficheiro = h('input', { type: 'file', class: 'd-none', accept: 'image/jpeg,image/png,image/webp,application/pdf' });
    const infoAnexo = h('div', { class: 'small text-body-secondary' });
    const enviar = h('button', { class: 'btn btn-primary', type: 'submit', 'aria-label': 'Enviar' }, LL.icone('enviar'));
    let anexo = null; const vistas = new Set();
    ficheiro.addEventListener('change', () => {
      const f = ficheiro.files[0]; ficheiro.value = ''; if (!f) return;
      if (f.size > 10 * 1048576) { LL.aviso('O ficheiro tem mais de 10 MB.', 'erro'); return; }
      if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { LL.aviso('Envie imagens (JPG, PNG, WebP) ou PDF.', 'erro'); return; }
      anexo = f; infoAnexo.replaceChildren(LL.icone('clipe', 14), ' ' + f.name + ' (' + LL.tamanho(f.size) + ') ', h('button', { class: 'btn btn-link btn-sm p-0', type: 'button', onclick: () => { anexo = null; infoAnexo.replaceChildren(); }, text: 'remover' }));
    });
    const bolha = m => {
      if (vistas.has(m.id)) return null; vistas.add(m.id);
      if (m.tipo === 'sistema') return h('div', { class: 'chat-sistema' }, h('span', { text: m.texto }), h('time', { text: LL.data(m.criado) }));
      const minha = m.autor === eu;
      const anexoEl = m.anexo_path ? h('button', { class: 'chat-anexo', type: 'button', onclick: () => LL.abrirPrivado('anexos', m.anexo_path) }, LL.icone('clipe', 14), ' ', m.anexo_nome || 'Anexo') : null;
      return h('div', { class: 'chat-bolha ' + (minha ? 'minha' : 'outra') + (m.tipo === 'comprovativo' ? ' comprovativo' : '') },
        m.tipo === 'comprovativo' ? h('div', { class: 'rotulo mb-1', text: 'Comprovativo de pagamento' }) : null,
        m.texto ? h('div', { class: 'chat-texto', text: m.texto }) : null, anexoEl,
        h('time', { text: LL.data(m.criado) }));
    };
    const acrescentar = m => { const b = bolha(m); if (b) { const v = lista.querySelector('.chat-vazio'); if (v) v.remove(); lista.append(b); lista.scrollTop = lista.scrollHeight; } };
    const marcarLidas = () => sb.from('mensagens').update({ lida: true }).eq('cliente_id', clienteId).neq('autor', eu).eq('lida', false).then(() => {});
    const form = h('form', { class: 'chat-form', onsubmit: async e => {
      e.preventDefault();
      const t = texto.value.trim(); if (!t && !anexo) return;
      enviar.disabled = true;
      try {
        let path = null, nome = null, tipo = null;
        if (anexo) {
          path = clienteId + '/chat/' + Date.now() + '-' + LL.nomeSeguro(anexo.name);
          const up = await sb.storage.from('anexos').upload(path, anexo, { contentType: anexo.type });
          if (up.error) throw up.error;
          nome = anexo.name.slice(0, 120); tipo = anexo.type;
        }
        const { data, error } = await sb.from('mensagens').insert({ cliente_id: clienteId, autor: eu, texto: t, anexo_path: path, anexo_nome: nome, anexo_tipo: tipo }).select().single();
        if (error) throw error;
        acrescentar(data); texto.value = ''; anexo = null; infoAnexo.replaceChildren();
      } catch (er) { LL.aviso(LL.erro(er), 'erro'); }
      enviar.disabled = false; texto.focus();
    } },
      h('label', { class: 'btn btn-outline-secondary', title: 'Anexar ficheiro', 'aria-label': 'Anexar ficheiro' }, LL.icone('clipe'), ficheiro),
      texto, enviar);
    texto.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    const el = h('div', { class: 'chat' }, lista, infoAnexo, form);
    lista.append(h('div', { class: 'text-center small text-body-secondary py-3', text: 'A carregar mensagens…' }));
    sb.from('mensagens').select('*').eq('cliente_id', clienteId).order('criado', { ascending: true }).limit(500).then(({ data, error }) => {
      lista.replaceChildren();
      if (error) { lista.append(h('div', { class: 'text-danger small p-3', text: LL.erro(error) })); return; }
      if (!data.length) lista.append(h('div', { class: 'chat-vazio text-center small text-body-secondary py-4', text: souAdmin ? 'Ainda não há mensagens com este cliente.' : 'Escreva a sua primeira mensagem. Respondo aqui mesmo.' }));
      data.forEach(acrescentar); marcarLidas();
    });
    const canal = sb.channel('chat-' + clienteId + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: 'cliente_id=eq.' + clienteId }, ev => { acrescentar(ev.new); if (ev.new.autor !== eu) marcarLidas(); })
      .subscribe();
    return { el, parar: () => sb.removeChannel(canal), focar: () => texto.focus() };
  };

  return LL;
})();
