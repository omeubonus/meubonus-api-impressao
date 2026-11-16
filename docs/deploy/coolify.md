# Guia Completo de CI/CD (GitHub Actions -> GHCR) e Implantação no Coolify

Este guia detalha o fluxo oficial de compilação externa via **GitHub Actions**, publicação no **GitHub Container Registry (GHCR)** e deploy automatizado via **API do Coolify** para o ecossistema **SilentPrint (`apps/api` e `apps/web`) + PostgreSQL 18**.

---

## 1. Visão Geral da Esteira CI/CD e Arquitetura no Coolify

Seguindo nossa diretriz de **Zero Compilação na VPS**, toda a carga de build (TypeScript, Prisma Client, React/Vite) ocorre nos runners do GitHub Actions. A VPS do Coolify apenas faz o `docker pull` da imagem pronta do GHCR e executa o rolling update:

```mermaid
flowchart LR
    subgraph GitHub["GitHub Actions + GHCR"]
        GHA_API["Workflow deploy-api.yml"] -->|"Push :latest / :semver"| GHCR_API["ghcr.io/...-api:latest"]
        GHA_WEB["Workflow deploy-web.yml"] -->|"Push :latest / :semver"| GHCR_WEB["ghcr.io/...-web:latest"]
    end

    subgraph Coolify["Coolify (Rede Interna 'coolify')"]
        API["silentprint-api (Node 22 + Socket.IO)<br/>Porta: 3333"]
        WEB["silentprint-web (Nginx SPA)<br/>Porta: 80"]
        DB[("PostgreSQL 18<br/>Porta Interna: 5432")]
        API -->|"DATABASE_URL"| DB
    end

    GHA_API -->|"POST Webhook/API<br/>Bearer COOLIFY_API_TOKEN"| API
    GHA_WEB -->|"POST Webhook/API<br/>Bearer COOLIFY_API_TOKEN"| WEB
```

---

## 2. Passo 1: Criar o Banco de Dados PostgreSQL 18 no Coolify

1. No seu Projeto no Coolify, clique em **+ New Resource** $\rightarrow$ **PostgreSQL** (selecione a imagem `postgres:18-alpine` / PostgreSQL 18).
2. Defina os parâmetros:
   - **Database Name:** `silentprint_db`
   - **User:** `silentprint`
   - **Password:** Defina uma senha forte ou use a gerada pelo Coolify.
3. Clique em **Start**.
4. Copie a **Internal Database URL** exibida na seção **Connection Strings**:
   ```text
   postgresql://silentprint:SENHA_GERADA@NOME_DO_CONTAINER_NO_COOLIFY:5432/silentprint_db?schema=public
   ```

---

## 3. Passo 2: Configurar os Recursos no Coolify (Docker Image GHCR)

### 3.1 Recurso 1: `apps/api` (Backend & Socket.IO Hub)
1. Clique em **+ New Resource** $\rightarrow$ **Docker Image**.
2. **Image:** `ghcr.io/<seu-usuario>/<seu-repo>-api:latest`
3. **Ports Exposes:** `3333`
4. **Domains:** `https://api-impressao.seudominio.com`
5. **Environment Variables:**
   | Variável | Exemplo / Valor | Descrição |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Ambiente de execução |
   | `PORT` | `3333` | Porta HTTP e Socket.IO |
   | `DATABASE_URL` | `postgresql://silentprint:SENHA@HOST:5432/silentprint_db?schema=public` | Cole a **Internal Database URL** completa, sem interpolação |
   | `JWT_SECRET` | *(string hexadecimal 64 chars)* | Segredo para tokens JWT do painel admin |
   | `ADMIN_EMAIL` | `admin@seudominio.com` | E-mail inicial do administrador |
   | `ADMIN_PASSWORD` | `SenhaForteAqui` | Senha inicial do administrador |
   | `CORS_ORIGIN` | `https://impressao.seudominio.com` | URL pública do painel `apps/web` |
6. **Healthcheck:**
   - **Path:** `/health`
   - **Port:** `3333`
   - **Start Period:** `30` segundos *(para aguardar o `npx prisma migrate deploy`)*

### 3.2 Recurso 2: `apps/web` (Painel Administrativo)
1. Clique em **+ New Resource** $\rightarrow$ **Docker Image**.
2. **Image:** `ghcr.io/<seu-usuario>/<seu-repo>-web:latest`
3. **Ports Exposes:** `80`
4. **Domains:** `https://impressao.seudominio.com`

---

## 4. Passo 3: Configurar os Secrets no GitHub Actions

No repositório do GitHub, acesse **Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions** e adicione:

| Secret | Descrição |
| :--- | :--- |
| `COOLIFY_API_TOKEN` | Token gerado no Coolify em *Keys & Tokens $\rightarrow$ API Tokens* |
| `COOLIFY_API_WEBHOOK_URL` | Deploy Webhook URL do serviço `api` no Coolify (ex: `https://coolify.seudominio.com/api/v1/deploy?uuid=...&force=false`) |
| `COOLIFY_WEB_WEBHOOK_URL` | Deploy Webhook URL do serviço `web` no Coolify |
| `VITE_API_URL` | URL pública da API no Coolify (ex: `https://api-impressao.seudominio.com`) injetada no build do `apps/web` |

---

## 5. Alternativa: Deploy via Docker Compose (`apps/docker-compose.prod.yml`)

Caso prefira subir os serviços via recurso **Docker Compose** no Coolify consumindo as imagens pré-compiladas do GHCR:
* Conecte os serviços à rede externa `coolify` (`external: true`).
* Defina as labels explícitas do Traefik (`traefik.enable=true`, `traefik.docker.network=coolify`, `traefik.http.services.<svc>.loadbalancer.server.port=<PORT>`).
* **Não** defina `container_name` estático para permitir *rolling updates* sem colisão.
