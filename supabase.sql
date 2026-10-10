-- =====================================================================
-- LeloLabs — base de dados (Supabase / PostgreSQL)
-- Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode correr mais de uma vez sem estragar dados existentes.
-- =====================================================================

-- ---------- Administradores ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admins: ver a própria linha" on public.admins;
create policy "admins: ver a própria linha" on public.admins for select using (user_id = auth.uid());

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.e_admin() to anon, authenticated;

-- ---------- Perfis dos clientes ----------
create table if not exists public.perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text not null default '' check (char_length(nome) <= 80),
  email text not null default '',
  telefone text not null default '' check (char_length(telefone) <= 20),
  criado timestamptz not null default now()
);
alter table public.perfis enable row level security;
drop policy if exists "perfis: ver o próprio ou admin" on public.perfis;
create policy "perfis: ver o próprio ou admin" on public.perfis for select using (id = auth.uid() or public.e_admin());
drop policy if exists "perfis: editar o próprio" on public.perfis;
create policy "perfis: editar o próprio" on public.perfis for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.perfis from anon, authenticated;
grant update (nome, telefone) on public.perfis to authenticated;   -- o email não pode ser alterado pelo cliente

create or replace function public.novo_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email, telefone)
  values (new.id,
          left(coalesce(new.raw_user_meta_data->>'nome', ''), 80),
          coalesce(new.email, ''),
          left(coalesce(new.raw_user_meta_data->>'telefone', ''), 20))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_utilizador on auth.users;
create trigger ao_criar_utilizador after insert on auth.users for each row execute function public.novo_perfil();

-- ---------- Configuração da loja (textos, contactos, métodos de pagamento) ----------
create table if not exists public.loja (
  id int primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  atualizado timestamptz not null default now()
);
alter table public.loja enable row level security;
drop policy if exists "loja: leitura pública" on public.loja;
create policy "loja: leitura pública" on public.loja for select using (true);
drop policy if exists "loja: admin edita" on public.loja;
create policy "loja: admin edita" on public.loja for all using (public.e_admin()) with check (public.e_admin());

insert into public.loja (id, dados) values (1, $json${
  "nome": "LeloLabs",
  "dono": "Francisco Felix Lelo",
  "slogan": "Software à medida para o seu negócio crescer.",
  "sobre": "Sou o Francisco Felix Lelo, programador em Luanda. Crio sites, lojas virtuais, sistemas de gestão e soluções com câmaras inteligentes para empresas angolanas.",
  "stack": "Python · PySide6 · OpenCV · Web",
  "local": "Ingombotas, Luanda, Angola",
  "email": "franciscofelixlelo16@gmail.com",
  "telefone": "952633132",
  "horario": "Segunda a sábado, 8h às 20h",
  "pagamentos": [
    {"id": "m1", "nome": "Multicaixa Express", "detalhes": "Envie para o número: (defina no painel)", "ativo": false},
    {"id": "m2", "nome": "Transferência bancária", "detalhes": "Banco: (defina no painel)\nIBAN: (defina no painel)\nTitular: Francisco Felix Lelo", "ativo": false},
    {"id": "m3", "nome": "Pagamento em mão", "detalhes": "Combine o local e a hora pelo chat do site.", "ativo": true}
  ]
}$json$::jsonb)
on conflict (id) do nothing;

-- ---------- Serviços (catálogo) ----------
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 80),
  categoria text not null default 'Geral' check (char_length(categoria) <= 40),
  preco numeric(14,2) check (preco is null or preco >= 0),
  unidade text not null default '' check (char_length(unidade) <= 40),
  descricao text not null default '' check (char_length(descricao) <= 600),
  itens text[] not null default '{}' check (cardinality(itens) <= 12),
  imagens text[] not null default '{}' check (cardinality(imagens) <= 6),
  destaque boolean not null default false,
  ativo boolean not null default true,
  ordem int not null default 0,
  criado timestamptz not null default now()
);
alter table public.produtos enable row level security;
drop policy if exists "produtos: ver ativos" on public.produtos;
create policy "produtos: ver ativos" on public.produtos for select using (ativo or public.e_admin());
drop policy if exists "produtos: admin edita" on public.produtos;
create policy "produtos: admin edita" on public.produtos for all using (public.e_admin()) with check (public.e_admin());

