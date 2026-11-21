import { defineConfig, type OxlintOverride } from "oxlint";

const SIGNALS = ["services", "traces", "metrics", "logs"];

const LAYERS = [["utils"], ["telemetry", "query", "ui"], SIGNALS, ["app", "mcp"]];

interface BannedImport {
  name: string;
  importNames: string[];
  message: string;
  allowedIn?: string[];
}

const BANNED_IMPORTS: BannedImport[] = [
  {
    name: "react",
    importNames: ["startTransition", "useTransition"],
    message:
      "OpenTUI renders transitions eagerly and shows fallbacks. " +
      "Defer the state with useDeferredValue.",
  },
  {
    name: "react",
    importNames: ["Suspense"],
    message:
      "One Suspense in app.tsx holds every screen, so a change that suspends keeps the " +
      "previous screen. Regions add no Suspense of their own.",
    allowedIn: ["src/app/app.tsx"],
  },
  {
    name: "react",
    importNames: ["Activity"],
    message: "Keep hidden screens alive with Screen, not visibility flags.",
    allowedIn: ["src/app/screen.tsx"],
  },
  {
    name: "@opentui/keymap/react",
    importNames: ["useBindings"],
    message:
      "Declare keys with <Key name onPress>label</Key> inside KeyHints. " +
      "Key runs onPress through useEffectEvent.",
    allowedIn: ["src/ui/key-hints.tsx", "src/ui/rows.tsx"],
  },
  {
    name: "@opentui/react",
    importNames: ["useKeyboard"],
    message:
      "Declare keys with <Key name onPress>label</Key> inside KeyHints. " +
      "Key runs onPress through useEffectEvent.",
  },
];

function layerPatterns(folder: string) {
  const layer = LAYERS.findIndex((folders) => folders.includes(folder));
  if (layer === -1) {
    return [];
  }

  const above = LAYERS.slice(layer + 1).flat();
  const otherSignals = SIGNALS.includes(folder)
    ? SIGNALS.filter((signal) => signal !== folder)
    : [];
  const group = [...otherSignals, ...above].map((other) => `#${other}/*`);

  return [
    {
      group,
      message:
        "Imports flow one way: utils → telemetry, query, ui → signals → app, mcp. " +
        "A signal never imports another signal or app; app links the views.",
    },
    {
      group: ["../**"],
      message: "Import another folder through its # alias, so the import direction is checked.",
    },
  ];
}

function importsOverride(files: string): OxlintOverride {
  const [, folder = ""] = files.split("/");
  const paths = BANNED_IMPORTS.filter(({ allowedIn = [] }) => !allowedIn.includes(files)).map(
    ({ name, importNames, message }) => ({ name, importNames, message }),
  );

  return {
    files: [files],
    rules: { "no-restricted-imports": ["warn", { paths, patterns: layerPatterns(folder) }] },
  };
}

const FOLDERS = LAYERS.flat().map((folder) => `src/${folder}/**`);

const ALLOWED_FILES = new Set(BANNED_IMPORTS.flatMap(({ allowedIn = [] }) => allowedIn));

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
  overrides: ["**", ...FOLDERS, ...ALLOWED_FILES].map((files) => importsOverride(files)),
});
