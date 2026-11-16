export interface ParsedJob {
  text: string;
  lines: string[];
  hasCut: boolean;
  hasInit: boolean;
  rawByteCount: number;
}

export class EscPosParser {
  /**
   * Analisa um buffer de bytes brutos recebido pela porta TCP 9100
   * e extrai texto legível, comandos de corte e inicialização.
   */
  static parse(buffer: Buffer): ParsedJob {
    let hasCut = false;
    let hasInit = false;
    const textBytes: number[] = [];

    let i = 0;
    while (i < buffer.length) {
      const b = buffer[i];

      // ESC @ (0x1B, 0x40) - Inicialização
      if (b === 0x1b && i + 1 < buffer.length && buffer[i + 1] === 0x40) {
        hasInit = true;
        i += 2;
        continue;
      }

      // GS V (0x1D, 0x56) - Corte de Papel (Full/Partial Cut)
      if (b === 0x1d && i + 1 < buffer.length && buffer[i + 1] === 0x56) {
        hasCut = true;
        i += 2;
        if (i < buffer.length && (buffer[i] === 0x00 || buffer[i] === 0x01 || buffer[i] === 0x41 || buffer[i] === 0x42)) {
          i++;
          if (i < buffer.length) i++;
        }
        continue;
      }

      // ESC a (0x1B, 0x61, n) - Alinhamento
      if (b === 0x1b && i + 1 < buffer.length && buffer[i + 1] === 0x61) {
        i += 3;
        continue;
      }

      // ESC ! ou ESC E (0x1B, 0x21 ou 0x1B, 0x45) - Negrito / Modo
      if (b === 0x1b && i + 1 < buffer.length && (buffer[i + 1] === 0x21 || buffer[i + 1] === 0x45)) {
        i += 3;
        continue;
      }

      // ESC d / ESC J (Alimentação de linhas)
      if (b === 0x1b && i + 1 < buffer.length && (buffer[i + 1] === 0x64 || buffer[i + 1] === 0x4a)) {
        i += 3;
        continue;
      }

      // Preserva bytes de texto (incluindo sequências multi-byte UTF-8)
      if (b === 0x0a || b === 0x09 || (b >= 0x20 && b <= 0x7e) || b >= 0x80) {
        textBytes.push(b);
      }

      i++;
    }

    let fullText = Buffer.from(textBytes).toString('utf-8');

    // Normaliza quebras de linha e remove excesso de linhas vazias no início/fim
    const lines = fullText
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l, idx, arr) => !(l === '' && (idx === 0 || idx === arr.length - 1)));

    return {
      text: fullText,
      lines,
      hasCut,
      hasInit,
      rawByteCount: buffer.length,
    };
  }

  /**
   * Renderiza uma bobina de cupom térmico estilizada em ASCII/Unicode
   */
  static renderReceiptBox(parsed: ParsedJob, width = 48): string[] {
    const horizontalBorder = '─'.repeat(width);
    const result: string[] = [];

    result.push(`╭${horizontalBorder}╮`);

    for (const rawLine of parsed.lines) {
      if (rawLine.length === 0) {
        result.push(`│${' '.repeat(width)}│`);
        continue;
      }

      // Quebra linhas que ultrapassarem a largura da bobina
      let current = rawLine;
      while (current.length > 0) {
        const chunk = current.slice(0, width);
        current = current.slice(width);
        const padded = chunk.padEnd(width, ' ');
        result.push(`│${padded}│`);
      }
    }

    if (parsed.hasCut) {
      const cutLine = '✂ '.repeat(Math.floor(width / 4));
      const paddedCut = cutLine.padEnd(width, ' ');
      result.push(`│${paddedCut}│`);
    }

    result.push(`╰${horizontalBorder}╯`);
    return result;
  }
}
