# 🖨️ SilentPrint — Mock Printer (Emulador Térmico TCP :9100)

Emulador de impressora térmica direta via socket TCP/IP (ESC/POS) para testes de desenvolvimento, homologação e simulação de cenários de estresse e falhas de hardware.

---

## 🎯 Finalidade

Permite testar o fluxo de ponta a ponta do **SilentPrint** sem necessidade de hardware físico conectado:
1. **Conexão Direta TCP/IP**: Escuta por padrão em `0.0.0.0:9100` (padrão de impressoras como EPSON TM-T20, Elgin i9, Bematech MP-4200 TH, Daruma, etc.).
2. **Decodificação ESC/POS**: Interpreta sequências de inicialização (`ESC @`), alinhamentos (`ESC a`), negrito (`ESC !`/`ESC E`), cortes de papel (`GS V`) e quebras de linha.
3. **Simulador de Falhas e Sensores de Hardware**: Permite alternar o status do equipamento em tempo real com um simples toque de tecla.
4. **Visualizador de Cupom Térmico**: Renderiza visualmente no terminal a filipeta/bobina de papel do cupom impresso com indicação do corte da guilhotina.

---

## 🚀 Como Executar

A partir da pasta `apps/`:

```bash
make printer
# ou
make dev-printer
```

Ou diretamente na pasta `apps/printer/`:

```bash
npm install
npm run dev
```

> **Dica:** Para alterar a porta (caso queira simular múltiplas impressoras ou evitar conflito):
> ```bash
> PORT=9102 npm run dev
> ```

---

## 🎮 Controles Interativos (Teclado em Tempo Real)

Com o emulador rodando no terminal, basta pressionar as seguintes teclas para alternar instantaneamente o comportamento do equipamento:

| Tecla | Modo | Comportamento Simulado |
| :---: | :--- | :--- |
| **`1`** | **ONLINE (Pronta)** | Aceita impressões, processa comandos ESC/POS e simula o corte de papel com sucesso. |
| **`2`** | **SEM PAPEL (Paper Out)** | Simula o sensor de rolo vazio. Rejeita o trabalho e reporta falha de papel. |
| **`3`** | **TAMPA ABERTA** | Simula a tampa da impressora aberta durante o recebimento do trabalho. |
| **`4`** | **GUILHOTINA TRAVADA** | Simula erro mecânico de travamento do cortador de papel. |
| **`5`** | **ATRASO / LATÊNCIA (3.5s)** | Simula fila/buffer ocupado demorando 3.5 segundos para concluir cada trabalho. |
| **`6`** | **DESLIGADA (Offline)** | Rejeita imediatamente conexões TCP com `ECONNREFUSED` (simula impressora desconectada da tomada). |
| **`L`** | **Limpar Histórico** | Limpa a tela e o histórico de cupons recebidos. |
| **`Q`** | **Encerrar** | Fecha o servidor TCP e encerra o emulador. |

---

## 🔗 Como Conectar no SilentPrint Desktop

1. Inicie o emulador (`make printer`).
2. Abra o **SilentPrint Agent Desktop**.
3. Na aba **Impressoras Detectadas**, clique no botão **"+ Adicionar IP:9100"**.
4. Digite:
   - **Nome:** `Térmica Emulada (127.0.0.1:9100)`
   - **IP:** `127.0.0.1`
   - **Porta:** `9100`
5. Clique em **Testar** na impressora adicionada:
   - Se o emulador estiver em modo `[1] ONLINE`: o cupom térmico será impresso e desenhado no terminal em milissegundos!
   - Se o emulador estiver em modo `[2] SEM PAPEL` ou `[6] OFFLINE`: o agente reportará erro imediatamente, demonstrando o tratamento de falhas.
