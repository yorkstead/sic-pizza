/**
 * ESC/POS Thermal Receipt Printer Abstraction & Hardware Print Spooler.
 * Generates standards-compliant ESC/POS byte sequences for kitchen tickets, guest checks, and credit receipts.
 */

export interface PrintJob {
  id: string;
  type: "kitchen_ticket" | "guest_check" | "payment_receipt";
  targetPrinter: "kitchen_main" | "bar_printer" | "expo_printer" | "guest_receipt";
  rawBytesBase64: string;
  textProjection: string;
  status: "QUEUED" | "PRINTED" | "ERROR";
  error?: string;
  createdAt: string;
}

export class EscPosBuilder {
  private buffer: number[] = [];

  // ESC/POS byte codes
  static readonly ESC = 0x1b;
  static readonly GS = 0x1d;
  static readonly LF = 0x0a;

  init(): this {
    this.buffer.push(EscPosBuilder.ESC, 0x40); // ESC @
    return this;
  }

  bold(enable: boolean): this {
    this.buffer.push(EscPosBuilder.ESC, 0x45, enable ? 1 : 0); // ESC E n
    return this;
  }

  doubleSize(enable: boolean): this {
    this.buffer.push(EscPosBuilder.GS, 0x21, enable ? 0x11 : 0x00); // GS ! n
    return this;
  }

  align(alignment: "left" | "center" | "right"): this {
    const val = alignment === "center" ? 1 : alignment === "right" ? 2 : 0;
    this.buffer.push(EscPosBuilder.ESC, 0x61, val); // ESC a n
    return this;
  }

  line(text = ""): this {
    for (let i = 0; i < text.length; i++) {
      this.buffer.push(text.charCodeAt(i));
    }
    this.buffer.push(EscPosBuilder.LF);
    return this;
  }

