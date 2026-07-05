import { describe, expect, it } from "bun:test";
import type { ModelRegistry, PiModel } from "../adapter/pi-sdk.ts";
import { listPiModels, resolvePiModel } from "../adapter/pi-sdk.ts";

function makeModel(provider: string, id: string, _available?: boolean, opts?: Partial<PiModel>): PiModel {
  return { provider, id, name: id, reasoning: false, input: ["text"], ...opts };
}

function mockRegistry(models: PiModel[]): ModelRegistry {
  return {
    getAll: () => models,
    getAvailable: () => models,
    find: (provider: string, modelId: string) =>
      models.find(m => m.provider === provider && m.id === modelId),
  };
}

describe("listPiModels", () => {
  it("returns all and available models", () => {
    const models = [makeModel("anthropic", "claude", true)];
    const registry = {
      getAll: () => models,
      getAvailable: () => models,
      find: () => models[0]!,
    };
    const result = listPiModels(registry);
    expect(result.all.length).toBe(1);
    expect(result.available.length).toBe(1);
    expect(result.all[0]!.provider).toBe("anthropic");
    expect(result.all[0]!.modelId).toBe("claude");
    expect(result.all[0]!.available).toBe(true);
  });

  it("marks unavailable models correctly", () => {
    const all = [makeModel("openai", "gpt", false)];
    const registry = {
      getAll: () => all,
      getAvailable: () => [] as PiModel[],
      find: () => all[0]!,
    };
    const result = listPiModels(registry);
    expect(result.all[0]!.available).toBe(false);
    expect(result.available.length).toBe(0);
  });
});

describe("resolvePiModel", () => {
  it("returns current model when strategy is 'current'", () => {
    const current = makeModel("deepseek", "v4", true);
    const registry = mockRegistry([current]);
    const result = resolvePiModel(registry, current, { strategy: "current" });
    expect(result.provider).toBe("deepseek");
    expect(result.id).toBe("v4");
  });

  it("throws when strategy is 'current' but no current model", () => {
    const registry = mockRegistry([makeModel("deepseek", "v4", true)]);
    expect(() => resolvePiModel(registry, undefined, { strategy: "current" }))
      .toThrow("No current PI model is active");
  });

  it("returns specific model by provider and modelId", () => {
    const target = makeModel("anthropic", "sonnet", true);
    const registry = mockRegistry([
      makeModel("deepseek", "v4", true),
      target,
    ]);
    const result = resolvePiModel(registry, undefined, {
      strategy: "specific",
      provider: "anthropic",
      modelId: "sonnet",
    });
    expect(result.provider).toBe("anthropic");
    expect(result.id).toBe("sonnet");
  });

  it("throws when specific model not found", () => {
    const registry = mockRegistry([makeModel("deepseek", "v4", true)]);
    expect(() => resolvePiModel(registry, undefined, {
      strategy: "specific",
      provider: "unknown",
      modelId: "missing",
    })).toThrow("Model not found");
  });

  it("uses current model for default strategy when available", () => {
    const current = makeModel("deepseek", "v4", true);
    const registry = mockRegistry([current, makeModel("anthropic", "claude", true)]);
    const result = resolvePiModel(registry, current, undefined);
    expect(result.provider).toBe("deepseek");
  });

  it("falls back to first available for default strategy", () => {
    const first = makeModel("anthropic", "claude", true);
    const registry = mockRegistry([first, makeModel("deepseek", "v4", true)]);
    const result = resolvePiModel(registry, undefined, undefined);
    expect(result.provider).toBe("anthropic");
  });

  it("throws when default strategy and no models available", () => {
    const registry = {
      getAll: () => [] as PiModel[],
      getAvailable: () => [] as PiModel[],
      find: () => undefined,
    };
    expect(() => resolvePiModel(registry, undefined, undefined))
      .toThrow("No PI model with configured auth is available");
  });
});