insert into public.produtos (nome, categoria, preco, unidade, descricao, itens, ativo, ordem)
select * from (values
  ('Publicidade de produtos', 'Publicidade', 15000::numeric, 'Pagamento parcelar', 'Divulgação profissional dos seus produtos.', '{}'::text[], true, 1),
  ('Site de apresentação', 'Sites', 75000::numeric, 'pagamento único', 'Um site profissional para mostrar o seu negócio.', array['Até 5 secções','Adaptado a telemóvel','Entrega em 7 dias'], false, 2),
  ('Loja virtual', 'Sites', 180000::numeric, 'pagamento único', 'Loja com carrinho, contas de clientes e chat.', array['Catálogo com fotos','Contas de clientes','Painel de administração'], false, 3),
  ('Sistema de gestão e vendas', 'Sistemas', 250000::numeric, 'a partir de', 'Ponto de venda: vendas, stock, clientes e relatórios em Kz.', array['Vendas e faturação','Controlo de stock','Formação da equipa'], false, 4),
  ('Câmaras com reconhecimento facial', 'Visão computacional', null, 'projeto personalizado', 'Controlo de acessos e presenças com câmaras IP.', array['Estudo do local','Instalação','Suporte técnico'], false, 5)
) as v(nome, categoria, preco, unidade, descricao, itens, ativo, ordem)
where not exists (select 1 from public.produtos);

-- ---------- Trabalhos (portfólio) ----------
create table if not exists public.trabalhos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(titulo) between 1 and 90),
  categoria text not null default '' check (char_length(categoria) <= 60),
  descricao text not null default '' check (char_length(descricao) <= 600),
  imagens text[] not null default '{}' check (cardinality(imagens) <= 6),
  video_url text not null default '' check (video_url = '' or video_url like 'https://%'),
  link text not null default '' check (link = '' or link like 'https://%'),
  ordem int not null default 0,
  criado timestamptz not null default now()
);
alter table public.trabalhos enable row level security;
drop policy if exists "trabalhos: leitura pública" on public.trabalhos;
create policy "trabalhos: leitura pública" on public.trabalhos for select using (true);
drop policy if exists "trabalhos: admin edita" on public.trabalhos;
create policy "trabalhos: admin edita" on public.trabalhos for all using (public.e_admin()) with check (public.e_admin());

-- ---------- Pedidos ----------
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null default '',
  cliente_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  itens jsonb not null,
  total numeric(14,2) not null default 0,
  tem_consulta boolean not null default false,
  notas text not null default '' check (char_length(notas) <= 1000),
  metodo_pagamento text not null default '' check (char_length(metodo_pagamento) <= 80),
  estado text not null default 'pendente'
    check (estado in ('pendente','validado','comprovativo','pago','concluido','cancelado')),
  nota_admin text not null default '' check (char_length(nota_admin) <= 1000),
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now()
);
create index if not exists pedidos_cliente on public.pedidos (cliente_id);
alter table public.pedidos add column if not exists parcelas int not null default 1 check (parcelas between 1 and 6);
alter table public.pedidos add column if not exists parcelas_pagas int not null default 0 check (parcelas_pagas >= 0);
alter table public.pedidos enable row level security;
drop policy if exists "pedidos: ver os próprios ou admin" on public.pedidos;
create policy "pedidos: ver os próprios ou admin" on public.pedidos for select using (cliente_id = auth.uid() or public.e_admin());
drop policy if exists "pedidos: cliente cria" on public.pedidos;
create policy "pedidos: cliente cria" on public.pedidos for insert to authenticated with check (cliente_id = auth.uid());
drop policy if exists "pedidos: admin altera" on public.pedidos;
create policy "pedidos: admin altera" on public.pedidos for update using (public.e_admin()) with check (public.e_admin());
drop policy if exists "pedidos: admin apaga" on public.pedidos;
create policy "pedidos: admin apaga" on public.pedidos for delete using (public.e_admin());

