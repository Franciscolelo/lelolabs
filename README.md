# LeloLabs — loja virtual com contas, pedidos e chat

Site estático (GitHub Pages ou Vercel) ligado a uma base de dados **Supabase** (plano gratuito).

## O que faz

**Clientes**
- Criam conta com nome, email e telefone (confirmação por email).
- Juntam serviços ao carrinho e fazem o pedido, escolhendo o método de pagamento.
- Recebem a validação, pagam e **enviam o comprovativo no próprio site**.
- Conversam consigo pelo **chat do site** (com anexos de imagem e PDF).
- Descarregam os ficheiros do projeto quando o libertar.

**Administrador (`painel.html`)**
- Pedidos com **pesquisa estilo Google** (código, cliente, email, telefone, serviço).
- Validar pedido (e definir o valor final), confirmar ou recusar pagamento, enviar ficheiros e **libertar o projeto**.
- Conversas com cada cliente, em tempo real.
- Clientes, serviços e trabalhos (**até 6 imagens** cada), dados da loja e **métodos de pagamento definidos por si**.

## Instalação (uma vez, ~10 minutos)

1. **Criar o projeto**: entre em supabase.com, crie conta e carregue em *New project* (região mais próxima: *West EU* ou *Central EU*). Guarde a palavra-passe da base de dados.
2. **Criar a base de dados**: no projeto, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase.sql` e carregue em **Run**.
3. **Ligar o site**: em **Project Settings → API**, copie o *Project URL* e a chave *anon public* para o ficheiro `config.js`.
4. **Endereço do site**: em **Authentication → URL Configuration**, ponha em *Site URL* o endereço do site (ex.: `https://franciscolelo.github.io/lelolabs/`) e adicione-o também em *Redirect URLs*.
5. **Publicar**: envie todos os ficheiros para o GitHub (Add file → Upload files → Commit). O GitHub Pages atualiza em 1–2 minutos.
6. **Tornar-se administrador**: crie a sua conta na loja (botão Entrar → Criar conta) e confirme o email. Depois, no **SQL Editor**, corra:

   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'franciscofelixlelo16@gmail.com' on conflict do nothing;
   ```
7. Abra `painel.html` no seu site e entre com essa conta. Em **Loja e pagamentos**, escreva os seus dados de pagamento (IBAN, Multicaixa Express, etc.) e ative os métodos que aceita.

## Ficheiros

| Ficheiro | Para que serve |
|---|---|
| `index.html`, `loja.js` | Loja pública e área do cliente |
| `painel.html`, `painel.js` | Painel de administração |
| `comum.js` | Funções partilhadas (pesquisa, chat, galerias) |
| `estilo.css`, `bootstrap.min.css` | Aparência (Bootstrap 5.3 + estilos da marca) |
| `config.js` | Endereço e chave pública do Supabase |
| `supabase.sql` | Tabelas, regras de segurança, ficheiros e avisos automáticos |

## Segurança
- **Regras no servidor (RLS):** cada cliente só lê os seus pedidos, mensagens e ficheiros; só o administrador altera a loja e os pedidos.
- **Preços recalculados no servidor:** o cliente não consegue alterar o valor de um pedido.
- **Ficheiros privados:** comprovativos e entregas usam ligações temporárias de 2 minutos; as entregas só ficam acessíveis depois de libertar o projeto.
- Palavras-passe geridas pelo Supabase Auth (nunca guardadas em texto).
- Todo o texto é inserido com `textContent` (sem injeção de HTML) e só se aceitam ligações `https://`.

## Limites do plano gratuito do Supabase
- 500 MB de base de dados e 1 GB de ficheiros; ficheiros de entrega até 50 MB cada.
- O projeto entra em pausa após 7 dias sem visitas (reativa-se no painel do Supabase).
- Os emails de confirmação do Supabase têm um limite baixo por hora. Para muitos clientes, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.

## Proteção contra spam
- Já ativo: campo invisível anti-robôs, limite de 5 pedidos por hora e de 20 mensagens por minuto por cliente.
- Opcional (CAPTCHA): crie uma chave gratuita em dash.cloudflare.com → Turnstile. Ponha a **Site Key** em `config.js` (`TURNSTILE_SITE_KEY`) e a **Secret Key** no Supabase em **Authentication → Attack Protection → Enable CAPTCHA protection → Turnstile**.
