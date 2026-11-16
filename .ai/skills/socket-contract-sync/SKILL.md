---
name: socket-contract-sync
description: >-
  Playbook para manter sincronizados os contratos de comunicação WebSocket (Socket.IO)
  e REST API entre `apps/api`, `apps/web`, `apps/desktop` e a documentação em `/docs`.
---

# Skill: Socket & API Contract Sync

Use este playbook sempre que criar ou modificar eventos Socket.IO ou rotas REST entre `apps/api`, `apps/web` e `apps/desktop`.

---

## 1. Contrato Oficial de Eventos Socket.IO

### 1.1 Canal Agente $\leftrightarrow$ HUB (`apps/desktop` $\leftrightarrow$ `apps/api`)

| Evento | Emissor | Payload Esperado (Zod) | Ação / Resposta |
| :--- | :--- | :--- | :--- |
| `agent:register` | `desktop` | `{ machineToken, hostname, os, version, defaultPrinter?, printers: PrinterInfo[] }` | Registra ou atualiza o Agente no Postgres, gera `code` (`IMP-XXXXXX`) se novo, marca `ONLINE`, retorna `{ id, code, name, company, defaultPrinter }` via callback/evento e despacha jobs `QUEUED`. |
| `agent:heartbeat` | `desktop` | `{ machineToken, defaultPrinter?, printers: PrinterInfo[] }` | Atualiza `lastSeenAt`, `status = ONLINE`, `printers` e `defaultPrinter` no banco. |
| `agent:set-default-printer` | `desktop` | `{ machineToken, defaultPrinter: string }` | Persiste a nova impressora padrão escolhida localmente e emite `dashboard:update`. |
| `agent:unclaim` | `desktop` | `{ machineToken }` | Remove `companyId`, rotaciona o `code` para um novo `IMP-XXXXXX`, retorna o novo estado ao Agente e emite `dashboard:update`. |
| `agent:updated` | `api` | `{ code, name, company: { id, name } \| null, defaultPrinter }` | Enviado pelo HUB ao Agente quando ele é vinculado/desvinculado ou atualizado pelo Painel/API. |
| `print:job` | `api` | `{ jobId, title, printerName, type, content, options }` | Enviado pelo HUB ao Agente para execução imediata da impressão silenciosa. |
| `print:status` | `desktop` | `{ jobId, status: 'PRINTING' \| 'COMPLETED' \| 'FAILED', errorMessage?: string }` | Atualiza o `PrintJob` no Postgres (`startedAt`/`completedAt`/`errorMessage`) e notifica o painel `web`. |
| `agent:request-test` | `desktop` | `{ machineToken, printerName? }` | Solicita ao Hub a criação de um `PrintJob` de teste no Postgres com status `QUEUED`, emite `dashboard:update` para admins e devolve o job para o agente executar e reportar `print:status`. |
| `agent:trigger_update` | `api` | `{ force?: boolean }` | Comando remoto do HUB solicitando que o Agente aplique atualização com travas de segurança de fila ociosa. Retorna ACK `{ success: boolean, reason?: string }`. |
| `agent:update_status` | `desktop` | `{ machineToken, status: string, currentVersion: string, availableVersion?: string, downloadProgress?: number }` | Notifica o HUB do ciclo de auto-update (CHECKING, AVAILABLE, DOWNLOADING, DOWNLOADED, ERROR) para telemetria no painel. |

### 1.2 Canal Painel Admin $\leftrightarrow$ HUB (`apps/web` $\leftrightarrow$ `apps/api`)
* Administradores autenticados entram na sala `admins`.
* Sempre que um Agente conectar, desconectar, enviar heartbeat com mudança de impressoras, ser vinculado/desvinculado ou atualizar o status de um `PrintJob`, o `apps/api` emite `dashboard:update` para a sala `admins`.

---

## 2. Checklist de Sincronização em Mudanças de Contrato
1. Atualizar validação Zod em `apps/api`.
2. Atualizar os emissores/listeners correspondentes em `apps/desktop` e/ou `apps/web`.
3. Atualizar `docs/ARCHITECTURE_AND_PLAN.md` e `docs/PRD.md`.
