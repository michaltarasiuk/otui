import { useKeymap } from "@opentui/keymap/react";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, Suspense, useState } from "react";

import { LogsPage } from "#logs/logs-page.tsx";
import { MetricsPage } from "#metrics/metrics-page.tsx";
import { SeriesPage } from "#metrics/series-page.tsx";
import { ServiceMapPage } from "#services/service-map-page.tsx";
import { ServicesPage } from "#services/services-page.tsx";
import { TraceComparePage } from "#traces/trace-compare-page.tsx";
import type { MarkedTrace } from "#traces/trace.ts";
import { TracesPage } from "#traces/traces-page.tsx";
import { WaterfallPage } from "#traces/waterfall-page.tsx";
import { ErrorBoundary } from "#ui/error-boundary.tsx";
import { FocusScope, KeysScope } from "#ui/focus.tsx";
import { AppKeysContext, Key } from "#ui/key-hints.tsx";
import { RegionKeys, useRegion } from "#ui/region.tsx";
import { cycle } from "#utils/cycle.ts";
import { isDefined } from "#utils/is-defined.ts";

import { activeHelp, Help, type HelpEntry } from "./help.tsx";
import { PageError, PageLoading } from "./page-fallback.tsx";
import { ReceiverStatus } from "./receiver-status.tsx";
import { Route, Routes, useRouter } from "./router.tsx";
import { Tabs } from "./tabs.tsx";
import { useEditing } from "./use-editing.ts";
import { Content, TopBar, Window } from "./window.tsx";

const REGIONS = ["tabs", "content"] as const;

interface AppProps {
  httpUrl: string;
  grpcUrl: string;
  mcpUrl?: string | undefined;
  onClear: () => Promise<void>;
}

