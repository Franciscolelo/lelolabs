# LeloLabs — loja virtual

Loja de serviços de software de Francisco Felix Lelo (Luanda, Angola).
Site estático: HTML, CSS (Bootstrap 5.3) e JavaScript, sem servidor e sem base de dados paga.

## Estrutura

Todos os ficheiros ficam na raiz do repositório (sem pastas):

- `index.html`, `loja.js`, `estilo.css`, `bootstrap.min.css`: loja pública
- `painel.html`, `painel.js`: painel de administração
- `dados.json`: catálogo, trabalhos e contactos
- `favicon.svg`: ícone do site

## Como funciona

- **Loja:** o cliente junta serviços ao carrinho, escreve nome e telefone, escolhe o canal (WhatsApp, SMS, chamada ou email) e recebe a mensagem já pronta. O site não guarda dados de clientes.
- **Painel** (`/painel.html`): login com palavra-passe encriptada (PBKDF2), edição de serviços, trabalhos, contactos e disponibilidade, histórico de vendas, importação de pedidos (cole a mensagem com `Ref: #LL:…`) e exportação CSV.
- **Atualizar a loja:** no painel, edite e carregue em **Exportar dados.json**. Substitua o `dados.json` do repositório e faça commit. O site atualiza sozinho.
- **Vendas:** ficam guardadas só no navegador onde usa o painel. Exporte cópias de segurança em *Segurança*. **Nunca** envie essas cópias para o GitHub: contêm dados de clientes.

## Testar no computador

O `dados.json` é lido por AJAX, por isso o navegador precisa de um servidor local:

```
cd lelolabs
python -m http.server 8000
```

Abra `http://localhost:8000` (loja) e `http://localhost:8000/painel.html` (painel).

## Publicar

### GitHub Pages (grátis)
1. Crie um repositório público em github.com (ex.: `lelolabs`).
2. Carregue todos os ficheiros desta pasta (botão **Add file → Upload files**) e faça commit.
3. Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
4. O site fica em `https://<seu-utilizador>.github.io/lelolabs/`.

### Vercel (grátis)
1. Entre em vercel.com com a conta do GitHub.
2. **Add New → Project**, escolha o repositório e carregue em **Deploy** (não precisa de configuração).

### Domínio próprio
Compre o domínio (ex.: `lelolabs.com`) e, no GitHub Pages (**Settings → Pages → Custom domain**) ou na Vercel (**Settings → Domains**), escreva o domínio. Depois crie no registador os registos DNS que a plataforma indicar. O HTTPS é ativado automaticamente.

## Segurança
- O painel é só uma ferramenta: mesmo aberto por outra pessoa, não altera o site (só o commit no GitHub altera) e não mostra as suas vendas (estão no seu navegador).
- Imagens carregadas no painel são reduzidas e perdem os metadados de localização.
- Todos os textos são inseridos com `textContent` (sem risco de injeção de HTML) e só se aceitam ligações `https://`.
