import { defineConfig, type OxlintOverride } from "oxlint";

const SIGNALS = ["services", "traces", "metrics", "logs"];

const LAYERS = [["utils"], ["telemetry", "query", "ui"], SIGNALS, ["app", "mcp"]];

function layerOverride(folder: string): OxlintOverride {
  const layer = LAYERS.findIndex((folders) => folders.includes(folder));
  const above = LAYERS.slice(layer + 1).flat();
  const otherSignals = SIGNALS.includes(folder)
    ? SIGNALS.filter((signal) => signal !== folder)
    : [];
  const group = [...otherSignals, ...above].map((other) => `#${other}/*`);

  return {
    files: [`src/${folder}/**`],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group,
              message:
                "Imports flow one way: utils → telemetry, query, ui → signals → app, mcp. " +
                "A signal never imports another signal or app; app links the views.",
            },
            {
              group: ["../**"],
              message:
                "Import another folder through its # alias, so the import direction is checked.",
            },
          ],
        },
      ],
    },
  };
}

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "react", "import"],
  jsPlugins: [{ name: "react-hooks-js", specifier: "eslint-plugin-react-hooks" }],
  options: { denyWarnings: true, typeAware: true },
  settings: { "react-hooks": { additionalEffectHooks: "useBindings" } },
  rules: {
    "import/no-cycle": "warn",
    "import/no-empty-named-blocks": "warn",
    "react-hooks-js/config": "warn",
    "react-hooks-js/error-boundaries": "warn",
    "react-hooks-js/gating": "warn",
    "react-hooks-js/globals": "warn",
    "react-hooks-js/immutability": "warn",
    "react-hooks-js/incompatible-library": "warn",
    "react-hooks-js/preserve-manual-memoization": "warn",
    "react-hooks-js/purity": "warn",
    "react-hooks-js/refs": "warn",
    "react-hooks-js/rules-of-hooks": "warn",
    "react-hooks-js/set-state-in-effect": "warn",
    "react-hooks-js/set-state-in-render": "warn",
    "react-hooks-js/static-components": "warn",
    "react-hooks-js/unsupported-syntax": "warn",
    "react-hooks-js/use-memo": "warn",
    "react-hooks-js/void-use-memo": "warn",
    "react/exhaustive-deps": ["warn", { additionalHooks: "useBindings" }],
    "typescript/consistent-type-definitions": "warn",
    "typescript/restrict-template-expressions": ["warn", { allowNever: true }],
    "typescript/strict-boolean-expressions": ["warn", { allowNullableObject: false }],
    "typescript/use-unknown-in-catch-callback-variable": "warn",
    "unicorn/no-array-callback-reference": "warn",
  },
  overrides: LAYERS.flat().map((folder) => layerOverride(folder)),
});