-- O preço é SEMPRE recalculado no servidor: o cliente não consegue alterar valores.
create or replace function public.preparar_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  item jsonb; p record; q int;
  linhas jsonb := '[]'::jsonb; soma numeric := 0; consulta boolean := false;
begin
  new.cliente_id := auth.uid();
  new.estado := 'pendente';
  new.nota_admin := '';
  if new.itens is null or jsonb_typeof(new.itens) <> 'array'
     or jsonb_array_length(new.itens) = 0 or jsonb_array_length(new.itens) > 30 then
    raise exception 'O pedido não tem serviços válidos.';
  end if;
  for item in select * from jsonb_array_elements(new.itens) loop
    select * into p from public.produtos where id = (item->>'id')::uuid and ativo;
    if not found then raise exception 'Um dos serviços já não está disponível.'; end if;
    q := greatest(1, least(99, coalesce((item->>'qtd')::int, 1)));
    linhas := linhas || jsonb_build_object('id', p.id, 'nome', p.nome, 'preco', p.preco, 'qtd', q);
    if p.preco is null then consulta := true; else soma := soma + p.preco * q; end if;
  end loop;
  new.itens := linhas;
  new.total := soma;
  new.tem_consulta := consulta;
  -- Abaixo de 1.000 Kz não há parcelamento; acima, até 6 prestações.
  new.parcelas := case when soma >= 1000 then greatest(1, least(6, coalesce(new.parcelas, 1))) else 1 end;
  new.parcelas_pagas := 0;
  new.codigo := 'LL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  new.criado := now();
  new.atualizado := now();
  return new;
end $$;
drop trigger if exists antes_de_criar_pedido on public.pedidos;
create trigger antes_de_criar_pedido before insert on public.pedidos for each row execute function public.preparar_pedido();

create or replace function public.marcar_atualizado() returns trigger language plpgsql as $$
begin
  new.atualizado := now();
  if new.total < 1000 then new.parcelas := 1; end if;
  new.parcelas := greatest(1, least(6, new.parcelas));
  new.parcelas_pagas := greatest(0, least(new.parcelas, new.parcelas_pagas));
  return new;
end $$;
drop trigger if exists antes_de_alterar_pedido on public.pedidos;
create trigger antes_de_alterar_pedido before update on public.pedidos for each row execute function public.marcar_atualizado();

-- ---------- Mensagens (chat do site) ----------
create table if not exists public.mensagens (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.perfis(id) on delete cascade,
  autor text not null check (autor in ('cliente','admin')),
  texto text not null default '' check (char_length(texto) <= 2000),
  tipo text not null default 'texto' check (tipo in ('texto','comprovativo','sistema')),
  pedido_id uuid references public.pedidos(id) on delete set null,
  anexo_path text,
  anexo_nome text check (anexo_nome is null or char_length(anexo_nome) <= 120),
  anexo_tipo text,
  lida boolean not null default false,
  criado timestamptz not null default now()
);
create index if not exists mensagens_cliente on public.mensagens (cliente_id, criado);
alter table public.mensagens add column if not exists unica boolean not null default false;   -- visualização única
alter table public.mensagens add column if not exists vista_em timestamptz;
alter table public.mensagens enable row level security;
drop policy if exists "mensagens: ver as próprias ou admin" on public.mensagens;
create policy "mensagens: ver as próprias ou admin" on public.mensagens for select using (cliente_id = auth.uid() or public.e_admin());
drop policy if exists "mensagens: cliente envia" on public.mensagens;
create policy "mensagens: cliente envia" on public.mensagens for insert to authenticated with check (
  cliente_id = auth.uid() and autor = 'cliente' and tipo in ('texto','comprovativo')
  and (pedido_id is null or exists (select 1 from public.pedidos p where p.id = pedido_id and p.cliente_id = auth.uid()))
  and (anexo_path is null or anexo_path like auth.uid()::text || '/%'));
