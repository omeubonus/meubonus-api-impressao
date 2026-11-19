# Guia Completo de CI/CD (GitHub Actions -> GHCR) e Implantação no Coolify

Este guia detalha o fluxo oficial de compilação externa via **GitHub Actions**, publicação no **GitHub Container Registry (GHCR)** e deploy automatizado via **API do Coolify** para o ecossistema **SilentPrint (`apps/api` e `apps/web`) + PostgreSQL 18**.

---

## 1. Visão Geral da Esteira CI/CD e Arquitetura no Coolify

Seguindo nossa diretriz de **Zero Compilação na VPS**, toda a carga de build (TypeScript, Prisma Client, React/Vite) ocorre nos runners do GitHub Actions. A VPS do Coolify apenas faz o `docker pull` da imagem pronta do GHCR e executa o rolling update:

```mermaid
flowchart LR
    subgraph GitHub["GitHub Actions + GHCR"]
        GHA_API["Workflow deploy-api.yml"] -->|"Push :latest / :sha"| GHCR_API["ghcr.io/omeubonus/meubonus-api-impressao-api"]
        GHA_WEB["Workflow deploy-web.yml"] -->|"Push :latest / :sha"| GHCR_WEB["ghcr.io/omeubonus/meubonus-api-impressao-web"]
    end

    subgraph Coolify["Coolify (Rede Interna 'coolify')"]
        API["impressaoDireta-api (Node 22 + Socket.IO)<br/>Porta: 3333"]
        WEB["Web - Painel Print (Impressão Direta) (Nginx SPA)<br/>Porta: 80"]
        DB[("postgres-impressao-direta (PostgreSQL 18)<br/>Porta Interna: 5432")]
        API -->|"DATABASE_URL"| DB
    end

    GHA_API -->|"POST Webhook/API<br/>Bearer COOLIFY_API_TOKEN"| API
    GHA_WEB -->|"POST Webhook/API<br/>Bearer COOLIFY_API_TOKEN"| WEB
```

---

## 2. Ambiente de Produção Atual

Tudo roda em uma única VPS (servidor `localhost` no Coolify), no projeto **`meubonus`**, ambiente **`production`**, em `https://coolify.meubonus.com.br`.

| Item | Valor |
| :--- | :--- |
| IP da VPS | `2.24.117.155` |
| API (domínio) | `https://api-impressao.meubonus.com.br` |
| Painel web (domínio) | `https://impressao.meubonus.com.br` |
| Coolify (painel) | `https://coolify.meubonus.com.br` |
| Recurso da API | `impressaoDireta-api` (UUID `44f9x144rp8v16e1lauisjnz`) |
| Recurso do painel | `Web - Painel Print (Impressão Direta)` (UUID `1ajvb7bh0b9zt4bxi0awhspp`) |
| Banco | `postgres-impressao-direta` (UUID `zlwhphyvt0eyp4agrbsg0tot`), banco `silentprint_db`, usuário `silentprint` |

**DNS (Registro.br, zona de `meubonus.com.br`):** os registros `A` de `api-impressao` e `impressao` apontam para `2.24.117.155`. O Coolify também cria automaticamente as variantes `www.` de cada domínio. Elas aparecem com aviso de DNS e podem ser removidas na aba **Domains**, pois não afetam o funcionamento.

Os nomes dos recursos no Coolify são só rótulos. Mudar o nome não altera domínio, variáveis nem deploy. O que identifica o recurso é o UUID.

---

## 3. Passo 1: Criar o Banco de Dados PostgreSQL 18 no Coolify

1. No Projeto no Coolify, clique em **+ New Resource** $\rightarrow$ **PostgreSQL** e escolha **PostgreSQL 18** (imagem `postgres:18-alpine`).
2. Em **General**, defina:
   - **Name:** `postgres-impressao-direta`
   - **Username:** `silentprint`
   - **Initial database:** `silentprint_db`
   - **Password:** mantenha a senha gerada pelo Coolify.
3. Clique em **Save** e depois em **Start**.
4. Copie a **Postgres URL (internal)** exibida na seção **Access**. O Coolify gera com prefixo `postgres://`. Acrescente `?schema=public` ao final para usar na API:
   ```text
   postgres://silentprint:SENHA_GERADA@UUID_DO_BANCO:5432/silentprint_db?schema=public
   ```
   O host é o UUID do recurso, alcançável apenas pela rede interna `coolify`.

---

## 4. Passo 2: Configurar os Recursos no Coolify (Docker Image GHCR)

O repositório é público e os pacotes do GHCR são puxados pela VPS sem login. Se o repositório virar privado, rode `docker login ghcr.io` na VPS com um PAT `read:packages`.

