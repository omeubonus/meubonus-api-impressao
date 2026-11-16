# AGENTS.md — Guia de Contexto, Agentes e Arquitetura do Projeto

Bem-vindo ao repositório do **Ecossistema de Impressão Silenciosa SilentPrint (PrintHub & Desktop Agent)**. Este arquivo é a fonte primária de contexto para agentes de IA e desenvolvedores que atuam neste projeto.

---

## 1. Convenção de Organização do Repositório (Raiz Limpa)

> **REGRA DE OURO:** A raiz deste repositório deve permanecer **estritamente limpa**, contendo apenas:
> 1. `AGENTS.md` — Este documento mestre de orientação e governança.
> 2. `.ai/` — Agentes especialistas (`agents/`) e playbooks técnicos sob demanda (`skills/`).
> 3. `.github/workflows/` — Esteiras de CI/CD (compilação Docker para GHCR, deploy via API no Coolify e build de instaladores Electron).
> 4. `docs/` — Toda a documentação de produto, requisitos, contratos de API/WebSocket, arquitetura e deploy.
> 5. `apps/` — Todas as aplicações do ecossistema (`api`, `web`, `desktop`) e manifests de orquestração (`docker-compose.yml` e `docker-compose.prod.yml`).
>
> **Nunca** crie arquivos soltos de código, configurações de pacotes ou documentos avulsos diretamente na raiz.

```text
AgenteDeImpressao/
├── AGENTS.md                         # Este arquivo (contexto global, regras e governança)
├── .github/
│   └── workflows/                    # CI/CD: Build no GitHub Actions -> GHCR -> API Coolify
│       ├── deploy-api.yml            # Build/Push apps/api (GHCR) + Trigger Coolify API
│       ├── deploy-web.yml            # Build/Push apps/web (GHCR) + Trigger Coolify API
│       └── release-desktop.yml       # Build instaladores .exe (Windows) e .dmg (macOS)
├── .ai/                              # Customizações de IA (Agentes e Skills por domínio)
│   ├── agents/                       # Especialistas do projeto
│   │   ├── api.md                    # Especialista em apps/api (Node/TS, Socket.IO, Prisma/PG18)
│   │   ├── web.md                    # Especialista em apps/web (React, Vite, Tailwind, shadcn/ui)
│   │   ├── desktop.md                # Especialista em apps/desktop (Electron, Spooler/ESC-POS, Tray)
│   │   └── devops.md                 # Especialista em CI/CD (GHCR), Docker, Traefik e Coolify
│   └── skills/                       # Playbooks técnicos carregados sob demanda
│       ├── silent-print-engine/
│       │   └── SKILL.md              # Impressão silenciosa multi-SO (RAW, ESC/POS, TCP:9100, PDF, HTML)
│       ├── socket-contract-sync/
│       │   └── SKILL.md              # Sincronização de contratos Socket.IO e REST entre os 3 apps
│       └── coolify-docker-prisma/
│           └── SKILL.md              # CI/CD (GitHub Actions -> GHCR -> Coolify API), PG18 e Traefik
├── docs/                             # Artefatos de documentação, arquitetura e deploy
│   ├── PRD.md                        # Product Requirement Document (v2.0) completo
│   ├── ARCHITECTURE_AND_PLAN.md      # Arquitetura detalhada, modelagem de dados e contratos
│   └── deploy/
│       └── coolify.md                # Guia completo de CI/CD (GHCR) e implantação no Coolify
└── apps/                             # Aplicações do ecossistema (isoladas entre si)
    ├── Makefile                      # Comandos e atalhos rápidos de desenvolvimento (up, logs, printer, etc.)
    ├── docker-compose.yml            # Orquestração para desenvolvimento local (PostgreSQL 18 + api + web)
    ├── docker-compose.prod.yml       # Orquestração de produção Coolify (imagens GHCR + rede coolify)
    ├── api/                          # Backend REST + Servidor WebSocket (Socket.IO) + Prisma
    ├── web/                          # Painel Administrativo Web (React + Vite + Tailwind + shadcn/ui)
    ├── desktop/                      # Agente Desktop Local (Electron + React + Tailwind)
    └── printer/                      # Emulador de Impressora Térmica TCP :9100 (ESC/POS & Hardware Mock)
```

---

## 2. Mapa de Agentes e Skills (`.ai/`)

Ao atuar em uma parte específica do sistema, consulte o agente especialista e as skills correspondentes em `.ai/`:

### 🤖 Agentes Especialistas (`.ai/agents/`)
* **[`.ai/agents/api.md`](./.ai/agents/api.md)** — Atua em `apps/api` (Express, Socket.IO, Prisma ORM, PostgreSQL 18, Zod, autenticação JWT/API_KEY e fila offline).
* **[`.ai/agents/web.md`](./.ai/agents/web.md)** — Atua em `apps/web` (React 19, Vite, Tailwind CSS, shadcn/ui, Dashboard em tempo real, Gestão de Empresas/API Keys, Monitoramento de Agentes e Playground).
* **[`.ai/agents/desktop.md`](./.ai/agents/desktop.md)** — Atua em `apps/desktop` (Electron Main/Preload/Renderer, descoberta de impressoras, System Tray, Autostart e motor de impressão silenciosa).
* **[`.ai/agents/devops.md`](./.ai/agents/devops.md)** — Atua em `.github/workflows/*`, `Dockerfile`s, `docker-compose*.yml` e `docs/deploy/` (compilação via GitHub Actions para GHCR, disparo de deploy via API do Coolify, versionamento SemVer e configuração de Traefik/PostgreSQL 18).