drop policy if exists "mensagens: admin envia" on public.mensagens;
create policy "mensagens: admin envia" on public.mensagens for insert to authenticated with check (public.e_admin() and autor = 'admin');
drop policy if exists "mensagens: marcar como lida" on public.mensagens;
create policy "mensagens: marcar como lida" on public.mensagens for update using (cliente_id = auth.uid() or public.e_admin());
revoke update on public.mensagens from anon, authenticated;
grant update (lida) on public.mensagens to authenticated;            -- só o estado "lida" pode mudar

-- Comprovativo enviado → o pedido passa a "comprovativo" (a aguardar confirmação).
create or replace function public.ao_receber_comprovativo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'comprovativo' and new.pedido_id is not null then
    update public.pedidos set estado = 'comprovativo' where id = new.pedido_id and estado = 'validado';
  end if;
  return null;
end $$;
drop trigger if exists depois_de_mensagem on public.mensagens;
create trigger depois_de_mensagem after insert on public.mensagens for each row execute function public.ao_receber_comprovativo();

-- Avisos automáticos no chat quando o estado do pedido muda.
create or replace function public.avisar_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; v text;
begin
  v := replace(to_char(new.total, 'FM999,999,999,990'), ',', '.') || ' Kz';
  if tg_op = 'INSERT' then
    t := 'Recebi o seu pedido ' || new.codigo || '. Vou analisá-lo e responder em breve.';
  elsif new.parcelas_pagas > old.parcelas_pagas and new.estado = 'validado' then
    t := 'Prestação ' || new.parcelas_pagas || '/' || new.parcelas || ' do pedido ' || new.codigo || ' confirmada. Obrigado! '
      || 'Quando pagar a próxima, envie o comprovativo na página do pedido.';
  elsif new.estado is distinct from old.estado then
    if old.estado = 'comprovativo' and new.estado = 'validado' then
      t := 'O comprovativo do pedido ' || new.codigo || ' não foi aceite. '
        || case when new.nota_admin <> '' then 'Motivo: ' || new.nota_admin else 'Envie um novo comprovativo, por favor.' end;
    else
      t := case new.estado
        when 'validado' then 'O pedido ' || new.codigo || ' foi validado. Valor a pagar: ' || v
          || case when new.parcelas > 1 then ' em ' || new.parcelas || ' prestações de ' || replace(to_char(ceil(new.total / new.parcelas), 'FM999,999,999,990'), ',', '.') || ' Kz' else '' end
          || case when new.metodo_pagamento <> '' then ' por ' || new.metodo_pagamento else '' end
          || '. Depois de pagar, envie o comprovativo na página do pedido.'
          || case when new.nota_admin <> '' then ' Nota: ' || new.nota_admin else '' end
        when 'pago' then 'Pagamento do pedido ' || new.codigo || ' confirmado. Obrigado! O seu projeto está em produção.'
        when 'concluido' then 'O projeto do pedido ' || new.codigo || ' está concluído. Os ficheiros já estão disponíveis em A minha conta → Pedidos.'
        when 'cancelado' then 'O pedido ' || new.codigo || ' foi cancelado.'
          || case when new.nota_admin <> '' then ' Motivo: ' || new.nota_admin else '' end
        else null end;
    end if;
  end if;
  if t is not null then
    insert into public.mensagens (cliente_id, autor, texto, tipo, pedido_id)
    values (new.cliente_id, 'admin', t, 'sistema', new.id);
  end if;
  return null;
end $$;
drop trigger if exists depois_de_pedido on public.pedidos;
create trigger depois_de_pedido after insert or update on public.pedidos for each row execute function public.avisar_estado();

-- ---------- Entregas (ficheiros dos projetos concluídos) ----------
create table if not exists public.entregas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  path text not null,
  nome text not null check (char_length(nome) <= 160),
  tamanho bigint not null default 0,
  criado timestamptz not null default now()
);
alter table public.entregas enable row level security;
drop policy if exists "entregas: cliente vê só depois de libertado" on public.entregas;
create policy "entregas: cliente vê só depois de libertado" on public.entregas for select using (
  public.e_admin() or exists (select 1 from public.pedidos p
    where p.id = pedido_id and p.cliente_id = auth.uid() and p.estado = 'concluido'));
