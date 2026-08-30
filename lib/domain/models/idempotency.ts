import { z } from "zod";

export const mutationStatusSchema = z.enum(["pending", "synced", "failed", "retrying"]);
export type MutationStatus = z.infer<typeof mutationStatusSchema>;

export const connectivityStateSchema = z.enum(["online", "offline", "syncing"]);
export type ConnectivityState = z.infer<typeof connectivityStateSchema>;

export const mutationEnvelopeSchema = z.object({
  idempotencyKey: z.string().min(1),
  sessionId: z.string(),
  mutationType: z.string(),
  payload: z.record(z.string(), z.any()),
  baseSessionVersion: z.number().int().nonnegative().optional(),
  status: mutationStatusSchema.default("pending"),
  retryCount: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().positive().default(5),
  createdAt: z.string(),
  lastAttemptAt: z.string().optional(),
  error: z.string().optional(),
  response: z.record(z.string(), z.any()).optional()
});
export type MutationEnvelope = z.infer<typeof mutationEnvelopeSchema>;

export interface TransportAdapter {
  sendMutation(mutation: MutationEnvelope): Promise<{ success: boolean; data?: unknown; error?: string; cached?: boolean }>;
}

export type MutationExecutor = (mutation: MutationEnvelope) => Promise<{ success: boolean; data?: unknown; error?: string; cached?: boolean }>;

/**
 * Client-Side Persistent / In-Memory Mutation Queue
 * Guarantees that unstable Wi-Fi disconnects do not lose server actions or fire duplicate kitchen tickets.
 */
export class ClientMutationQueue {
  private queue: MutationEnvelope[] = [];
  private connectivity: ConnectivityState = "online";
  private listeners: Array<(mutations: readonly MutationEnvelope[], state: ConnectivityState) => void> = [];

  constructor(initialMutations: MutationEnvelope[] = []) {
    this.queue = [...initialMutations];
  }

  public getQueue(): readonly MutationEnvelope[] {
    return [...this.queue];
  }

  public getConnectivity(): ConnectivityState {
    return this.connectivity;
  }

  public setConnectivity(state: ConnectivityState): void {
    this.connectivity = state;
    this.notify();
  }

  public subscribe(listener: (mutations: readonly MutationEnvelope[], state: ConnectivityState) => void): () => void {
    this.listeners.push(listener);
    listener(this.getQueue(), this.connectivity);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const queueCopy = this.getQueue();
    for (const listener of this.listeners) {
      listener(queueCopy, this.connectivity);
    }
  }

  public enqueue(
    mutationType: string,
    sessionId: string,
    payload: Record<string, unknown>,
    baseSessionVersion?: number,
    customIdempotencyKey?: string
  ): MutationEnvelope {
    const idempotencyKey = customIdempotencyKey || `mut_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const mutation: MutationEnvelope = {
      idempotencyKey,
      sessionId,
      mutationType,
      payload,
      baseSessionVersion,
      status: "pending",
      retryCount: 0,
      maxRetries: 5,
      createdAt: new Date().toISOString()
    };

    this.queue.push(mutation);
    this.notify();
    return mutation;
  }

  public async flush(executor: MutationExecutor): Promise<{ synced: number; failed: number }> {
    if (this.connectivity === "offline") {
      return { synced: 0, failed: 0 };
    }

    this.setConnectivity("syncing");
    let synced = 0;
    let failed = 0;

    const pendingMutations = this.queue.filter((m) => m.status === "pending" || m.status === "retrying");

    for (const mutation of pendingMutations) {
      mutation.lastAttemptAt = new Date().toISOString();
      try {
        const result = await executor(mutation);
        if (result.success) {
          mutation.status = "synced";
          mutation.response = result.data as Record<string, unknown> | undefined;
          synced += 1;
        } else {
          mutation.retryCount += 1;
          mutation.error = result.error || "Mutation execution rejected";
          if (mutation.retryCount >= mutation.maxRetries) {
            mutation.status = "failed";
            failed += 1;
          } else {
            mutation.status = "retrying";
          }
        }
      } catch (err: unknown) {
        mutation.retryCount += 1;
        mutation.error = err instanceof Error ? err.message : String(err);
        if (mutation.retryCount >= mutation.maxRetries) {
          mutation.status = "failed";
          failed += 1;
        } else {
          mutation.status = "retrying";
        }
      }
      this.notify();
    }

    this.setConnectivity(this.queue.some((m) => m.status === "failed") ? "offline" : "online");
    return { synced, failed };
  }

  public clearSynced(): void {
    this.queue = this.queue.filter((m) => m.status !== "synced");
    this.notify();
  }

  public clearAll(): void {
    this.queue = [];
    this.notify();
  }
}