### 🛠️ Skills / Playbooks Técnicos (`.ai/skills/`)
* **[`.ai/skills/silent-print-engine/SKILL.md`](./.ai/skills/silent-print-engine/SKILL.md)** — Como listar impressoras do SO + TCP `:9100` e imprimir silenciosamente `TEXT`, `RAW` (ESC/POS), `PDF`, `IMAGE` e `HTML` no Windows, macOS e Linux sem Zadig.
* **[`.ai/skills/socket-contract-sync/SKILL.md`](./.ai/skills/socket-contract-sync/SKILL.md)** — Tabela de eventos Socket.IO e checklist para manter `apps/api`, `apps/web`, `apps/desktop` e `/docs` 100% sincronizados.
* **[`.ai/skills/coolify-docker-prisma/SKILL.md`](./.ai/skills/coolify-docker-prisma/SKILL.md)** — Fluxo de CI/CD (GitHub Actions $\rightarrow$ GHCR $\rightarrow$ API Coolify), `postgres:18-alpine`, Traefik labels e SemVer healthchecks.

---

## 3. Mapa de Artefatos em `/docs`

Antes de planejar ou implementar qualquer funcionalidade, consulte os artefatos oficiais na pasta `docs/`:

* **[`docs/PRD.md`](./docs/PRD.md)** — Product Requirement Document (v2.0) contendo visão geral, isolamento multi-tenant, onboarding `IMP-XXXXXX`, regras de segurança de vínculo (`claim`/`unclaim`) e motor agnóstico ao conteúdo.
* **[`docs/ARCHITECTURE_AND_PLAN.md`](./docs/ARCHITECTURE_AND_PLAN.md)** — Especificações técnicas, diagrama de arquitetura, estrutura de diretórios, modelagem Prisma, contratos Socket.IO/REST e plano de execução.
* **[`docs/deploy/coolify.md`](./docs/deploy/coolify.md)** — Guia operacional passo a passo de CI/CD via GitHub Actions + GHCR e configuração de serviços, secrets e healthchecks no Coolify.

---

## 4. Diretrizes de Desenvolvimento, Versionamento e Deploy (Coolify)

1. **Separação Estrita de Módulos:** Cada aplicação em `apps/` (`api`, `web`, `desktop`) deve possuir seu próprio `package.json`, `tsconfig.json` e dependências isoladas.
2. **Validação e Tipagem:** Todas as entradas de API e payloads de WebSocket no `apps/api` devem ser validados com **Zod**.
3. **Versionamento Semântico (SemVer) & `GET /health`:**
   * A cada entrega ou release, o campo `"version"` em `apps/api/package.json` e `apps/web/package.json` deve ser incrementado seguindo **SemVer (`MAJOR.MINOR.PATCH`)**.
   * A rota `GET /health` do `apps/api` deve expor dinamicamente a `version` do `package.json` e o status da conexão com o PostgreSQL 18.
4. **Zero Compilação na VPS (GitHub Actions $\rightarrow$ GHCR $\rightarrow$ Coolify API):**
   * Toda compilação Docker ocorre no GitHub Actions (`.github/workflows/deploy-api.yml` e `deploy-web.yml`), publicando imagens em `ghcr.io` e disparando o deploy no Coolify via API (`Bearer $COOLIFY_API_TOKEN`).
5. **Padrão Coolify / Traefik em Produção (`apps/docker-compose.prod.yml`):**
   * Conectar serviços à rede externa `coolify` (`external: true`).
   * Definir labels explícitas do Traefik (`traefik.enable=true`, `traefik.docker.network=coolify`, `traefik.http.services.<svc>.loadbalancer.server.port=<PORT>`).
   * Omitir `container_name` fixo em manifests de produção para permitir *rolling updates* sem colisão.
   * Configurar `start_period: 30s` no healthcheck da API para aguardar a conclusão de `prisma migrate deploy`.
6. **Blindagem de Segurança no Desktop Agent (`apps/desktop` — Padrão Zero-Exposure):**
   * Em produção (`!isDev`), manter DevTools, menu nativo, atalhos de inspeção, flags `--inspect`/`--remote-debugging-port` e logs `console.*`/`debugger` 100% desativados.
   * O `machineToken` deve permanecer criptografado via `safeStorage` (DPAPI/Keychain) e nunca ser enviado ao processo Renderer.
   * Chamadas de sistema no motor de impressão e auto-update devem usar exclusivamente `execFile` ou argumentos posicionais (zero interpolação em shell), sessões isoladas sem acesso externo e arquivos temporários com permissão `0o600`.
