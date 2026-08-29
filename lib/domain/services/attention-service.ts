import type { TableSessionRepository } from "./session-repository";
import type { AttentionConfig, AttentionItem } from "../models/attention";
import { evaluateAttentionRules, DEFAULT_ATTENTION_CONFIG } from "../models/attention";

export class AttentionService {
  private configs: Map<string, AttentionConfig> = new Map();
  private dismissedItemIds: Set<string> = new Set();

  constructor(private readonly repository?: TableSessionRepository) {}

  /**
   * Set or update custom location-specific attention threshold configuration.
   */
  public setLocationConfig(locationId: string, config: Partial<AttentionConfig>): AttentionConfig {
    const merged: AttentionConfig = {
      ...DEFAULT_ATTENTION_CONFIG,
      ...this.configs.get(locationId),
      ...config,
      locationId
    };
    this.configs.set(locationId, merged);
    return merged;
  }

  /**
   * Get location configuration or default fallback.
   */
  public getLocationConfig(locationId: string): AttentionConfig {
    return this.configs.get(locationId) || { ...DEFAULT_ATTENTION_CONFIG, locationId };
  }

  /**
   * Dismiss a non-critical attention item.
   */
  public dismissItem(itemId: string): void {
    this.dismissedItemIds.add(itemId);
  }

  /**
   * Clear all manual dismissals (e.g. at end of service shift).
   */
  public clearDismissals(): void {
    this.dismissedItemIds.clear();
  }

  /**
   * Get currently dismissed item IDs.
   */
  public getDismissedIds(): Set<string> {
    return new Set(this.dismissedItemIds);
  }

  /**
   * Evaluate attention items for a specific location across all active sessions.
   */
  public async getAttentionQueue(
    locationId: string,
    options: {
      assignedEmployeeId?: string;
      now?: Date;
    } = {}
  ): Promise<AttentionItem[]> {
    if (!this.repository) {
      return [];
    }

    const sessions = await this.repository.listActive(locationId);
    const config = this.getLocationConfig(locationId);

    return evaluateAttentionRules(sessions, config, {
      assignedEmployeeId: options.assignedEmployeeId,
      now: options.now,
      dismissedIds: this.dismissedItemIds
    });
  }
}
