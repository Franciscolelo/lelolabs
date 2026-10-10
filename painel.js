/* LeloLabs — painel de administração */
'use strict';
(function () {
  const { h, sb } = LL;
  const raiz = document.getElementById('raiz');
  if (!LL.configurado) { raiz.replaceChildren(LL.avisoConfig()); return; }

  let aba = 'pedidos', loja = {}, pedidos = [], clientes = [], produtos = [], trabalhos = [];
  let busca = '', filtroEstado = 'ativos', clienteChat = null, chatAtivo = null, canais = [];
  const topo = h('header', { class: 'topo' });
  const principal = h('main', { class: 'container py-4' });
  raiz.append(topo, principal);
  const mPedido = LL.modal({ titulo: 'Pedido', tamanho: 'modal-lg' });
  const mEditor = LL.modal({ titulo: '', tamanho: 'modal-lg' });

  // ================= Entrada =================
  sb.auth.onAuthStateChange((ev, s) => setTimeout(() => verificar(s), 0));
  async function verificar(s) {
    if (!s) { ecraLogin(); return; }
    const { data } = await sb.rpc('e_admin');
    if (!data) { ecraLogin('Esta conta não tem acesso de administrador.'); await sb.auth.signOut(); return; }
    await carregarTudo(); iniciarTempoReal(); render();
  }
  function ecraLogin(msgErro) {
    topo.replaceChildren(); pararTempoReal();
    const email = LL.campo('lg-email', 'Email', '', { tipo: 'email', auto: 'email', max: '120' });
    const senha = LL.campo('lg-senha', 'Palavra-passe', '', { tipo: 'password', auto: 'current-password', max: '72' });
    const erro = h('div', { class: 'small text-danger', role: 'alert', text: msgErro || '' });
    const botao = h('button', { class: 'btn btn-primary btn-lg', type: 'submit', text: 'Entrar' });
    principal.replaceChildren(h('div', { class: 'card mx-auto mt-5', style: 'max-width:420px' }, h('form', { class: 'card-body row g-3', onsubmit: async e => {
      e.preventDefault(); erro.textContent = ''; botao.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: email.campo.value.trim(), password: senha.campo.value });
      botao.disabled = false; if (error) erro.textContent = LL.erro(error);
    } },
      h('div', { class: 'col-12 d-flex align-items-center gap-2' }, LL.logo(), h('h1', { class: 'h4 mb-0', text: 'Painel LeloLabs' })),
      h('p', { class: 'col-12 small text-body-secondary mb-0', text: 'Use a mesma conta com que se registou na loja. Só contas de administrador entram aqui.' }),
      email, senha, h('div', { class: 'col-12' }, erro), h('div', { class: 'col-12 d-grid' }, botao))));
  }

  async function carregarTudo() {
    const [l, p, c, pr, t] = await Promise.all([
      sb.from('loja').select('dados').eq('id', 1).maybeSingle(),
      sb.from('pedidos').select('*').order('criado', { ascending: false }).limit(1000),
      sb.from('perfis').select('*').order('criado', { ascending: false }).limit(2000),
      sb.from('produtos').select('*').order('ordem').order('criado'),
      sb.from('trabalhos').select('*').order('ordem').order('criado', { ascending: false })
    ]);
    const er = [l, p, c, pr, t].find(x => x.error); if (er) LL.aviso(LL.erro(er.error), 'erro');
    loja = (l.data && l.data.dados) || {}; pedidos = p.data || []; clientes = c.data || []; produtos = pr.data || []; trabalhos = t.data || [];
    await contarNaoLidas();
  }
  const cliente = id => clientes.find(c => c.id === id) || { nome: '(cliente removido)', email: '', telefone: '' };
  let naoLidasPor = {};
  async function contarNaoLidas() {
    const { data } = await sb.from('mensagens').select('cliente_id').eq('autor', 'cliente').eq('lida', false).limit(5000);
    naoLidasPor = {}; (data || []).forEach(m => { naoLidasPor[m.cliente_id] = (naoLidasPor[m.cliente_id] || 0) + 1; });
  }
  function iniciarTempoReal() {
    pararTempoReal();
    canais.push(sb.channel('adm-pedidos').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async ev => {
      if (ev.eventType === 'INSERT') { LL.aviso('Novo pedido ' + ev.new.codigo); if (!clientes.some(c => c.id === ev.new.cliente_id)) { const r = await sb.from('perfis').select('*').eq('id', ev.new.cliente_id).maybeSingle(); if (r.data) clientes.unshift(r.data); } }
      if (ev.eventType === 'UPDATE' && ev.new.estado === 'comprovativo' && ev.old && ev.old.estado !== 'comprovativo') LL.aviso('Comprovativo recebido: ' + ev.new.codigo);
      const { data } = await sb.from('pedidos').select('*').order('criado', { ascending: false }).limit(1000); pedidos = data || pedidos;
      if (aba === 'pedidos' || aba === 'resumo') renderConteudo();
      renderTopo();
    }).subscribe());
    canais.push(sb.channel('adm-msg').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, async ev => {
      if (ev.new.autor !== 'cliente') return;
      if (!(chatAtivo && clienteChat === ev.new.cliente_id)) { LL.aviso('Mensagem de ' + cliente(ev.new.cliente_id).nome); }
      await contarNaoLidas(); renderTopo(); if (aba === 'conversas') renderListaConversas();
    }).subscribe());
  }
  function pararTempoReal() { canais.forEach(c => sb.removeChannel(c)); canais = []; }

  // ================= Estrutura =================
  function render() { renderTopo(); renderConteudo(); }
  function renderTopo() {
    const totalNaoLidas = Object.values(naoLidasPor).reduce((s, n) => s + n, 0);
    const porVer = pedidos.filter(p => p.estado === 'pendente' || p.estado === 'comprovativo').length;
    const abas = [['pedidos', 'Pedidos', porVer], ['conversas', 'Conversas', totalNaoLidas], ['clientes', 'Clientes'], ['catalogo', 'Serviços'], ['trabalhos', 'Trabalhos'], ['avaliacoes', 'Avaliações'], ['loja', 'Loja e pagamentos']];
    topo.replaceChildren(h('div', { class: 'container flex-wrap py-2' },
      h('a', { class: 'marca', href: 'index.html', target: '_blank', rel: 'noopener' }, LL.logo(), 'Painel'),
      h('ul', { class: 'nav nav-pills gap-1 flex-wrap ms-lg-3' }, abas.map(([a, t, n]) => h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link' + (aba === a ? ' active' : ''), onclick: () => mudarAba(a) }, t, n ? h('span', { class: 'badge rounded-pill text-bg-danger ms-1', text: n }) : null)))),
      h('button', { class: 'btn btn-outline-secondary btn-sm ms-auto', type: 'button', onclick: () => sb.auth.signOut(), text: 'Sair' })));
  }
  function mudarAba(a) { if (chatAtivo) { chatAtivo.parar(); chatAtivo = null; } aba = a; render(); }
  function renderConteudo() {
    ({ pedidos: abaPedidos, conversas: abaConversas, clientes: abaClientes, catalogo: abaCatalogo, trabalhos: abaTrabalhos, avaliacoes: abaAvaliacoes, loja: abaLoja })[aba]();
  }

  // ================= Pedidos (pesquisa estilo Google) =================
  function abaPedidos() {
    const conta = e => pedidos.filter(p => p.estado === e).length;
    const faturado = pedidos.filter(p => p.estado === 'pago' || p.estado === 'concluido').reduce((s, p) => s + Number(p.total || 0), 0);
    const kpi = (r, v, s, f) => h('div', { class: 'col-6 col-lg' }, h('button', { class: 'kpi w-100 text-start', type: 'button', onclick: () => { filtroEstado = f; abaPedidos(); } }, h('div', { class: 'rotulo', text: r }), h('div', { class: 'v', text: v }), h('div', { class: 'small text-body-secondary mt-1', text: s })));
    const termos = LL.termos(busca), t0 = performance.now();
    const filtrados = pedidos.filter(p => {
      if (filtroEstado === 'ativos' && (p.estado === 'concluido' || p.estado === 'cancelado')) return false;
      if (filtroEstado !== 'ativos' && filtroEstado !== 'todos' && p.estado !== filtroEstado) return false;
      if (!termos.length) return true;
      const c = cliente(p.cliente_id);
      return LL.corresponde([p.codigo, c.nome, c.email, c.telefone, p.itens.map(i => i.nome).join(' '), p.notas, p.metodo_pagamento, (LL.ESTADOS[p.estado] || {}).t].join(' '), termos);
    });
    const ms = performance.now() - t0;
    const filtros = [['ativos', 'Em curso'], ['pendente', 'Por validar'], ['comprovativo', 'Comprovativos'], ['pago', 'Em produção'], ['concluido', 'Concluídos'], ['cancelado', 'Cancelados'], ['todos', 'Todos']];
    principal.replaceChildren(
      h('div', { class: 'row g-3 mb-4' },
        kpi('Por validar', String(conta('pendente')), 'Pedidos novos', 'pendente'),
        kpi('Comprovativos', String(conta('comprovativo')), 'Para confirmar', 'comprovativo'),
        kpi('A aguardar pagamento', String(conta('validado')), 'Já validados', 'validado'),
        kpi('Em produção', String(conta('pago')), 'Pagos, por entregar', 'pago'),
        kpi('Faturado', LL.kz(faturado), conta('concluido') + ' concluídos', 'concluido')),
      h('div', { class: 'text-center mb-3' }, h('div', { class: 'marca-pesquisa', 'aria-hidden': 'true', text: loja.nome || 'LeloLabs' })),
      h('div', { class: 'mx-auto', style: 'max-width:680px' }, LL.caixaPesquisa({ id: 'busca-pedidos', placeholder: 'Pesquisar por código, cliente, email, telefone ou serviço', valor: busca, grande: true, aoMudar: v => { busca = v; const pos = v.length; abaPedidos(); const c = document.getElementById('busca-pedidos'); c.focus(); c.setSelectionRange(pos, pos); } })),
      h('ul', { class: 'nav nav-pills gap-1 justify-content-center my-3 small' }, filtros.map(([f, t]) => h('li', { class: 'nav-item' }, h('button', { type: 'button', class: 'nav-link py-1' + (filtroEstado === f ? ' active' : ''), onclick: () => { filtroEstado = f; abaPedidos(); } }, t)))),
      h('div', { class: 'resultados mx-auto' }, LL.contagem(filtrados.length, ms),
        filtrados.length ? filtrados.map(p => resultadoPedido(p, termos)) : h('div', { class: 'vazio mt-3', text: busca ? 'Nenhum pedido corresponde a "' + busca + '".' : 'Não há pedidos nesta lista.' })));
  }
  function resultadoPedido(p, termos) {
    const c = cliente(p.cliente_id);
    return h('article', { class: 'resultado' },
      h('div', { class: 'resultado-url' }, h('span', { class: 'mono' }, LL.destacar(c.email, termos)), c.telefone ? h('span', null, ' › ', LL.destacar(LL.tel(c.telefone), termos)) : null),
      h('h3', null, h('button', { class: 'resultado-titulo', type: 'button', onclick: () => abrirPedido(p.id) }, LL.destacar(p.codigo, termos), ' — ', LL.destacar(c.nome || 'Sem nome', termos))),
      h('p', { class: 'resultado-resumo' }, h('span', { class: 'text-body-secondary', text: LL.data(p.criado) + ' — ' }), LL.destacar(p.itens.map(i => i.qtd + '× ' + i.nome).join(', '), termos), ' · ', h('strong', { text: LL.kz(p.total) }), p.notas ? h('span', null, ' · ', LL.destacar(p.notas.slice(0, 140), termos)) : null),
      h('div', { class: 'd-flex gap-2 align-items-center flex-wrap' }, LL.selo(p.estado), p.metodo_pagamento ? h('span', { class: 'small text-body-secondary', text: p.metodo_pagamento + ((p.parcelas || 1) > 1 ? ' · ' + (p.parcelas_pagas || 0) + '/' + p.parcelas + ' prestações' : '') }) : null,
        h('button', { class: 'btn btn-sm btn-primary ms-auto', type: 'button', onclick: () => abrirPedido(p.id), text: { pendente: 'Validar', comprovativo: 'Ver comprovativo', pago: 'Entregar projeto' }[p.estado] || 'Abrir' })));
  }

  async function abrirPedido(id) {
    const p = pedidos.find(x => x.id === id); if (!p) return;
    const c = cliente(p.cliente_id);
    mPedido.titulo('Pedido ' + p.codigo);
    mPedido.corpo.replaceChildren(h('div', { class: 'text-body-secondary small', text: 'A carregar…' }));
    mPedido.abrir();
    const [comp, ent] = await Promise.all([
      sb.from('mensagens').select('*').eq('pedido_id', p.id).eq('tipo', 'comprovativo').order('criado', { ascending: false }),
      sb.from('entregas').select('*').eq('pedido_id', p.id).order('criado')]);
    const msg = h('div', { class: 'small', role: 'status' });
    const nota = LL.campo('pd-nota', 'Nota para o cliente (opcional)', '', { area: true, rows: '2', max: '1000', ph: 'Ex.: prazo de entrega, motivo, instruções…' });
    // Validação: valor, desconto e se aceita parcelamento (máx. 3 prestações; nunca abaixo de 1.000 Kz)
    const total = LL.campo('pd-total', 'Valor dos serviços (Kz)', Number(p.total) + Number(p.desconto || 0), { tipo: 'number', min: '0', step: '500', col: 'col-sm-4', ajuda: p.tem_consulta ? 'Tem serviços sob consulta: indique o valor.' : null });
    const desconto = LL.campo('pd-desc', 'Desconto (Kz)', p.desconto || 0, { tipo: 'number', min: '0', step: '500', col: 'col-sm-4' });
    const parcSel = LL.campo('pd-parc', 'Parcelamento', String(p.parcelas || 1), { col: 'col-sm-4', opcoes: [['1', 'Não aceitar · pagar de uma vez'], ['2', 'Aceitar em 2 prestações'], ['3', 'Aceitar em 3 prestações']], ajuda: 'O cliente pediu: ' + ((p.parcelas || 1) > 1 ? p.parcelas + ' prestações' : 'de uma vez') });
    const resumoFinal = h('div', { class: 'col-12 fw-semibold' });
    const calcular = () => {
      const bruto = Math.max(0, Number(total.campo.value) || 0), d = Math.min(bruto, Math.max(0, Number(desconto.campo.value) || 0)), fim = bruto - d;
      let n = Number(parcSel.campo.value) || 1; if (fim < 1000) n = 1;
      parcSel.campo.disabled = fim < 1000;
      resumoFinal.textContent = 'Cliente paga: ' + LL.kz(fim) + (d ? ' (desconto ' + LL.kz(d) + ')' : '') + (n > 1 ? ' em ' + n + ' prestações de ' + LL.kz(Math.ceil(fim / n)) : ' de uma vez') + (fim < 1000 ? ' · abaixo de 1.000 Kz não há parcelamento' : '');
      return { fim, d, n };
    };
    [total, desconto, parcSel].forEach(c => c.campo.addEventListener('input', calcular)); parcSel.campo.addEventListener('change', calcular); calcular();
    const mudarEstado = async (estado, extra = {}) => {
      msg.className = 'small'; msg.textContent = 'A guardar…';
      const { error } = await sb.from('pedidos').update(Object.assign({ estado, nota_admin: nota.campo.value.trim() }, extra)).eq('id', p.id);
      if (error) { msg.className = 'small text-danger'; msg.textContent = LL.erro(error); return; }
      LL.aviso('Pedido ' + p.codigo + ': ' + LL.ESTADOS[estado].t); mPedido.fechar();
    };
    const botao = (t, cls, fn) => h('button', { class: 'btn ' + cls, type: 'button', onclick: fn, text: t });
    const nP = p.parcelas || 1, pagas = p.parcelas_pagas || 0;
    const confirmarPag = () => (nP > 1 && pagas + 1 < nP)
      ? botao('Confirmar prestação ' + (pagas + 1) + '/' + nP, 'btn-primary', () => mudarEstado('validado', { parcelas_pagas: pagas + 1 }))
      : botao(nP > 1 ? 'Confirmar última prestação' : 'Confirmar pagamento', 'btn-primary', () => mudarEstado('pago', { parcelas_pagas: nP }));
    const cancelar = LL.confirmarBotao(h('button', { class: 'btn btn-outline-danger', type: 'button', text: 'Cancelar pedido' }), 'Confirmar cancelamento', () => mudarEstado('cancelado'));

    // Entregas
    const listaEnt = h('div', { class: 'd-grid gap-2' });
    const desenharEntregas = lista => listaEnt.replaceChildren(...(lista.length ? lista.map(en => h('div', { class: 'd-flex align-items-center gap-2 p-2 border rounded-3' },
      LL.icone('descarregar'), h('span', { class: 'flex-grow-1 text-truncate', text: en.nome }), h('span', { class: 'small mono', text: LL.tamanho(en.tamanho) }),
      h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', onclick: () => LL.abrirPrivado('entregas', en.path, true), text: 'Abrir' }),
      LL.confirmarBotao(h('button', { class: 'btn btn-sm btn-outline-danger', type: 'button', text: 'Apagar' }), 'Confirmar', async () => {
        await sb.storage.from('entregas').remove([en.path]); await sb.from('entregas').delete().eq('id', en.id);
        lista = lista.filter(x => x.id !== en.id); desenharEntregas(lista);
      }))) : [h('div', { class: 'small text-body-secondary', text: 'Ainda não enviou ficheiros para este pedido.' })]));
    let entregas = ent.data || []; desenharEntregas(entregas);
    const ficheiros = h('input', { type: 'file', class: 'form-control', id: 'pd-ficheiros', multiple: true });
    ficheiros.addEventListener('change', async () => {
      const fs = [...ficheiros.files]; ficheiros.value = '';
      for (const f of fs) {
        if (f.size > 50 * 1048576) { LL.aviso(f.name + ' tem mais de 50 MB. Divida-o ou comprima-o.', 'erro'); continue; }
        msg.className = 'small'; msg.textContent = 'A enviar ' + f.name + '…';
        const path = p.id + '/' + Date.now() + '-' + LL.nomeSeguro(f.name);
        const up = await sb.storage.from('entregas').upload(path, f, { contentType: f.type || 'application/octet-stream' });
        if (up.error) { msg.className = 'small text-danger'; msg.textContent = LL.erro(up.error); continue; }
        const { data, error } = await sb.from('entregas').insert({ pedido_id: p.id, path, nome: f.name.slice(0, 160), tamanho: f.size }).select().single();
        if (error) { msg.className = 'small text-danger'; msg.textContent = LL.erro(error); continue; }
        entregas.push(data); desenharEntregas(entregas); msg.textContent = '';
      }
    });

    const emailCorpo = 'Olá ' + (c.nome || '').split(' ')[0] + ',\n\nO seu pedido ' + p.codigo + ' na ' + (loja.nome || 'LeloLabs') + ' foi atualizado: ' + (LL.ESTADOS[p.estado] || {}).t + '.\nEntre na sua conta para ver os detalhes: ' + location.origin + location.pathname.replace(/painel\.html$/, '') + '\n\nCumprimentos,\n' + (loja.dono || '');
    const acoes = {
      pendente: [h('div', { class: 'row g-3' }, total, desconto, parcSel, resumoFinal), nota,
        h('div', { class: 'd-flex gap-2 flex-wrap' }, botao('Validar pedido', 'btn-primary', () => {
          const { fim, d, n } = calcular();
          if (!(Number(total.campo.value) >= 0)) { msg.className = 'small text-danger'; msg.textContent = 'Indique um valor válido.'; return; }
          mudarEstado('validado', { total: fim, desconto: d, parcelas: n });
        }), cancelar)],
      validado: [h('p', { class: 'small mb-0', text: 'À espera do pagamento do cliente. Se recebeu o pagamento por outra via, pode confirmá-lo já.' }), nota,
        h('div', { class: 'd-flex gap-2 flex-wrap' }, confirmarPag(), cancelar)],
      comprovativo: [nota, h('div', { class: 'd-flex gap-2 flex-wrap' }, confirmarPag(),
        botao('Recusar comprovativo', 'btn-outline-secondary', () => { if (!nota.campo.value.trim()) { msg.className = 'small text-danger'; msg.textContent = 'Escreva na nota o motivo da recusa.'; nota.campo.focus(); return; } mudarEstado('validado'); }), cancelar)],
      pago: [h('div', null, h('label', { class: 'form-label', for: 'pd-ficheiros', text: 'Enviar ficheiros do projeto (até 50 MB cada)' }), ficheiros, h('div', { class: 'form-text', text: 'O cliente só consegue descarregar depois de libertar o projeto.' })), listaEnt, nota,
        h('div', { class: 'd-flex gap-2 flex-wrap' }, LL.confirmarBotao(h('button', { class: 'btn btn-primary', type: 'button', text: 'Libertar projeto ao cliente' }), 'Confirmar: libertar agora', () => {
          if (!entregas.length) { msg.className = 'small text-warning-emphasis'; msg.textContent = 'Sem ficheiros: o cliente será avisado de que o projeto está concluído.'; }
          mudarEstado('concluido');
        }))],
      concluido: [h('div', { class: 'fw-semibold', text: 'Ficheiros entregues' }), listaEnt],
      cancelado: [h('p', { class: 'small text-body-secondary mb-0', text: 'Pedido cancelado.' + (p.nota_admin ? ' Motivo: ' + p.nota_admin : '') })]
    }[p.estado] || [];

    mPedido.corpo.replaceChildren(h('div', { class: 'd-grid gap-3' },
      h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, LL.selo(p.estado), h('span', { class: 'small text-body-secondary', text: 'Criado ' + LL.data(p.criado) + ' · atualizado ' + LL.data(p.atualizado) })),
      LL.linhaTempo(p.estado),
      h('div', { class: 'row g-3' },
        h('div', { class: 'col-md-6' }, h('div', { class: 'caixa-suave p-3 rounded-3 h-100 d-grid gap-1' },
          h('div', { class: 'rotulo mb-1', text: 'Cliente' }), h('div', { class: 'fw-semibold', text: c.nome || '—' }),
          h('div', { class: 'mono small', text: c.email }), h('div', { class: 'mono small', text: LL.tel(c.telefone) }),
          h('div', { class: 'd-flex gap-2 flex-wrap mt-2' },
            h('button', { class: 'btn btn-sm btn-outline-primary', type: 'button', onclick: () => { mPedido.fechar(); clienteChat = p.cliente_id; mudarAba('conversas'); } }, LL.icone('chat', 14), ' Conversar'),
            c.email ? h('a', { class: 'btn btn-sm btn-outline-secondary', href: 'mailto:' + c.email + '?subject=' + encodeURIComponent('Pedido ' + p.codigo + ' — ' + (loja.nome || 'LeloLabs')) + '&body=' + encodeURIComponent(emailCorpo) }, LL.icone('email', 14), ' Avisar por email') : null))),
        h('div', { class: 'col-md-6' }, h('div', { class: 'caixa-suave p-3 rounded-3 h-100' },
          h('div', { class: 'rotulo mb-2', text: 'Serviços' }),
          p.itens.map(i => h('div', { class: 'd-flex justify-content-between gap-2 small' }, h('span', { text: i.qtd + ' × ' + i.nome }), h('span', { class: 'mono', text: i.preco == null ? 'consulta' : LL.kz(i.preco * i.qtd) }))),
          h('div', { class: 'total-linha border-top mt-2 pt-2' }, h('span', { text: 'Total' }), h('span', { text: LL.kz(p.total) })),
          h('div', { class: 'small text-body-secondary mt-1', text: 'Pagamento: ' + (p.metodo_pagamento || 'a combinar') + (nP > 1 ? ' · ' + nP + ' prestações de ' + LL.kz(Math.ceil(p.total / nP)) + ' · pagas ' + pagas + '/' + nP : ' · de uma vez') })))),
      p.notas ? h('div', null, h('div', { class: 'rotulo mb-1', text: 'Pedido do cliente' }), h('div', { class: 'mensagem-pronta', text: p.notas })) : null,
      (comp.data || []).length ? h('div', { class: 'd-grid gap-2' }, h('div', { class: 'rotulo', text: 'Comprovativos recebidos' }), comp.data.map(m =>
        h('button', { class: 'btn btn-outline-primary text-start d-flex gap-2 align-items-center', type: 'button', onclick: () => LL.abrirPrivado('anexos', m.anexo_path) }, LL.icone('clipe'), h('span', { class: 'flex-grow-1 text-truncate', text: m.anexo_nome || 'Comprovativo' }), h('span', { class: 'small', text: LL.data(m.criado) })))) : null,
      h('hr', { class: 'my-1' }), ...acoes, msg));
  }

  // ================= Conversas =================
  let listaConversasEl = null;
  function abaConversas() {
    listaConversasEl = h('div', { class: 'list-group conversas-lista' });
    const painelChat = h('div', { class: 'card h-100' }, h('div', { class: 'card-body', id: 'zona-chat' }));
    principal.replaceChildren(h('div', { class: 'row g-3' },
      h('div', { class: 'col-md-4' }, h('div', { class: 'mb-2' }, LL.caixaPesquisa({ id: 'busca-conv', placeholder: 'Procurar cliente', aoMudar: v => { abaConversas.q = v; renderListaConversas(); } })), listaConversasEl),
      h('div', { class: 'col-md-8' }, painelChat)));
    renderListaConversas(); abrirConversa(clienteChat);
  }
  async function renderListaConversas() {
    if (!listaConversasEl) return;
    const { data } = await sb.from('mensagens').select('cliente_id,texto,criado,autor,tipo').order('criado', { ascending: false }).limit(1000);
    const ultima = {}; (data || []).forEach(m => { if (!ultima[m.cliente_id]) ultima[m.cliente_id] = m; });
    const termos = LL.termos(abaConversas.q || '');
    const ordem = clientes.filter(c => !termos.length || LL.corresponde([c.nome, c.email, c.telefone].join(' '), termos))
      .sort((a, b) => ((ultima[b.id] || {}).criado || b.criado).localeCompare((ultima[a.id] || {}).criado || a.criado));
    listaConversasEl.replaceChildren(...(ordem.length ? ordem.map(c => {
      const u = ultima[c.id], n = naoLidasPor[c.id] || 0;
      return h('button', { type: 'button', class: 'list-group-item list-group-item-action d-flex gap-2' + (clienteChat === c.id ? ' active' : ''), onclick: () => { clienteChat = c.id; renderListaConversas(); abrirConversa(c.id); } },
        h('span', { class: 'avatar', text: LL.iniciais(c.nome || c.email) }),
        h('span', { class: 'flex-grow-1', style: 'min-width:0' }, h('span', { class: 'd-block fw-semibold text-truncate' }, LL.destacar(c.nome || c.email, termos)),
          h('span', { class: 'd-block small text-truncate opacity-75', text: u ? (u.autor === 'admin' ? 'Eu: ' : '') + u.texto : 'Sem mensagens' })),
        n ? h('span', { class: 'badge rounded-pill text-bg-danger align-self-center', text: n }) : null);
    }) : [h('div', { class: 'small text-body-secondary p-3', text: 'Ainda não há clientes.' })]));
  }
  function abrirConversa(id) {
    const zona = document.getElementById('zona-chat'); if (!zona) return;
    if (chatAtivo) { chatAtivo.parar(); chatAtivo = null; }
    if (!id) { zona.replaceChildren(h('div', { class: 'vazio', text: 'Escolha um cliente para ver a conversa.' })); return; }
    const c = cliente(id);
    chatAtivo = LL.chat({ clienteId: id, souAdmin: true });
    zona.replaceChildren(h('div', { class: 'd-flex align-items-center gap-2 mb-2 flex-wrap' }, h('span', { class: 'avatar', text: LL.iniciais(c.nome || c.email) }),
      h('div', null, h('div', { class: 'fw-semibold', text: c.nome }), h('div', { class: 'small mono text-body-secondary', text: c.email + ' · ' + LL.tel(c.telefone) }))), chatAtivo.el);
    naoLidasPor[id] = 0; renderTopo();
  }

  // ================= Clientes =================
  function abaClientes() {
    const termos = LL.termos(abaClientes.q || ''), t0 = performance.now();
    const lista = clientes.filter(c => !termos.length || LL.corresponde([c.nome, c.email, c.telefone].join(' '), termos));
    const ms = performance.now() - t0;
    principal.replaceChildren(
      h('div', { class: 'mx-auto mb-3', style: 'max-width:680px' }, LL.caixaPesquisa({ id: 'busca-cli', placeholder: 'Pesquisar clientes por nome, email ou telefone', valor: abaClientes.q || '', grande: true, aoMudar: v => { abaClientes.q = v; abaClientes(); const el = document.getElementById('busca-cli'); el.focus(); el.setSelectionRange(v.length, v.length); } })),
      h('div', { class: 'resultados mx-auto' }, LL.contagem(lista.length, ms), lista.map(c => {
        const ps = pedidos.filter(p => p.cliente_id === c.id), gasto = ps.filter(p => p.estado === 'pago' || p.estado === 'concluido').reduce((s, p) => s + Number(p.total), 0);
        return h('article', { class: 'resultado' },
          h('div', { class: 'resultado-url mono' }, LL.destacar(c.email, termos), ' › ', LL.destacar(LL.tel(c.telefone), termos)),
          h('h3', null, h('button', { class: 'resultado-titulo', type: 'button', onclick: () => { clienteChat = c.id; mudarAba('conversas'); } }, LL.destacar(c.nome || 'Sem nome', termos))),
          h('p', { class: 'resultado-resumo', text: 'Cliente desde ' + new Date(c.criado).toLocaleDateString('pt-PT') + ' · ' + ps.length + ' pedido(s) · ' + LL.kz(gasto) + ' pagos' }));
      })));
  }

  // ================= Gestor de imagens (até 6) =================
  function gestorImagens(iniciais, pasta) {
    let itens = (iniciais || []).map(path => ({ path }));
    const removidas = [];
    const grelha = h('div', { class: 'gestor-imagens' });
    const entrada = h('input', { type: 'file', class: 'd-none', accept: 'image/jpeg,image/png,image/webp', multiple: true });
    const msg = h('div', { class: 'small', role: 'status' });
    entrada.addEventListener('change', () => {
      const novos = [...entrada.files]; entrada.value = '';
      const espaco = 6 - itens.length;
      if (novos.length > espaco) LL.aviso('Máximo de 6 imagens. Foram adicionadas ' + Math.max(0, espaco) + '.', 'erro');
      novos.slice(0, Math.max(0, espaco)).forEach(f => itens.push({ ficheiro: f, previa: URL.createObjectURL(f) }));
      desenhar();
    });
    function desenhar() {
      grelha.replaceChildren(...itens.map((it, i) => h('figure', { class: 'gi-item' },
        h('img', { src: it.previa || LL.urlPublica(it.path), alt: 'Imagem ' + (i + 1) }),
        i === 0 ? h('span', { class: 'gi-capa', text: 'Capa' }) : null,
        h('div', { class: 'gi-acoes' },
          h('button', { type: 'button', class: 'btn btn-sm btn-light', disabled: i === 0, 'aria-label': 'Mover para a esquerda', onclick: () => { [itens[i - 1], itens[i]] = [itens[i], itens[i - 1]]; desenhar(); } }, '←'),
          h('button', { type: 'button', class: 'btn btn-sm btn-light', disabled: i === itens.length - 1, 'aria-label': 'Mover para a direita', onclick: () => { [itens[i + 1], itens[i]] = [itens[i], itens[i + 1]]; desenhar(); } }, '→'),
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': 'Remover imagem', onclick: () => { if (it.path) removidas.push(it.path); itens.splice(i, 1); desenhar(); } }, '×')))),
        itens.length < 6 ? h('label', { class: 'gi-adicionar' }, h('span', { text: '+ Imagem' }), h('span', { class: 'small', text: itens.length + ' de 6' }), entrada) : null);
    }
    desenhar();
    return {
      el: h('div', null, h('div', { class: 'form-label', text: 'Imagens (até 6; a primeira é a capa)' }), grelha, msg),
      async guardar() {
        const paths = [];
        for (const it of itens) {
          if (it.path) { paths.push(it.path); continue; }
          msg.textContent = 'A enviar imagens… ' + (paths.length + 1) + '/' + itens.length;
          const blob = await LL.comprimir(it.ficheiro);
          const path = pasta + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
          const { error } = await sb.storage.from('publico').upload(path, blob, { contentType: 'image/jpeg' });
          if (error) throw error;
          it.path = path; paths.push(path);
        }
        msg.textContent = '';
        return paths;
      },
      async limpar() { if (removidas.length) await sb.storage.from('publico').remove(removidas); }
    };
  }

  // ================= Serviços =================
  function abaCatalogo() {
    principal.replaceChildren(
      h('div', { class: 'd-flex justify-content-between align-items-center flex-wrap gap-2 mb-3' }, h('h2', { class: 'h4 mb-0', text: 'Serviços (' + produtos.length + ')' }),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => editarProduto(null), text: 'Novo serviço' })),
      produtos.length ? h('div', { class: 'row g-3' }, produtos.map(p => h('div', { class: 'col-sm-6 col-lg-4' }, h('div', { class: 'card h-100' + (p.ativo ? '' : ' opacity-75') }, LL.galeria(p.imagens, p.nome),
        h('div', { class: 'card-body d-grid gap-2' },
          h('div', { class: 'd-flex gap-2 align-items-center' }, h('strong', { class: 'text-truncate', text: p.nome }), h('span', { class: 'badge ms-auto ' + (p.ativo ? 'text-bg-success' : 'text-bg-secondary'), text: p.ativo ? 'Visível' : 'Escondido' })),
          h('div', { class: 'small text-body-secondary', text: p.categoria + ' · ' + LL.kz(p.preco) + ' · ' + (p.imagens || []).length + '/6 imagens' }),
          h('button', { class: 'btn btn-outline-primary btn-sm', type: 'button', onclick: () => editarProduto(p), text: 'Editar' }))))))
        : h('div', { class: 'vazio', text: 'Ainda não há serviços.' }));
  }
  function editarProduto(p) {
    const novo = !p; p = p || { nome: '', categoria: 'Geral', preco: null, unidade: 'pagamento único', descricao: '', itens: [], imagens: [], destaque: false, ativo: true, ordem: produtos.length + 1 };
    const id = p.id || crypto.randomUUID();
    const f = {
      nome: LL.campo('ed-nome', 'Nome', p.nome, { max: '80', col: 'col-md-8' }),
      categoria: LL.campo('ed-cat', 'Categoria', p.categoria, { max: '40', col: 'col-md-4' }),
      preco: LL.campo('ed-preco', 'Preço (Kz)', p.preco, { tipo: 'number', min: '0', step: '500', col: 'col-md-4', ajuda: 'Vazio = Sob consulta' }),
      unidade: LL.campo('ed-uni', 'Nota do preço', p.unidade, { max: '40', col: 'col-md-4', ph: 'Ex.: por mês' }),
      ordem: LL.campo('ed-ordem', 'Ordem', p.ordem, { tipo: 'number', col: 'col-md-4' }),
      descricao: LL.campo('ed-desc', 'Descrição', p.descricao, { area: true, max: '600' }),
      itens: LL.campo('ed-itens', 'O que inclui (um por linha, até 12)', (p.itens || []).join('\n'), { area: true, rows: '4', max: '1200' })
    };
    const chk = (idc, rot, v) => { const x = h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: idc }); x.checked = v; return { x, el: h('div', { class: 'form-check form-switch' }, x, h('label', { class: 'form-check-label', for: idc, text: rot })) }; };
    const ativo = chk('ed-ativo', 'Visível na loja', p.ativo), dest = chk('ed-dest', 'Destacar como "Mais procurado"', p.destaque);
    const imgs = gestorImagens(p.imagens, 'produtos/' + id);
    const erro = h('div', { class: 'small text-danger', role: 'alert' });
    const guardar = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Guardar' });
    mEditor.titulo(novo ? 'Novo serviço' : 'Editar serviço');
    mEditor.corpo.replaceChildren(h('form', { class: 'row g-3', onsubmit: async e => {
      e.preventDefault(); erro.textContent = '';
      if (!f.nome.campo.value.trim()) { erro.textContent = 'Escreva o nome do serviço.'; return; }
      guardar.disabled = true;
      try {
        const imagens = await imgs.guardar();
        const preco = f.preco.campo.value === '' ? null : Math.max(0, Number(f.preco.campo.value));
        const dados = { id, nome: f.nome.campo.value.trim(), categoria: f.categoria.campo.value.trim() || 'Geral', preco, unidade: f.unidade.campo.value.trim(), descricao: f.descricao.campo.value.trim(),
          itens: f.itens.campo.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12), imagens, ativo: ativo.x.checked, destaque: dest.x.checked, ordem: parseInt(f.ordem.campo.value, 10) || 0 };
        const { data, error } = await sb.from('produtos').upsert(dados).select().single(); if (error) throw error;
        await imgs.limpar();
        produtos = novo ? produtos.concat(data) : produtos.map(x => x.id === id ? data : x);
        produtos.sort((a, b) => a.ordem - b.ordem);
        mEditor.fechar(); LL.aviso('Serviço guardado'); abaCatalogo();
      } catch (er) { erro.textContent = LL.erro(er); }
      guardar.disabled = false;
    } }, f.nome, f.categoria, f.preco, f.unidade, f.ordem, f.descricao, f.itens, h('div', { class: 'col-12' }, imgs.el),
      h('div', { class: 'col-12 d-flex gap-4 flex-wrap' }, ativo.el, dest.el), h('div', { class: 'col-12' }, erro),
      h('div', { class: 'col-12 d-flex gap-2' }, guardar, novo ? null : LL.confirmarBotao(h('button', { class: 'btn btn-outline-danger ms-auto', type: 'button', text: 'Apagar serviço' }), 'Confirmar: apagar', async () => {
        const { error } = await sb.from('produtos').delete().eq('id', id); if (error) { erro.textContent = LL.erro(error); return; }
        if ((p.imagens || []).length) await sb.storage.from('publico').remove(p.imagens);
        produtos = produtos.filter(x => x.id !== id); mEditor.fechar(); LL.aviso('Serviço apagado'); abaCatalogo();
      }))));
    mEditor.abrir();
  }

  // ================= Trabalhos =================
  function abaTrabalhos() {
    principal.replaceChildren(
      h('div', { class: 'd-flex justify-content-between align-items-center flex-wrap gap-2 mb-3' }, h('h2', { class: 'h4 mb-0', text: 'Trabalhos (' + trabalhos.length + ')' }),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => editarTrabalho(null), text: 'Novo trabalho' })),
      trabalhos.length ? h('div', { class: 'row g-3' }, trabalhos.map(t => h('div', { class: 'col-sm-6 col-lg-4' }, h('div', { class: 'card h-100' }, LL.galeria(t.imagens, t.titulo),
        h('div', { class: 'card-body d-grid gap-2' }, h('strong', { text: t.titulo }), h('div', { class: 'small text-body-secondary', text: (t.categoria || 'Sem categoria') + ' · ' + (t.imagens || []).length + '/6 imagens' }),
          h('button', { class: 'btn btn-outline-primary btn-sm', type: 'button', onclick: () => editarTrabalho(t), text: 'Editar' }))))))
        : h('div', { class: 'vazio', text: 'Ainda não há trabalhos. Adicione o primeiro com até 6 imagens.' }));
  }
  function editarTrabalho(t) {
    const novo = !t; t = t || { titulo: '', categoria: '', descricao: '', imagens: [], video_url: '', link: '', ordem: 0 };
    const id = t.id || crypto.randomUUID();
    const f = {
      titulo: LL.campo('tr-tit', 'Título', t.titulo, { max: '90', col: 'col-md-8' }),
      categoria: LL.campo('tr-cat', 'Categoria', t.categoria, { max: '60', col: 'col-md-4' }),
      descricao: LL.campo('tr-desc', 'Descrição', t.descricao, { area: true, max: '600' }),
      video: LL.campo('tr-video', 'Ligação de vídeo (YouTube, opcional)', t.video_url, { tipo: 'url', max: '500', col: 'col-md-6', ph: 'https://' }),
      link: LL.campo('tr-link', 'Ligação do projeto (opcional)', t.link, { tipo: 'url', max: '500', col: 'col-md-6', ph: 'https://' }),
      ordem: LL.campo('tr-ordem', 'Ordem', t.ordem, { tipo: 'number', col: 'col-md-4' })
    };
    const imgs = gestorImagens(t.imagens, 'trabalhos/' + id);
    const erro = h('div', { class: 'small text-danger', role: 'alert' });
    const guardar = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Guardar' });
    mEditor.titulo(novo ? 'Novo trabalho' : 'Editar trabalho');
    mEditor.corpo.replaceChildren(h('form', { class: 'row g-3', onsubmit: async e => {
      e.preventDefault(); erro.textContent = '';
      if (!f.titulo.campo.value.trim()) { erro.textContent = 'Escreva o título.'; return; }
      const video = f.video.campo.value.trim(), link = f.link.campo.value.trim();
      if ((video && !LL.url(video)) || (link && !LL.url(link))) { erro.textContent = 'As ligações têm de começar por https://'; return; }
      guardar.disabled = true;
      try {
        const imagens = await imgs.guardar();
        const dados = { id, titulo: f.titulo.campo.value.trim(), categoria: f.categoria.campo.value.trim(), descricao: f.descricao.campo.value.trim(), imagens, video_url: video, link, ordem: parseInt(f.ordem.campo.value, 10) || 0 };
        const { data, error } = await sb.from('trabalhos').upsert(dados).select().single(); if (error) throw error;
        await imgs.limpar();
        trabalhos = novo ? [data].concat(trabalhos) : trabalhos.map(x => x.id === id ? data : x);
        mEditor.fechar(); LL.aviso('Trabalho guardado'); abaTrabalhos();
      } catch (er) { erro.textContent = LL.erro(er); }
      guardar.disabled = false;
    } }, f.titulo, f.categoria, f.descricao, f.video, f.link, f.ordem, h('div', { class: 'col-12' }, imgs.el), h('div', { class: 'col-12' }, erro),
      h('div', { class: 'col-12 d-flex gap-2' }, guardar, novo ? null : LL.confirmarBotao(h('button', { class: 'btn btn-outline-danger ms-auto', type: 'button', text: 'Apagar trabalho' }), 'Confirmar: apagar', async () => {
        const { error } = await sb.from('trabalhos').delete().eq('id', id); if (error) { erro.textContent = LL.erro(error); return; }
        if ((t.imagens || []).length) await sb.storage.from('publico').remove(t.imagens);
        trabalhos = trabalhos.filter(x => x.id !== id); mEditor.fechar(); LL.aviso('Trabalho apagado'); abaTrabalhos();
      }))));
    mEditor.abrir();
  }

  // ================= Avaliações e gostos =================
  async function abaAvaliacoes() {
    principal.replaceChildren(h('div', { class: 'text-body-secondary', text: 'A carregar avaliações…' }));
    const [av, gt] = await Promise.all([sb.from('avaliacoes').select('*').order('criado', { ascending: false }).limit(500), sb.rpc('contar_gostos')]);
    if (av.error) { principal.replaceChildren(h('p', { class: 'text-danger', text: LL.erro(av.error) })); return; }
    const lista = av.data, n = lista.length;
    const media = n ? lista.reduce((s, a) => s + a.estrelas, 0) / n : 0, recom = n ? Math.round(lista.filter(a => a.recomenda).length / n * 100) : 0;
    const gostos = {}; (gt.data || []).forEach(g => { gostos[g.trabalho_id] = Number(g.total); });
    const kpi = (r, v, s) => h('div', { class: 'col-6 col-lg-3' }, h('div', { class: 'kpi' }, h('div', { class: 'rotulo', text: r }), h('div', { class: 'v', text: v }), h('div', { class: 'small text-body-secondary mt-1', text: s })));
    const totalGostos = Object.values(gostos).reduce((s, x) => s + x, 0);
    const maisGostados = trabalhos.slice().sort((a, b) => (gostos[b.id] || 0) - (gostos[a.id] || 0)).slice(0, 5);
    principal.replaceChildren(
      h('div', { class: 'row g-3 mb-4' }, kpi('Média', n ? media.toFixed(1).replace('.', ',') + ' ★' : '—', n + ' avaliações'), kpi('Recomendam', n ? recom + '%' : '—', lista.filter(a => a.recomenda).length + ' clientes'),
        kpi('Por responder', String(lista.filter(a => !a.resposta).length), 'Avaliações sem resposta'), kpi('Gostos', String(totalGostos), 'Em ' + trabalhos.length + ' trabalhos')),
      h('div', { class: 'row g-4' },
        h('div', { class: 'col-lg-8 d-grid gap-3' }, n ? lista.map(a => {
          const c = cliente(a.cliente_id);
          const resp = h('textarea', { class: 'form-control', rows: '2', maxlength: '1000', id: 'resp-' + a.id, placeholder: 'Responder publicamente…' }); resp.value = a.resposta;
          const msg = h('span', { class: 'small', role: 'status' });
          const guardar = async dados => { const { error } = await sb.from('avaliacoes').update(dados).eq('id', a.id); if (error) { msg.className = 'small text-danger'; msg.textContent = LL.erro(error); return false; } Object.assign(a, dados); return true; };
          return h('article', { class: 'card' + (a.visivel ? '' : ' opacity-75') }, h('div', { class: 'card-body d-grid gap-2' },
            h('div', { class: 'd-flex gap-2 align-items-center flex-wrap' }, h('strong', { text: a.nome_publico }), h('span', { class: 'estrelas', text: '★★★★★'.slice(0, a.estrelas) + '☆☆☆☆☆'.slice(0, 5 - a.estrelas) }),
              h('span', { class: 'badge ' + (a.recomenda ? 'text-bg-success' : 'text-bg-secondary'), text: a.recomenda ? 'Recomenda' : 'Não recomenda' }), a.visivel ? null : h('span', { class: 'badge text-bg-warning', text: 'Escondida' }),
              h('span', { class: 'small text-body-secondary ms-auto', text: LL.data(a.criado) })),
            h('div', { class: 'small text-body-secondary', text: (c.email || '') + ' · ' + a.servicos }),
            a.comentario ? h('p', { class: 'mb-0', text: a.comentario }) : h('p', { class: 'mb-0 text-body-secondary fst-italic', text: 'Sem comentário.' }),
            h('label', { class: 'visually-hidden', for: resp.id, text: 'Resposta' }), resp,
            h('div', { class: 'd-flex gap-2 flex-wrap align-items-center' },
              h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: async () => { if (await guardar({ resposta: resp.value.trim() })) { msg.className = 'small text-success'; msg.textContent = 'Resposta publicada.'; } }, text: 'Guardar resposta' }),
              h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', onclick: async () => { if (await guardar({ visivel: !a.visivel })) abaAvaliacoes(); }, text: a.visivel ? 'Esconder da loja' : 'Mostrar na loja' }),
              LL.confirmarBotao(h('button', { class: 'btn btn-sm btn-outline-danger', type: 'button', text: 'Apagar' }), 'Confirmar', async () => { const { error } = await sb.from('avaliacoes').delete().eq('id', a.id); if (error) { msg.textContent = LL.erro(error); return; } abaAvaliacoes(); }),
              msg)));
        }) : [h('div', { class: 'vazio', text: 'Ainda não há avaliações. Os clientes podem avaliar depois de libertar o projeto.' })]),
        h('div', { class: 'col-lg-4' }, h('div', { class: 'card' }, h('div', { class: 'card-body' }, h('h2', { class: 'h6', text: 'Trabalhos com mais gostos' }),
          maisGostados.length ? maisGostados.map(t => h('div', { class: 'd-flex justify-content-between gap-2 py-1 border-bottom small' }, h('span', { class: 'text-truncate', text: t.titulo }), h('span', { class: 'mono', text: '♥ ' + (gostos[t.id] || 0) }))) : h('p', { class: 'small text-body-secondary mb-0', text: 'Sem trabalhos publicados.' }))))));
  }

  // ================= Loja e métodos de pagamento =================
  function abaLoja() {
    const d = JSON.parse(JSON.stringify(loja));
    d.pagamentos = d.pagamentos || [];
    const campos = [['nome', 'Nome da loja', 'col-md-4', 40], ['dono', 'O seu nome', 'col-md-4', 80], ['local', 'Localização', 'col-md-4', 60], ['slogan', 'Frase principal', 'col-12', 90],
      ['sobre', 'Sobre mim', 'col-12', 600, true], ['stack', 'Tecnologias', 'col-md-6', 90], ['email', 'Email público', 'col-md-6', 120], ['telefone', 'Telefone público', 'col-md-6', 20], ['horario', 'Horário de atendimento', 'col-md-6', 60]]
      .map(([k, r, col, max, area]) => { const c = LL.campo('lj-' + k, r, d[k], { col, max: String(max), area }); c.campo.addEventListener('input', () => { d[k] = c.campo.value; }); return c; });
    const listaPag = h('div', { class: 'd-grid gap-3' });
    const desenharPag = () => listaPag.replaceChildren(...d.pagamentos.map((m, i) => {
      const sw = h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: 'pg-at-' + i }); sw.checked = !!m.ativo; sw.addEventListener('change', () => { m.ativo = sw.checked; });
      const nome = LL.campo('pg-n-' + i, 'Nome do método', m.nome, { max: '80', col: 'col-md-5' }); nome.campo.addEventListener('input', () => { m.nome = nome.campo.value; });
      const det = LL.campo('pg-d-' + i, 'Dados que o cliente vê (IBAN, número, instruções)', m.detalhes, { area: true, rows: '3', max: '600', col: 'col-md-7' }); det.campo.addEventListener('input', () => { m.detalhes = det.campo.value; });
      return h('div', { class: 'p-3 border rounded-3' }, h('div', { class: 'row g-2' }, nome, det),
        h('div', { class: 'd-flex align-items-center gap-3 mt-2' }, h('div', { class: 'form-check form-switch mb-0' }, sw, h('label', { class: 'form-check-label', for: 'pg-at-' + i, text: 'Disponível para os clientes' })),
          LL.confirmarBotao(h('button', { class: 'btn btn-sm btn-outline-danger ms-auto', type: 'button', text: 'Remover' }), 'Confirmar', () => { d.pagamentos.splice(i, 1); desenharPag(); })));
    }));
    desenharPag();
    const msg = h('div', { class: 'small', role: 'status' });
    principal.replaceChildren(h('form', { class: 'd-grid gap-4', onsubmit: async e => {
      e.preventDefault();
      d.pagamentos = d.pagamentos.filter(m => (m.nome || '').trim()).map(m => ({ id: m.id || crypto.randomUUID(), nome: m.nome.trim().slice(0, 80), detalhes: (m.detalhes || '').slice(0, 600), ativo: !!m.ativo }));
      const nomes = d.pagamentos.map(m => m.nome); if (new Set(nomes).size !== nomes.length) { msg.className = 'small text-danger'; msg.textContent = 'Há dois métodos de pagamento com o mesmo nome.'; return; }
      const { error } = await sb.from('loja').update({ dados: d, atualizado: new Date().toISOString() }).eq('id', 1);
      if (error) { msg.className = 'small text-danger'; msg.textContent = LL.erro(error); return; }
      loja = d; msg.className = 'small text-success'; msg.textContent = 'Guardado. A loja já mostra as alterações.'; LL.aviso('Loja atualizada');
    } },
      h('div', { class: 'card' }, h('div', { class: 'card-body' }, h('h2', { class: 'h5', text: 'Informação da loja' }), h('div', { class: 'row g-3' }, campos))),
      h('div', { class: 'card' }, h('div', { class: 'card-body d-grid gap-3' }, h('div', null, h('h2', { class: 'h5 mb-1', text: 'Métodos de pagamento' }), h('p', { class: 'small text-body-secondary mb-0', text: 'O cliente escolhe um destes ao fazer o pedido e vê os dados para pagar depois da validação.' })),
        listaPag, h('div', null, h('button', { class: 'btn btn-outline-primary', type: 'button', onclick: () => { d.pagamentos.push({ id: crypto.randomUUID(), nome: '', detalhes: '', ativo: true }); desenharPag(); }, text: 'Adicionar método' })))),
      h('div', { class: 'd-flex align-items-center gap-3 flex-wrap' }, h('button', { class: 'btn btn-primary btn-lg', type: 'submit', text: 'Guardar alterações' }), msg)));
  }
})();
