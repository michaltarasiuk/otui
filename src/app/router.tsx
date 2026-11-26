import { Activity, createContext, use, useDeferredValue, useState } from "react";

import type { Metric } from "#metrics/metric.ts";
import { isDefined } from "#utils/is-defined.ts";

export type Tab = "services" | "traces" | "metrics" | "logs";

export type To =
  | { page: "services" }
  | { page: "map" }
  | { page: "traces"; service?: string; operation?: string }
  | { page: "trace"; traceId: string; spanId?: string }
  | { page: "compare"; before: string; after: string }
  | { page: "metrics" }
  | { page: "series"; metric: Metric }
  | { page: "logs"; traceId?: string; spanId?: string };

type Page = To["page"];

type Params<P extends Page> = Extract<To, { page: P }>;

const PAGE_TABS: Record<Page, Tab> = {
  services: "services",
  map: "services",
  traces: "traces",
  trace: "traces",
  compare: "traces",
  metrics: "metrics",
  series: "metrics",
  logs: "logs",
};

export interface Location {
  tab: Tab;
  stacks: Record<Tab, To[]>;
}

interface History {
  location: Location;
  previous: Location[];
}

const START_LOCATION: Location = {
  tab: "services",
  stacks: {
    services: [{ page: "services" }],
    traces: [{ page: "traces" }],
    metrics: [{ page: "metrics" }],
    logs: [{ page: "logs" }],
  },
};

function visit({ stacks }: Location, to: To): Location {
  const tab = PAGE_TABS[to.page];
  const stack = stacks[tab];
  const index = stack.findIndex(({ page }) => page === to.page);
  const below = index === -1 ? stack : stack.slice(0, index);
  return { tab, stacks: { ...stacks, [tab]: [...below, to] } };
}

function close({ tab, stacks }: Location): Location {
  return { tab, stacks: { ...stacks, [tab]: stacks[tab].slice(0, -1) } };
}

function canGoBack({ location, previous }: History) {
  return previous.length > 0 || location.stacks[location.tab].length > 1;
}

function back({ location, previous }: History): History {
  const last = previous.at(-1);
  if (!isDefined(last)) {
    return { location: close(location), previous };
  }
  return { location: last, previous: previous.slice(0, -1) };
}

export function useRouter() {
  const [history, setHistory] = useState<History>({ location: START_LOCATION, previous: [] });
  const deferredHistory = useDeferredValue(history);

  return {
    tab: history.location.tab,
    location: deferredHistory.location,
    canGoBack: canGoBack(deferredHistory),
    back: () => {
      setHistory((history) => back(history));
    },
    navigate: (to: To, { replace = false } = {}) => {
      setHistory(({ location, previous }) => ({
        location: visit(location, to),
        previous: replace ? previous : [...previous, location],
      }));
    },
    selectTab: (tab: Tab) => {
      setHistory((history) =>
        tab === history.location.tab
          ? history
          : { location: { ...history.location, tab }, previous: [] },
      );
    },
    reset: () => {
      setHistory(({ location }) => ({
        location: { ...START_LOCATION, tab: location.tab },
        previous: [],
      }));
    },
  };
}

const LocationContext = createContext<Location>(START_LOCATION);

interface RoutesProps {
  location: Location;
  children: React.ReactNode;
}

export function Routes({ location, children }: RoutesProps) {
  return <LocationContext value={location}>{children}</LocationContext>;
}

interface RouteProps<P extends Page> {
  page: P;
  children: (params: Params<P>) => React.ReactNode;
}

export function Route<P extends Page>({ page, children }: RouteProps<P>) {
  const location = use(LocationContext);
  const tab = PAGE_TABS[page];
  const stack = location.stacks[tab];
  const params = stack.find((to): to is Params<P> => to.page === page);
  const visible = location.tab === tab && stack.at(-1) === params;

  if (!isDefined(params)) {
    return null;
  }
  return <Activity mode={visible ? "visible" : "hidden"}>{children(params)}</Activity>;
}
