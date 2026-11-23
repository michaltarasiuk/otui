import { expect, test } from "bun:test";

import { serviceMap } from "./service-map.ts";
import type { Call } from "./service.ts";

function call(caller: string, callee: string, is_external = false): Call {
  return {
    call_id: `${caller}>${callee}`,
    caller,
    callee,
    is_external,
    span_count: 1,
    rate: 1,
    error_ratio: 0,
    p50_ms: 1,
    p95_ms: 1,
    p99_ms: 1,
  };
}

function outline(calls: Call[]) {
  return serviceMap(calls).map(
    (node) => `${"  ".repeat(node.depth)}${node.name}${node.isCycle ? " ↻" : ""}`,
  );
}

test("starts from the services nobody calls and nests each call under its caller", () => {
  const calls = [
    call("service-b", "peer-a", true),
    call("service-c", "service-b"),
    call("service-c", "service-d"),
    call("service-a", "service-b"),
    call("service-a", "service-c"),
  ];

  expect(outline(calls)).toEqual([
    "service-a",
    "  service-b",
    "    peer-a",
    "  service-c",
    "    service-b",
    "      peer-a",
    "    service-d",
  ]);
});

test("stops at a call back into the path and still shows services only reached by a cycle", () => {
  const calls = [call("a", "b"), call("b", "a")];

  expect(outline(calls)).toEqual(["a", "  b", "    a ↻"]);
});

test("does not treat an external peer named like a service as a call into it", () => {
  const calls = [call("service-a", "service-b", true), call("service-b", "peer-a", true)];

  expect(outline(calls)).toEqual(["service-a", "  service-b", "service-b", "  peer-a"]);
});

test("gives each node a unique id even when a service shows up twice", () => {
  const calls = [call("a", "c"), call("b", "c"), call("c", "d")];
  const ids = serviceMap(calls).map((node) => node.id);

  expect(new Set(ids).size).toBe(ids.length);
});
