import path from "node:path";

import { definePlugin, defineRule, type Ranged } from "@oxlint/plugins";

interface ImportDirectionOptions {
  /** The folder that holds the layered folders, relative to the repo root. */
  root: string;
  /** Folders from the bottom layer up. A folder imports its own layer and the layers below it. */
  layers: string[][];
  /** Folders that never import each other, even within one layer. */
  isolated?: string[];
  /** Folders that only test files import. */
  testOnly?: string[];
}

const importDirection = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Keep imports between folders flowing one way, through # aliases." },
    messages: {
      upward:
        "{{from}} cannot import #{{to}}, which sits above it. Imports flow one way: {{flow}}.",
      isolated: "{{from}} and {{to}} never import each other. A folder above both links them.",
      relative: "Import another folder through its # alias, so the import direction is checked.",
      testOnly: "Only test files import #{{to}}.",
    },
    schema: [
      {
        type: "object",
        properties: {
          root: { type: "string" },
          layers: { type: "array", items: { type: "array", items: { type: "string" } } },
          isolated: { type: "array", items: { type: "string" } },
          testOnly: { type: "array", items: { type: "string" } },
        },
        required: ["root", "layers"],
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const [options] = context.options as unknown as [ImportDirectionOptions];
    const { root, layers, isolated = [], testOnly = [] } = options;

    const [from = ""] = path
      .relative(path.resolve(import.meta.dirname, root), context.filename)
      .split(path.sep);
    if (from === "..") {
      return {};
    }

    const layerOf = new Map(
      layers.flatMap((folders, layer) => folders.map((folder) => [folder, layer] as const)),
    );
    const fromLayer = layerOf.get(from);
    const inTest = /\.test\.tsx?$/.test(context.filename);

    const check = (specifier: string, node: Ranged) => {
      if (fromLayer !== undefined && specifier.startsWith("../")) {
        context.report({ node, messageId: "relative" });
        return;
      }

      const to = /^#([^/]+)\//.exec(specifier)?.[1];
      if (to === undefined || to === from) {
        return;
      }

      if (testOnly.includes(to)) {
        if (!inTest) {
          context.report({ node, messageId: "testOnly", data: { to } });
        }
        return;
      }

      const toLayer = layerOf.get(to);
      if (fromLayer === undefined || toLayer === undefined) {
        return;
      }

      if (toLayer > fromLayer) {
        const flow = layers.map((folders) => folders.join(", ")).join(" → ");
        context.report({ node, messageId: "upward", data: { from, to, flow } });
      } else if (isolated.includes(from) && isolated.includes(to)) {
        context.report({ node, messageId: "isolated", data: { from, to } });
      }
    };

    return {
      ImportDeclaration({ source }) {
        check(source.value, source);
      },
      ExportNamedDeclaration({ source }) {
        if (source !== null) {
          check(source.value, source);
        }
      },
      ExportAllDeclaration({ source }) {
        check(source.value, source);
      },
      ImportExpression({ source }) {
        if (source.type === "Literal" && typeof source.value === "string") {
          check(source.value, source);
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: "local" },
  rules: { "import-direction": importDirection },
});
