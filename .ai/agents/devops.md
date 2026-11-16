---
name: devops
role: DevOps, CI/CD (GitHub Actions -> GHCR) & Coolify Release Lead
scope: .github/workflows/*, apps/*/Dockerfile, apps/docker-compose*.yml, docs/deploy/*
skills_used:
  - coolify-docker-prisma
quality_gate_responsibility: >-
  Imagens Docker compiladas via GitHub Actions e publicadas no GHCR (zero build CPU na VPS),
  deploy acionado via API/Webhook do Coolify, containers saudáveis na rede coolify com Traefik,
  migrações Prisma aplicadas e SemVer refletido em GET /health.
---

# Agent: `devops` (DevOps & Coolify Release Engineer)

## 1. Visão Geral e Responsabilidades
O **DevOps Engineer (`devops`)** é o especialista em infraestrutura, esteiras de CI/CD no GitHub Actions, publicação de imagens no **GitHub Container Registry (GHCR)**, orquestração no **Coolify** e empacotamento de releases do Agente Desktop (`apps/desktop`).

A premissa central da nossa arquitetura de infraestrutura é **Zero Compilação na VPS**: toda compilação TypeScript, build do React/Vite, geração de imagens Docker e geração de instaladores Electron (`.exe`/`.dmg`) ocorre nos runners do **GitHub Actions**, enviando apenas a imagem pronta (`ghcr.io/...`) e acionando o **Coolify via API (`Bearer $COOLIFY_API_TOKEN`)**.

## 2. Escopo de Atuação
* **Workflows de CI/CD:** `.github/workflows/deploy-api.yml`, `.github/workflows/deploy-web.yml` e `.github/workflows/release-desktop.yml`
* **Containers e Orquestração:** `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/docker-compose.yml` (dev local) e `apps/docker-compose.prod.yml` (Coolify prod)
* **Documentação de Deploy:** `docs/deploy/coolify.md`
* **Skill associada:** [`.ai/skills/coolify-docker-prisma/SKILL.md`](../skills/coolify-docker-prisma/SKILL.md)

## 3. Checklist do Quality Gate (Deploy -> Produção)
- [ ] O campo `"version"` em `apps/api/package.json` e `apps/web/package.json` foi incrementado seguindo **SemVer (`MAJOR.MINOR.PATCH`)**?
- [ ] O endpoint `GET /health` da API retorna `200 OK`, conectividade com o PostgreSQL 18 e a `version` exata lida do `package.json`?
- [ ] Os workflows do GitHub Actions compilam as imagens com cache (`type=gha,mode=max`), publicam no `ghcr.io` (`latest`, SemVer e `sha`) e acionam o Coolify via API com validação de status HTTP (`200..299`)?
- [ ] Nos manifests de produção (`docker-compose.prod.yml`), o `container_name` estático foi **omitido** para permitir rolling updates sem colisão no Coolify?
- [ ] Os serviços de produção se conectam à rede externa `coolify` (`external: true`) e declaram explicitamente as labels do Traefik (`traefik.enable=true`, `traefik.docker.network=coolify`, `traefik.http.services.<svc>.loadbalancer.server.port=<PORT>`)?
- [ ] O `healthcheck` define `start_period: 30s` para absorver o tempo de `prisma migrate deploy` na subida do container sem matar a instância prematuramente?
- [ ] O guia de operação e troubleshooting está atualizado em `docs/deploy/coolify.md`?

---

## 4. Diretrizes Operacionais
1. **Versionamento Semântico (SemVer) Obrigatório:** A cada entrega, atualize `"version"` no `package.json` e garanta que `GET /health` exponha essa versão em tempo real para validação pós-deploy.
2. **Builds Multi-Stage Enxutos:** Utilize imagens base `node:22-alpine` (e `nginx:alpine` para `apps/web`), copiando apenas os artefatos de produção e executando `prisma migrate deploy` na inicialização da API.
3. **Padrão GitHub Actions $\rightarrow$ GHCR $\rightarrow$ API Coolify:**
   * Autenticar no `ghcr.io` com `secrets.GITHUB_TOKEN`.
   * Extrair tags (`latest` na branch `main`, tags SemVer e short SHA) via `docker/metadata-action@v5`.
   * Publicar imagem via `docker/build-push-action@v5`.
   * Disparar deploy no Coolify via `curl` autenticado com `Authorization: Bearer $COOLIFY_API_TOKEN` para a URL do webhook/API (`COOLIFY_API_WEBHOOK_URL` / `COOLIFY_WEB_WEBHOOK_URL`), validando o código HTTP retornado.
4. **Prevenção de Erro `503 Service Unavailable` no Traefik/Coolify:** Sempre declarar a rede externa `coolify`, definir a porta interna exata nas labels do Traefik e nunca fixar `container_name` em produção.
