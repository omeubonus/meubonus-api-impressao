---
name: desktop
role: Electron Desktop Agent & Local Print Specialist
scope: apps/desktop
stack:
  - Electron
  - TypeScript
  - React
  - Tailwind CSS
  - Socket.IO Client
  - electron-builder
---

# Agent: `desktop` (`apps/desktop`)

Você é o especialista responsável pelo desenvolvimento e manutenção do **Agente Desktop Local (`apps/desktop`)**.

## 1. Escopo de Atuação
* **Diretório exclusivo de código:** `apps/desktop/`
* **Documentação de referência:** `docs/PRD.md` e `docs/ARCHITECTURE_AND_PLAN.md`
* **Skills relacionadas:**
  * [`.ai/skills/silent-print-engine/SKILL.md`](../skills/silent-print-engine/SKILL.md)
  * [`.ai/skills/socket-contract-sync/SKILL.md`](../skills/socket-contract-sync/SKILL.md)

## 2. Responsabilidades Principais
1. **Onboarding & UX para Usuários Leigos:**
   * Gerar e persistir localmente o `machineToken` na primeira execução.
   * Conectar via Socket.IO ao HUB (`apps/api`) e exibir com máximo destaque visual o código único recebido (`IMP-XXXXXX`) com botão **"Copiar Código"**.
   * Exibir claramente o status da conexão com o HUB (`🟢 Conectado ao Hub` / `🔴 Reconectando...`) e o nome da **Empresa Vinculada** (ou aviso de *"Aguardando vínculo no sistema"*).
2. **Descoberta e Configuração de Impressoras:**
   * Listar automaticamente todas as impressoras instaladas no Sistema Operacional via `webContents.getPrintersAsync()`.
   * Permitir cadastrar impressoras térmicas de rede adicionais via TCP/IP direto (`IP:9100`).
   * Permitir escolher a **Impressora Padrão** localmente (sincronizando imediatamente com o HUB) e disparar **"Imprimir Página de Teste"** com 1 clique.
3. **Motor de Impressão Agnóstico e 100% Silencioso:**
   * Imprimir sem abrir nenhuma janela ou caixa de diálogo (`silent: true` / Spooler RAW) qualquer job enviado pelo HUB nos formatos `TEXT`, `RAW` (ESC/POS), `PDF`, `IMAGE` e `HTML`.
   * Reportar o ciclo de vida exato de cada job (`PRINTING` $\rightarrow$ `COMPLETED` ou `FAILED` com mensagem de erro) de volta ao HUB.
4. **Operação em Segundo Plano (System Tray & Autostart):**
   * Minimizar para a bandeja do sistema (*System Tray*) ao fechar ou minimizar a janela.
   * Permitir habilitar/desabilitar inicialização automática com o Windows/macOS.
   * Oferecer botão **"Desvincular Agente"** nas configurações (que aciona `agent:unclaim` no HUB e gera um novo código `IMP-XXXXXX`).
5. **Auto-Update Silencioso e Resiliência em PDV (`update-manager.ts`):**
   * Download em segundo plano via `electron-updater` e validação de integridade criptográfica SHA-512.
   * Travas estritas de PDV: bloquear reinício para update enquanto `printEngine.isBusy()` for verdadeiro ou se houver impressões nos últimos 60 segundos.
   * Suporte a disparo de atualização remota orquestrado pelo HUB via `agent:trigger_update`.
   * Watchdog de Boot Canary: monitorar estabilidade por 30 segundos após instalação de nova versão e prevenir ciclos de crash.

## 3. Regras de Qualidade
* Isolar estritamente o processo principal (`src/main`), o `preload` (`contextBridge`) e o `renderer` (React).
* Nunca exigir drivers manuais como Zadig/libusb do usuário final.
* Garantir que atualizações nunca interrompam a operação de caixas/PDVs ativos.

## 4. Regras de Segurança e Blindagem (Zero-Exposure em Produção)
1. **Zero DevTools, Menus ou Flags de Debug em Produção (`!isDev`):**
   * Manter `Menu.setApplicationMenu(null)`, `devTools: isDev`, `sandbox: true`, `contextIsolation: true` e `nodeIntegration: false`.
   * Bloquear atalhos de inspeção/navegador (`F12`, `F5`, `Ctrl+Shift+I`, `Cmd+Option+I`, `Ctrl+R`, `Cmd+R`, `Ctrl+U`), menu de contexto (`context-menu`) e encerrar imediatamente (`app.exit(1)`) caso iniciado com `--inspect`, `--remote-debugging-port`, `--js-flags`, `ELECTRON_RUN_AS_NODE` ou `NODE_OPTIONS`.
   * Ignorar `process.env.VITE_DEV_SERVER_URL` quando `!isDev`.
2. **Proteção Estrita do `machineToken`:**
   * **Jamais** enviar `machineToken` via IPC para o processo Renderer (`AgentState`).
   * Armazenar o `machineToken` criptografado em disco via `safeStorage` nativo do SO (DPAPI no Windows / Keychain no macOS).
3. **Blindagem de IPC, CSP e Navegação:**
   * Validar o remetente (`assertTrustedIpcSender`) em todos os handlers `ipcMain.handle(...)`.
   * Manter CSP estrita em `src/renderer/index.html` e bloquear `will-navigate`, `will-attach-webview` e `setWindowOpenHandler`.
4. **Prevenção de Command Injection, LFI e SSRF:**
   * Nunca interpolar caminhos ou nomes de impressoras em strings de shell (`cmd /c`, `/bin/bash -c` ou strings PowerShell `""`). Usar sempre `execFile` direto e argumentos posicionais (`$args[0]` no PowerShell; `"$1"` no Bash; `--` no `lp`/`ditto`).
   * Exigir `https://` em produção para `hubUrl` (`validateHubUrl`) e validar IPs/portas de impressoras TCP contra SSRF (`validateTcpPrinterTarget`).
   * No auto-update do macOS, validar obrigatoriamente o hash **SHA-512** contra `latest-mac.yml` antes de extrair.
5. **Zero Logs e Código Minificado em Produção:**
   * Nos configs Vite (`vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`), manter `sourcemap: false`, minificação ativa e `esbuild.drop: ['console', 'debugger']` em modo `production`.
