.PHONY: help up up-build down down-v restart logs logs-api logs-db logs-web ps db-migrate db-seed db-studio dev-api dev-web build-api printer dev-printer

# Cores para saída do terminal
BLUE=\033[0;34m
GREEN=\033[0;32m
YELLOW=\033[1;33m
NC=\033[0m

help: ## Exibe a lista de comandos disponíveis
	@echo ""
	@echo "$(BLUE)====================================================$(NC)"
	@echo "$(GREEN)  SilentPrint — Comandos e Atalhos (apps/Makefile)$(NC)"
	@echo "$(BLUE)====================================================$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-16s$(NC) %s\n", $$1, $$2}'
	@echo ""

up: ## Sobe todos os containers (postgres, api, web) em segundo plano
	@echo "$(GREEN)🚀 Subindo containers do SilentPrint...$(NC)"
	docker compose up -d

up-build: ## Reconstrói as imagens e sobe os containers
	@echo "$(GREEN)🔨 Reconstruindo imagens e subindo containers...$(NC)"
	docker compose up -d --build

up-db: ## Sobe apenas o banco de dados PostgreSQL 18
	@echo "$(GREEN)🐘 Subindo container do PostgreSQL 18...$(NC)"
	docker compose up -d postgres

down: ## Para todos os containers do projeto
	@echo "$(YELLOW)🛑 Parando containers...$(NC)"
	docker compose down

down-v: ## Para todos os containers e remove os volumes de dados (limpeza total)
	@echo "$(YELLOW)⚠️ Parando containers e removendo volumes...$(NC)"
	docker compose down -v

restart: ## Reinicia todos os containers
	@echo "$(YELLOW)🔄 Reiniciando containers...$(NC)"
	docker compose restart

ps: ## Lista os containers do projeto e seu status de saúde
	docker compose ps

logs: ## Exibe e acompanha os logs de todos os containers
	docker compose logs -f

logs-api: ## Acompanha os logs do container da API
	docker compose logs -f api

logs-db: ## Acompanha os logs do container PostgreSQL 18
	docker compose logs -f postgres

logs-web: ## Acompanha os logs do container Web
	docker compose logs -f web

db-migrate: ## Executa as migrações do Prisma no banco de dados local
	@echo "$(GREEN)📦 Aplicando migrações Prisma...$(NC)"
	cd api && npx prisma migrate dev

db-seed: ## Executa o seed inicial do banco (Admin + Empresa Demo)
	@echo "$(GREEN)🌱 Executando seed no banco de dados...$(NC)"
	cd api && npm run db:seed

db-studio: ## Abre a interface web do Prisma Studio para visualização dos dados
	@echo "$(GREEN)🔍 Abrindo Prisma Studio...$(NC)"
	cd api && npx prisma studio

dev-api: ## Executa a API localmente com hot-reload (tsx watch)
	@echo "$(GREEN)⚡ Iniciando API em modo de desenvolvimento...$(NC)"
	cd api && npm run dev

dev-web: ## Executa o Painel Web localmente com Vite (dev server)
	@echo "$(GREEN)⚡ Iniciando Painel Web com Vite...$(NC)"
	cd web && npm run dev

build-api: ## Compila o TypeScript da API
	@echo "$(GREEN)🔨 Compilando TypeScript da API...$(NC)"
	cd api && npm run build

printer: dev-printer ## Executa o Emulador de Impressora Térmica TCP :9100 interativo

dev-printer: ## Executa o Emulador de Impressora Térmica TCP :9100 interativo
	@echo "$(GREEN)🖨️  Iniciando Emulador de Impressora Térmica TCP :9100...$(NC)"
	cd printer && npm run dev