export function App({ httpUrl, grpcUrl, mcpUrl, onClear }: AppProps) {
  const queryClient = useQueryClient();
  const keymap = useKeymap();
  const editing = useEditing();
  const { tab, location, canGoBack, back, navigate, selectTab, reset } = useRouter();
  const rootBack = canGoBack ? back : undefined;
  const [region, setRegion] = useRegion(REGIONS);
  const [clears, setClears] = useState(0);
  const [help, setHelp] = useState<HelpEntry[]>();
  const [marked, setMarked] = useState<MarkedTrace>();

  async function clear() {
    try {
      await onClear();
    } catch (error) {
      console.error("Clearing telemetry failed", error);
      return;
    }
    reset();
    setMarked(undefined);
    setClears((clears) => clears + 1);
    await queryClient.resetQueries();
  }

  const keys = (
    <>
      {!editing && (
        <>
          <RegionKeys regions={REGIONS} region={region} onChange={(region) => setRegion(region)}>
            next region
          </RegionKeys>
          <Key name="?" onPress={() => setHelp(activeHelp(keymap))}>
            help
          </Key>
        </>
      )}
      <Key name="ctrl+l" description="clear telemetry" onPress={() => clear()} />
    </>
  );

  return (
    <AppKeysContext value={keys}>
      <Window>
        <KeysScope enabled={!isDefined(help)}>
          <TopBar>
            <FocusScope focused={region === "tabs"} onFocusRequest={() => setRegion("tabs")}>
              <Tabs current={tab} onSelect={(tab) => selectTab(tab)} />
            </FocusScope>
            <ReceiverStatus httpUrl={httpUrl} grpcUrl={grpcUrl} mcpUrl={mcpUrl} />
          </TopBar>
          <FocusScope
            key={clears}
            focused={region === "content"}
            onFocusRequest={() => setRegion("content")}
            onStepOut={(step) => setRegion(cycle(REGIONS, "content", step))}
          >
            <Content>
              <Suspense fallback={<PageLoading />}>
                <Routes location={location}>
                  <Route page="services">
                    {() => (
                      <ErrorBoundary fallback={<PageError text="Failed to load services" />}>
                        <ServicesPage
                          onOpenTraces={(service, operation) =>
                            navigate({ page: "traces", service, operation })
                          }
                          onOpenMap={() => navigate({ page: "map" })}
                        />
                      </ErrorBoundary>
                    )}
                  </Route>
                  <Route page="map">
                    {() => (
                      <ErrorBoundary
                        fallback={<PageError text="Failed to load the service map" onBack={back} />}
                      >
                        <ServiceMapPage
                          onOpenTraces={(service) => navigate({ page: "traces", service })}
                          onBack={back}
                        />
                      </ErrorBoundary>
                    )}
                  </Route>
                  <Route page="traces">
                    {({ service, operation }) => (
                      <ErrorBoundary
                        fallback={<PageError text="Failed to load traces" onBack={rootBack} />}
                      >
                        <Fragment key={service}>
                          <TracesPage
                            key={operation}
                            service={service}
                            operation={operation}
                            marked={marked}
                            onServiceChange={(service) =>
                              navigate({ page: "traces", service }, { replace: true })
                            }
                            onOpen={(traceId, spanId) =>
                              navigate({ page: "trace", traceId, spanId })
                            }
                            onMark={(marked) => setMarked(marked)}
                            onCompare={(before, after) =>
                              navigate({ page: "compare", before, after })
                            }
                            onBack={rootBack}
                          />
                        </Fragment>
                      </ErrorBoundary>
                    )}
                  </Route>
                  <Route page="compare">
                    {({ before, after }) => (
                      <ErrorBoundary
                        fallback={<PageError text="Failed to load traces" onBack={back} />}
                      >
                        <Fragment key={before}>
                          <TraceComparePage
                            key={after}
                            before={before}
                            after={after}
                            onBack={back}
                            onOpenTrace={(traceId, spanId) =>
                              navigate({ page: "trace", traceId, spanId })
                            }
                          />
                        </Fragment>
                      </ErrorBoundary>
                    )}
                  </Route>
                  <Route page="trace">
                    {({ traceId, spanId }) => (
                      <ErrorBoundary
                        fallback={<PageError text="Failed to load trace" onBack={back} />}
                      >
                        <Fragment key={traceId}>
                          <WaterfallPage
                            key={spanId}
                            traceId={traceId}
                            spanId={spanId}
                            marked={marked}
                            onBack={back}
                            onMark={(marked) => setMarked(marked)}
                            onCompare={(before, after) =>
                              navigate({ page: "compare", before, after })
                            }
                            onOpenLogs={(spanId) => navigate({ page: "logs", traceId, spanId })}
                            onOpenTrace={(traceId, spanId) =>
                              navigate({ page: "trace", traceId, spanId })
                            }
                          />
                        </Fragment>
                      </ErrorBoundary>
                    )}
                  </Route>
                  <Route page="metrics">
                    {() => (
                      <ErrorBoundary fallback={<PageError text="Failed to load metrics" />}>
                        <MetricsPage onOpen={(metric) => navigate({ page: "series", metric })} />
                      </ErrorBoundary>
                    )}
                  </Route>
                  <Route page="series">
                    {({ metric }) => (
                      <ErrorBoundary
                        fallback={<PageError text="Failed to load metric" onBack={back} />}
                      >
                        <SeriesPage
                          key={metric.metric_id}
                          metric={metric}
                          onBack={back}
                          onOpenTrace={(traceId, spanId) =>
                            navigate({ page: "trace", traceId, spanId })
                          }
                        />
                      </ErrorBoundary>
                    )}
                  </Route>
                  <Route page="logs">
                    {({ traceId, spanId }) => (
                      <ErrorBoundary
                        fallback={<PageError text="Failed to load logs" onBack={rootBack} />}
                      >
                        <LogsPage
                          traceId={traceId}
                          spanId={spanId}
                          onTraceChange={(traceId) =>
                            navigate({ page: "logs", traceId }, { replace: true })
                          }
                          onOpenTrace={(traceId, spanId) =>
                            navigate({ page: "trace", traceId, spanId })
                          }
                          onBack={rootBack}
                        />
                      </ErrorBoundary>
                    )}
                  </Route>
                </Routes>
              </Suspense>
            </Content>
          </FocusScope>
        </KeysScope>
        {isDefined(help) && <Help entries={help} onClose={() => setHelp(undefined)} />}
      </Window>
    </AppKeysContext>
  );
}