### 4.1 Recurso 1: `apps/api` (Backend & Socket.IO Hub)
1. Clique em **+ New Resource** $\rightarrow$ **Docker Image**.
2. **Image:** `ghcr.io/omeubonus/meubonus-api-impressao-api`, **Tag:** `latest`.
3. Em **General** $\rightarrow$ **Edit networking**, defina **Ports exposes** como `3333` e salve. Sem isso o deploy avisa `PORT environment variable (3333) does not match configured ports_exposes: 80`.
4. Na aba **Domains** $\rightarrow$ **Add domain**, informe `api-impressao.meubonus.com.br`, protocolo `https` e porta `3333`.
5. Na aba **Environment Variables**, use o **Developer view** para colar todas de uma vez:
   | Variável | Exemplo / Valor | Descrição |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Ambiente de execução |
   | `PORT` | `3333` | Porta HTTP e Socket.IO |
   | `DATABASE_URL` | `postgres://silentprint:SENHA@UUID_DO_BANCO:5432/silentprint_db?schema=public` | Internal URL completa do passo 1, sem interpolação |
   | `JWT_SECRET` | *(string hexadecimal 64 chars)* | Segredo para tokens JWT do painel admin |
   | `ADMIN_EMAIL` | `admin@silentprint.local` | E-mail do administrador |
   | `ADMIN_PASSWORD` | *(senha forte)* | Senha do administrador |
   | `CORS_ORIGIN` | `https://impressao.meubonus.com.br` | URL pública do painel `apps/web` |
   | `GITHUB_REPOSITORY` | `omeubonus/meubonus-api-impressao` | Repo das releases do Desktop Agent (rota `/api/downloads`) |
   | `GITHUB_TOKEN` | *(PAT de leitura)* | Opcional. Só é necessário se o repo for privado ou para evitar rate limit da API do GitHub |

   A API sincroniza o admin com as variáveis a cada subida: se `ADMIN_PASSWORD` mudar, a senha do admin é atualizada no banco após o próximo deploy (`apps/api/src/config/bootstrap.ts`).
6. Na aba **Healthcheck**, preencha e clique em **Enable**:
   - **Path:** `/health`
   - **Port:** `3333`
   - **Start Period:** `30` segundos *(para aguardar o `prisma migrate deploy`)*
7. Clique em **Deploy**.

### 4.2 Recurso 2: `apps/web` (Painel Administrativo)
1. Clique em **+ New Resource** $\rightarrow$ **Docker Image**.
2. **Image:** `ghcr.io/omeubonus/meubonus-api-impressao-web`, **Tag:** `latest`.
3. **Ports exposes:** `80` (padrão).
4. Na aba **Domains**, adicione `impressao.meubonus.com.br` sem informar porta.
5. Clique em **Deploy**.

> O `VITE_API_URL` é embutido no bundle durante o build da imagem no GitHub Actions. Ele **não** é variável de runtime do Coolify. Veja o passo 5.

### 4.3 Verificação
```bash
curl https://api-impressao.meubonus.com.br/health
# {"status":"ok","version":"x.y.z","database":"connected",...}
curl -I https://impressao.meubonus.com.br/
```

---

## 5. Passo 3: Configurar os Secrets no GitHub Actions

No repositório do GitHub, acesse **Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions** (ou use `gh secret set`) e adicione:

| Secret | Valor |
| :--- | :--- |
| `COOLIFY_API_TOKEN` | Token do Coolify (veja abaixo) |
| `COOLIFY_API_WEBHOOK_URL` | `https://coolify.meubonus.com.br/api/v1/deploy?uuid=44f9x144rp8v16e1lauisjnz&force=false` |
| `COOLIFY_WEB_WEBHOOK_URL` | `https://coolify.meubonus.com.br/api/v1/deploy?uuid=1ajvb7bh0b9zt4bxi0awhspp&force=false` |
| `VITE_API_URL` | `https://api-impressao.meubonus.com.br` |

**Token do Coolify:** em **Keys & Tokens** $\rightarrow$ **API Tokens** $\rightarrow$ **New Token**, crie o token `github-actions-deploy` com as permissões **Deploy** e **Read**. A validade é de 1 ano: ao expirar, crie outro e atualize o secret `COOLIFY_API_TOKEN`. O Coolify mostra o valor uma única vez.

**Atenção ao `VITE_API_URL`:** se ele estiver ausente na hora do build, o painel é compilado apontando para `http://localhost:3335` e o login falha mesmo com a credencial correta. Depois de cadastrar ou alterar o secret, rode de novo o workflow `deploy-web`.

Sem os secrets `COOLIFY_*`, os workflows apenas publicam a imagem e pulam o deploy. Nesse caso faça **Redeploy** manual no Coolify.