drop policy if exists "entregas: admin gere" on public.entregas;
create policy "entregas: admin gere" on public.entregas for all using (public.e_admin()) with check (public.e_admin());

-- ---------- Armazenamento de ficheiros ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('publico',  'publico',  true,  5242880,  array['image/jpeg','image/png','image/webp']),
  ('anexos',   'anexos',   false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('entregas', 'entregas', false, 52428800, null)
on conflict (id) do nothing;
update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm','video/quicktime']
  where id = 'anexos';

drop policy if exists "publico: admin envia" on storage.objects;
create policy "publico: admin envia" on storage.objects for insert to authenticated with check (bucket_id = 'publico' and public.e_admin());
drop policy if exists "publico: admin apaga" on storage.objects;
create policy "publico: admin apaga" on storage.objects for delete to authenticated using (bucket_id = 'publico' and public.e_admin());

-- anexos/<id do cliente>/... : cada cliente só vê e envia na sua pasta
drop policy if exists "anexos: ler" on storage.objects;
create policy "anexos: ler" on storage.objects for select to authenticated using (
  bucket_id = 'anexos' and (
    public.e_admin()
    or ((storage.foldername(name))[1] = auth.uid()::text and position('/unica/' in name) = 0)
    or exists (select 1 from public.mensagens m where m.anexo_path = name and m.unica and m.autor = 'admin'
               and m.cliente_id = auth.uid() and m.vista_em > now() - interval '2 minutes')));

-- Abrir uma mensagem de visualização única: só o destinatário, e só uma vez (janela de 2 minutos).
create or replace function public.abrir_unica(mid bigint) returns text
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.mensagens where id = mid and unica;
  if not found then raise exception 'Mensagem não encontrada.'; end if;
  if (m.autor = 'admin' and m.cliente_id <> auth.uid()) or (m.autor = 'cliente' and not public.e_admin()) then
    raise exception 'Sem acesso a esta mensagem.';
  end if;
  if m.vista_em is not null and m.vista_em < now() - interval '2 minutes' then
    raise exception 'Esta mensagem de visualização única já foi aberta.';
  end if;
  if m.vista_em is null then update public.mensagens set vista_em = now(), lida = true where id = mid; end if;
  return m.anexo_path;
end $$;
grant execute on function public.abrir_unica(bigint) to authenticated;
drop policy if exists "anexos: enviar" on storage.objects;
create policy "anexos: enviar" on storage.objects for insert to authenticated with check (
  bucket_id = 'anexos' and ((storage.foldername(name))[1] = auth.uid()::text or public.e_admin()));
drop policy if exists "anexos: admin apaga" on storage.objects;
create policy "anexos: admin apaga" on storage.objects for delete to authenticated using (bucket_id = 'anexos' and public.e_admin());

-- entregas/<id do pedido>/... : o cliente só descarrega depois de o pedido estar concluído
drop policy if exists "entregas: ler" on storage.objects;
create policy "entregas: ler" on storage.objects for select to authenticated using (
  bucket_id = 'entregas' and (public.e_admin() or exists (select 1 from public.pedidos p
    where p.id::text = (storage.foldername(name))[1] and p.cliente_id = auth.uid() and p.estado = 'concluido')));
drop policy if exists "entregas: admin envia" on storage.objects;
create policy "entregas: admin envia" on storage.objects for insert to authenticated with check (bucket_id = 'entregas' and public.e_admin());
drop policy if exists "entregas: admin apaga" on storage.objects;
create policy "entregas: admin apaga" on storage.objects for delete to authenticated using (bucket_id = 'entregas' and public.e_admin());

-- ---------- Tempo real (chat e pedidos) ----------
do $$ begin
  begin alter publication supabase_realtime add table public.mensagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.pedidos; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
-- DEPOIS de criar a sua conta no site, torne-se administrador
-- (troque o email se usar outro) e corra só esta linha:
--
-- insert into public.admins (user_id) select id from auth.users where email = 'franciscofelixlelo16@gmail.com' on conflict do nothing;
-- =====================================================================
