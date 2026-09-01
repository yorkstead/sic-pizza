/**
 * Client-side Durable Command Outbox & Offline Transaction Processor.
 * Persists queued mutations with durable idempotency keys across page reloads and connectivity drops.
 */

export type OutboxCommandStatus =
  | "QUEUED"
  | "IN_FLIGHT"
  | "UNKNOWN_OUTCOME"
  | "SYNCED"
  | "REJECTED";

export interface QueuedCommand<T = unknown> {
  id: string;
  idempotencyKey: string;
  endpoint: string;
  method: "POST" | "PUT" | "DELETE" | "PATCH";
  headers: Record<string, string>;
  payload: T;
  actionName: string;
  sessionId?: string;
  description: string;
  status: OutboxCommandStatus;
  createdAt: string;
  lastAttemptAt?: string;
  retryCount: number;
  error?: string;
  response?: unknown;
}

export type OutboxListener = (commands: QueuedCommand[]) => void;

const STORAGE_KEY = "sic_pizza_command_outbox_v1";

export class CommandOutbox {
  private commands: QueuedCommand[] = [];
  private listeners = new Set<OutboxListener>();
  private isProcessing = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.commands = JSON.parse(raw);
      }
    } catch (err) {
      console.error("Failed to load command outbox from storage:", err);
      this.commands = [];
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.commands));
    } catch (err) {
      console.error("Failed to persist command outbox to storage:", err);
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener([...this.commands]);
      } catch (err) {
        console.error("Error in outbox listener:", err);
      }
    }
  }

  subscribe(listener: OutboxListener): () => void {
    this.listeners.add(listener);
    listener([...this.commands]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getCommands(): QueuedCommand[] {
    return [...this.commands];
  }

  getPendingCount(): number {
    return this.commands.filter(
      (c) => c.status === "QUEUED" || c.status === "IN_FLIGHT" || c.status === "UNKNOWN_OUTCOME"
    ).length;
  }

  /**
   * Enqueues a new command with a deterministic idempotency key.
   */
  enqueue<T>(params: {
    endpoint: string;
    actionName: string;
    description: string;
    payload: T;
    sessionId?: string;
    token?: string | null;
    method?: "POST" | "PUT" | "DELETE" | "PATCH";
    headers?: Record<string, string>;
  }): QueuedCommand<T> {
    const id = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = `idem_${id}_${Date.now()}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(params.headers || {})
    };

    if (params.token) {
      headers["Authorization"] = params.token.startsWith("Bearer ")
        ? params.token
        : `Bearer ${params.token}`;
    }

    const command: QueuedCommand<T> = {
      id,
      idempotencyKey,
      endpoint: params.endpoint,
      method: params.method || "POST",
      headers,
      payload: params.payload,
      actionName: params.actionName,
      sessionId: params.sessionId,
      description: params.description,
      status: "QUEUED",
      createdAt: new Date().toISOString(),
      retryCount: 0
    };

    this.commands.push(command as QueuedCommand);
    this.saveToStorage();
    return command;
  }

  /**
   * Processes all pending commands in the outbox sequentially.
   */
  async processOutbox(
    customFetch?: typeof fetch
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.isProcessing) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    this.isProcessing = true;
    const fetchFn = customFetch || (typeof fetch !== "undefined" ? fetch : undefined);

    if (!fetchFn) {
      this.isProcessing = false;
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      for (const cmd of this.commands) {
        if (cmd.status === "SYNCED" || cmd.status === "REJECTED") continue;

        processed++;
        cmd.status = "IN_FLIGHT";
        cmd.lastAttemptAt = new Date().toISOString();
        cmd.retryCount++;
        this.saveToStorage();

        try {
          const bodyPayload = typeof cmd.payload === "object" && cmd.payload !== null
            ? { ...cmd.payload, action: cmd.actionName, idempotencyKey: cmd.idempotencyKey }
            : { action: cmd.actionName, payload: cmd.payload, idempotencyKey: cmd.idempotencyKey };


          const res = await fetchFn(cmd.endpoint, {
            method: cmd.method,
            headers: cmd.headers,
            body: JSON.stringify(bodyPayload)
          });

          if (res.ok) {
            cmd.status = "SYNCED";
            cmd.response = await res.json().catch(() => ({}));
            succeeded++;
          } else if (res.status === 409) {
            // Conflict / Duplicate rejection
            const errData = await res.json().catch(() => ({}));
            cmd.status = "REJECTED";
            cmd.error = errData.error || "Conflict: Command rejected by server.";
            failed++;
          } else if (res.status >= 400 && res.status < 500) {
            // Client error - fatal, cannot retry as is
            const errData = await res.json().catch(() => ({}));
            cmd.status = "REJECTED";
            cmd.error = errData.error || `Server error (${res.status})`;
            failed++;
          } else {
            // 5xx or server gateway timeout
            cmd.status = "UNKNOWN_OUTCOME";
            cmd.error = `Server unavailable (${res.status}). Will retry.`;
            failed++;
          }
        } catch (netErr: unknown) {
          // Network drop / fetch failure
          cmd.status = "UNKNOWN_OUTCOME";
          cmd.error = netErr instanceof Error ? netErr.message : "Network request failed";
          failed++;
        }

        this.saveToStorage();
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, succeeded, failed };
  }

  /**
   * Retries a specific rejected or failed command.
   */
  retry(commandId: string): void {
    const cmd = this.commands.find((c) => c.id === commandId);
    if (cmd) {
      cmd.status = "QUEUED";
      cmd.error = undefined;
      this.saveToStorage();
    }
  }

  /**
   * Clears all synced commands from the queue.
   */
  clearSynced(): void {
    this.commands = this.commands.filter((c) => c.status !== "SYNCED");
    this.saveToStorage();
  }

  /**
   * Clears a specific command by ID.
   */
  remove(commandId: string): void {
    this.commands = this.commands.filter((c) => c.id !== commandId);
    this.saveToStorage();
  }

  /**
   * Resets the entire outbox (for test harnesses).
   */
  reset(): void {
    this.commands = [];
    this.saveToStorage();
  }
}

// Global client singleton
let globalOutbox: CommandOutbox | null = null;

export function getCommandOutbox(): CommandOutbox {
  if (!globalOutbox) {
    globalOutbox = new CommandOutbox();
  }
  return globalOutbox;
}
