import { test, expect } from "@playwright/test";
import { modelsByProvider, setAdminCatalog, setCustomModels, ALL_MODELS, modelKey } from "../../src/config/models";
import { isCodeModel, isReasoningModel, isVisionModel } from "../../src/lib/modelPrefs";
import type { ModelDef } from "../../src/types";

test.afterEach(() => {
  setAdminCatalog([], []);
  setCustomModels([]);
});

const flat = () => Object.values(modelsByProvider()).flat();

test("built-in catalog has no duplicate keys", () => {
  const keys = flat().map(modelKey);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys.length).toBe(ALL_MODELS.length);
});

test("an admin copy of a built-in (same provider and name, different id) is listed once", () => {
  const base = ALL_MODELS[0];
  const copy: ModelDef = { ...base, modelId: `${base.modelId}-copy`, displayName: ` ${base.displayName.toUpperCase()} ` };
  setAdminCatalog([copy], []);
  const same = flat().filter((m) => m.provider === base.provider && m.displayName.trim().toLowerCase() === base.displayName.toLowerCase());
  expect(same).toHaveLength(1);
  expect(same[0].modelId).toBe(base.modelId); // the built-in wins
});

test("same display name under a different provider is a different model", () => {
  const base = ALL_MODELS[0];
  setCustomModels([{ ...base, provider: "custom", modelId: "my-copy", isCustom: true }]);
  expect(flat().filter((m) => m.displayName === base.displayName)).toHaveLength(2);
});

test("capability helpers", () => {
  const m = (over: Partial<ModelDef>): ModelDef => ({ ...ALL_MODELS[0], capabilities: ["text"], supportsVision: false, ...over });
  expect(isVisionModel(m({ supportsVision: true }))).toBe(true);
  expect(isVisionModel(m({ capabilities: ["text", "vision"] }))).toBe(true);
  expect(isReasoningModel(m({ capabilities: ["reasoning"] }))).toBe(true);
  expect(isCodeModel(m({ capabilities: ["code"] }))).toBe(true);
  expect(isCodeModel(m({ modelId: "qwen/qwen3-coder:free", displayName: "Qwen3 Coder" }))).toBe(true);
  expect(isCodeModel(m({ modelId: "x/plain-chat", displayName: "Plain Chat" }))).toBe(false);
});