### 5.1 Quando cada workflow dispara
| Workflow | Dispara em | Resultado |
| :--- | :--- | :--- |
| `deploy-api.yml` | push na `main` em `apps/api/**`, ou manual | Publica `:latest` e `:sha-xxxxxxx` e aciona o webhook da API |
| `deploy-web.yml` | push na `main` em `apps/web/**`, ou manual | Publica `:latest` e `:sha-xxxxxxx` e aciona o webhook do painel |
| `release-desktop.yml` | push de tag `v*.*.*`, ou manual | Gera `.exe`/`.msi` (Windows) e `.dmg`/`.zip` (macOS arm64) na Release do GitHub |

Alterações apenas em `apps/docker-compose*.yml` ou `docs/` não disparam deploy.

---

## 6. Release do Desktop Agent

O instalador embute o domínio da API (`https://api-impressao.meubonus.com.br`) como padrão em `apps/desktop/.env.production`, `vite.main.config.ts`, `vite.renderer.config.ts` e `src/main/store.ts`. Qualquer mudança de domínio exige nova release.

1. Aumente `"version"` em `apps/desktop/package.json` seguindo SemVer.
2. Faça commit na `main`, crie a tag e envie:
   ```bash
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```
3. O workflow `release-desktop.yml` compila no Windows e no macOS e publica os instaladores na Release `vX.Y.Z` (`electron-builder --publish always`, provider `github` em `apps/desktop/electron-builder.yml`).
4. Confira em `GET /api/downloads/info` da API: a versão nova deve aparecer com Windows e Mac disponíveis. A API consulta as Releases do GitHub e guarda o resultado em cache de 1 minuto (15 segundos durante um build em andamento).

Limitação atual: o build de macOS gera apenas `arm64` (Apple Silicon).

---

## 7. Backup do PostgreSQL

Configurado no recurso do banco em **Backups**:

| Item | Valor |
| :--- | :--- |
| Banco | `silentprint_db` |
| Frequência | `0 3 * * *` (todo dia às 03:00 UTC, meia-noite em Brasília) |
| Retenção local | 7 backups, 14 dias, máximo de 5 GB |
| Destino | Disco da VPS (local). Sem S3 configurado |

Os backups locais ficam no mesmo servidor do banco. Se a VPS for perdida, eles se perdem junto. Para proteção real, cadastre um destino S3 (Backblaze B2, Cloudflare R2, AWS) no Coolify e marque o backup para enviá-lo. O campo "Missing backup alert" está em 0, então o Coolify não avisa se uma execução falhar. Confira a aba **Executions** periodicamente.

---

## 8. Troubleshooting

| Sintoma | Causa provável | Ação |
| :--- | :--- | :--- |
| Login no painel falha com a credencial certa | Build do web sem `VITE_API_URL` (aponta para `localhost:3335`) | Cadastre o secret, rode `deploy-web` e faça Redeploy do painel. Confirme com um `grep` por `api-impressao` no bundle `assets/index-*.js` |
| `503` / `bad gateway` na API | `Ports exposes` diferente de `3333` ou porta errada no domínio | Ajuste em **Edit networking** e na aba **Domains**, depois Redeploy |
| Workflow termina OK mas o Coolify não atualiza | Secrets `COOLIFY_*` ausentes | Cadastre os secrets ou faça Redeploy manual |
| Webhook retorna `401` | Token expirado ou sem permissão Deploy | Crie novo token e atualize `COOLIFY_API_TOKEN` |
| `Validating DNS failed` para `www.` | Coolify criou a variante `www` sem registro DNS | Ignore ou remova o domínio `www.` na aba **Domains** |
| Container reinicia no deploy da API | Migração do Prisma ainda rodando | O healthcheck tem `start_period` de 30 s. Aguarde |
| `/api/downloads/info` sem a versão nova | Release do desktop ainda incompleta ou cache de 1 minuto | Aguarde o fim do `release-desktop` e consulte de novo |

---

## 9. Alternativa: Deploy via Docker Compose (`apps/docker-compose.prod.yml`)

Caso prefira subir os serviços via recurso **Docker Compose** no Coolify consumindo as imagens pré-compiladas do GHCR:
* Conecte os serviços à rede externa `coolify` (`external: true`).
* Defina as labels explícitas do Traefik (`traefik.enable=true`, `traefik.docker.network=coolify`, `traefik.http.services.<svc>.loadbalancer.server.port=<PORT>`).
* **Não** defina `container_name` estático para permitir *rolling updates* sem colisão.
* O compose aceita `GITHUB_REPOSITORY` e `GITHUB_TOKEN` para a rota `/api/downloads`.

A produção atual usa recursos **Docker Image** separados, não este compose.
