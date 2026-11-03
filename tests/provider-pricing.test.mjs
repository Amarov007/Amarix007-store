import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { providerProductKey, providerPriceChanged, providerRetailUnitPrice } from "../admin/js/core/provider-pricing.js";

test("provider rates are converted from per-thousand to one sellable unit", () => {
  assert.equal(providerRetailUnitPrice(1.25, 30), 0.001625);
  assert.equal(providerRetailUnitPrice(1.25, 30, "per_unit"), 1.625);
  assert.equal(providerRetailUnitPrice(1.25, 30, "per_unit", 20), 2.03125);
  assert.equal(providerRetailUnitPrice(0.025, 30), 0.0000325);
});

test("provider pricing keeps precision for very small SMM prices", () => {
  assert.equal(providerRetailUnitPrice(0.0025, 30), 0.00000325);
  assert.equal(providerRetailUnitPrice(0.0002, 30), 0.00000026);
  assert.equal(providerRetailUnitPrice(0.0002, 30, "per_unit"), 0.00026);
  assert.equal(providerRetailUnitPrice(0.0002, 30, "per_unit", 50), 0.00052);
  assert.equal(providerRetailUnitPrice(1, 30, "per_unit", 100), 0);
});

test("invalid provider prices and margins fail closed", () => {
  for (const rate of [0, -1, null, undefined, "NaN", Infinity]) {
    assert.equal(providerRetailUnitPrice(rate, 30), 0);
  }
  for (const margin of [-1, 501, "NaN", Infinity]) {
    assert.equal(providerRetailUnitPrice(1, margin), 0);
  }
});

test("price drift comparison ignores floating point noise but detects real changes", () => {
  assert.equal(providerPriceChanged(0.0000325, 0.0000325000000001), false);
  assert.equal(providerPriceChanged(0.0000325, 0.00004), true);
  assert.equal(providerPriceChanged(0, 0.001), false);
});

test("provider product matching includes provider, service, and country", () => {
  assert.equal(providerProductKey("smmne", "123", "US"), "smmne|123|US");
  assert.notEqual(providerProductKey("smmne", "123", "US"), providerProductKey("main", "123", "US"));
  assert.notEqual(providerProductKey("smmne", "123", "US"), providerProductKey("smmne", "123", "GB"));
});


test("admin provider import module has valid JavaScript syntax", async () => {
  const src = await readFile(new URL("../admin/js/modules/import-center.js", import.meta.url), "utf8");
  const result = ts.transpileModule(src, {
    compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true
  });
  const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
});