  feed(lines = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(EscPosBuilder.LF);
    }
    return this;
  }

  divider(char = "-", width = 32): this {
    this.line(char.repeat(width));
    return this;
  }

  cut(): this {
    this.feed(3);
    this.buffer.push(EscPosBuilder.GS, 0x56, 66, 0); // GS V 66 0 (partial cut)
    return this;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  toBase64(): string {
    const bytes = this.toBytes();
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

export class HardwarePrinterAdapter {
  private printSpool: PrintJob[] = [];
  private printerStatus: Record<string, "ONLINE" | "OUT_OF_PAPER" | "OFFLINE"> = {
    kitchen_main: "ONLINE",
    bar_printer: "ONLINE",
    expo_printer: "ONLINE",
    guest_receipt: "ONLINE"
  };

  /**
   * Formats a kitchen production chit for line cooks.
   */
  formatKitchenChit(params: {
    tableLabel: string;
    serverName: string;
    course: string;
    ticketNumber: number;
    items: Array<{ name: string; notes?: string[]; modifiers?: string[]; dinerName?: string }>;
    timestamp: string;
  }): { rawBytesBase64: string; textProjection: string } {
    const builder = new EscPosBuilder();
    builder
      .init()
      .align("center")
      .doubleSize(true)
      .line(`*** ${params.course.toUpperCase()} ***`)
      .doubleSize(false)
      .line(`Table: ${params.tableLabel} | Ticket #${params.ticketNumber}`)
      .line(`Server: ${params.serverName}`)
      .line(`Time: ${params.timestamp.slice(11, 19)}`)
      .align("left")
      .divider("=");

    const textLines: string[] = [
      `*** ${params.course.toUpperCase()} ***`,
      `Table: ${params.tableLabel} | Ticket #${params.ticketNumber}`,
      `Server: ${params.serverName}`,
      "--------------------------------"
    ];

    for (const item of params.items) {
      builder.bold(true).line(`[ ] 1x ${item.name}`).bold(false);
      textLines.push(`[ ] 1x ${item.name}`);

      if (item.dinerName) {
        builder.line(`    For: ${item.dinerName}`);
        textLines.push(`    For: ${item.dinerName}`);
      }

      if (item.modifiers && item.modifiers.length > 0) {
        for (const mod of item.modifiers) {
          builder.line(`    + ${mod}`);
          textLines.push(`    + ${mod}`);
        }
      }

      if (item.notes && item.notes.length > 0) {
        for (const note of item.notes) {
          builder.line(`    * NOTE: ${note}`);
          textLines.push(`    * NOTE: ${note}`);
        }
      }
    }

    builder.divider("-").align("center").line("SIC PIZZA KITCHEN").cut();

    return {
      rawBytesBase64: builder.toBase64(),
      textProjection: textLines.join("\n")
    };
  }

  /**
   * Formats an itemized guest check.
   */
  formatGuestCheck(params: {
    restaurantName: string;
    tableLabel: string;
    serverName: string;
    checkNumber: string;
    items: Array<{ name: string; priceCents: number }>;
    subtotalCents: number;
    taxCents: number;
    tipCents: number;
    totalCents: number;
    joinUrl?: string;
  }): { rawBytesBase64: string; textProjection: string } {
    const builder = new EscPosBuilder();
    builder
      .init()
      .align("center")
      .doubleSize(true)
      .line(params.restaurantName)
      .doubleSize(false)
      .line("Itemized Dining Check")
      .line(`Table: ${params.tableLabel} | Check: ${params.checkNumber}`)
      .line(`Server: ${params.serverName}`)
      .divider("-")
      .align("left");

    const textLines: string[] = [
      params.restaurantName,
      `Table: ${params.tableLabel} | Check: ${params.checkNumber}`,
      "--------------------------------"
    ];

    for (const item of params.items) {
      const priceStr = `$${(item.priceCents / 100).toFixed(2)}`;
      const padding = 32 - item.name.length - priceStr.length;
      const padSpace = " ".repeat(Math.max(1, padding));
      builder.line(`${item.name}${padSpace}${priceStr}`);
      textLines.push(`${item.name}${padSpace}${priceStr}`);
    }

    builder.divider("-");

    const formatRow = (label: string, cents: number) => {
      const valStr = `$${(cents / 100).toFixed(2)}`;
      const pad = 32 - label.length - valStr.length;
      return `${label}${" ".repeat(Math.max(1, pad))}${valStr}`;
    };

    const subtotalRow = formatRow("Subtotal:", params.subtotalCents);
    builder.line(subtotalRow);
    textLines.push(subtotalRow);

    const taxRow = formatRow("Tax:", params.taxCents);
    builder.line(taxRow);
    textLines.push(taxRow);

    if (params.tipCents > 0) {
      const tipRow = formatRow("Tip:", params.tipCents);
      builder.line(tipRow);
      textLines.push(tipRow);
    }
    builder.divider("=");
    const totalRow = formatRow("TOTAL DUE:", params.totalCents);
    builder.bold(true).line(totalRow).bold(false);
    textLines.push(totalRow);


    if (params.joinUrl) {
      builder.feed(1).align("center").line("Pay from your phone:").line(params.joinUrl);
    }

    builder.feed(1).align("center").line("Thank you for dining with us!").cut();

    return {
      rawBytesBase64: builder.toBase64(),
      textProjection: textLines.join("\n")
    };
  }

  /**
   * Spools a print job to the target printer.
   */
  async spoolPrintJob(params: {
    type: "kitchen_ticket" | "guest_check" | "payment_receipt";
    targetPrinter: "kitchen_main" | "bar_printer" | "expo_printer" | "guest_receipt";
    rawBytesBase64: string;
    textProjection: string;
  }): Promise<PrintJob> {
    const printerState = this.printerStatus[params.targetPrinter] || "ONLINE";

    const job: PrintJob = {
      id: `print_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: params.type,
      targetPrinter: params.targetPrinter,
      rawBytesBase64: params.rawBytesBase64,
      textProjection: params.textProjection,
      status: printerState === "ONLINE" ? "PRINTED" : "ERROR",
      error: printerState !== "ONLINE" ? `Printer hardware status: ${printerState}` : undefined,
      createdAt: new Date().toISOString()
    };

    this.printSpool.push(job);
    return job;
  }

  setPrinterStatus(printer: string, status: "ONLINE" | "OUT_OF_PAPER" | "OFFLINE"): void {
    this.printerStatus[printer] = status;
  }

  getSpool(): PrintJob[] {
    return [...this.printSpool];
  }

  reset(): void {
    this.printSpool = [];
    this.printerStatus = {
      kitchen_main: "ONLINE",
      bar_printer: "ONLINE",
      expo_printer: "ONLINE",
      guest_receipt: "ONLINE"
    };
  }
}

// Global server singleton
let globalPrinterAdapter: HardwarePrinterAdapter | null = null;

export function getHardwarePrinterAdapter(): HardwarePrinterAdapter {
  if (!globalPrinterAdapter) {
    globalPrinterAdapter = new HardwarePrinterAdapter();
  }
  return globalPrinterAdapter;
}
