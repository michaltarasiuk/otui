import type { ScrollBoxRenderable } from "@opentui/core";
import { useQuery, useSuspenseQueries } from "@tanstack/react-query";
import { useDeferredValue, useRef, useState } from "react";

import { useConnection } from "#query/connection.ts";
import { CopyKey } from "#ui/clipboard.tsx";
import { FocusScope } from "#ui/focus.tsx";
import { ErrorKeys, Key, KeyHints, ListKeys, StepKeys } from "#ui/key-hints.tsx";
import { PageHeader } from "#ui/page-header.tsx";
import { PauseKey } from "#ui/pause.tsx";
import { Placeholder } from "#ui/placeholder.tsx";
import { RegionKeys, useRegion } from "#ui/region.tsx";
import { ScrollKeys } from "#ui/scroll-box.tsx";
import { SearchInput } from "#ui/search-input.tsx";
import { SearchKeys } from "#ui/search-keys.tsx";
import { Split } from "#ui/split.tsx";
import { useSearch } from "#ui/use-search.ts";
import { useSelection } from "#ui/use-selection.ts";
import { around } from "#utils/cycle.ts";
import { isDefined } from "#utils/is-defined.ts";
import { toggle } from "#utils/set.ts";

import { canOpenLink, LinkList } from "./link-list.tsx";
import { MarkKeys } from "./mark-keys.tsx";
import { SpanDetails } from "./span-details.tsx";
import {
  criticalPath,
  descendantCount,
  expandTo,
  hiddenCounts,
  traceDuration,
  visibleSpans,
} from "./span-tree.ts";
import { SpanWaterfall } from "./span-waterfall.tsx";
import type { Span, SpanLink } from "./span.ts";
import { TraceHeader } from "./trace-header.tsx";
import { spanContentQuery, spanMatchesQuery, traceSpansQuery } from "./trace-queries.ts";
import type { MarkedTrace } from "./trace.ts";

interface WaterfallPageProps {
  traceId: string;
  spanId: string | undefined;
  marked: MarkedTrace | undefined;
  onBack: () => void;
  onMark: (marked: MarkedTrace | undefined) => void;
  onCompare: (before: string, after: string) => void;
  onOpenLogs: (spanId?: string) => void;
  onOpenTrace: (traceId: string, spanId: string) => void;
}

export function WaterfallPage({
  traceId,
  spanId,
  marked,
  onBack,
  onMark,
  onCompare,
  onOpenLogs,
  onOpenTrace,
}: WaterfallPageProps) {
  const connection = useConnection();
  const search = useSearch();
  const [jumping, setJumping] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const detailsRef = useRef<ScrollBoxRenderable>(null);

  const [traceSpans, spanMatches] = useSuspenseQueries({
    queries: [
      traceSpansQuery(connection, traceId),
      spanMatchesQuery(connection, traceId, search.deferredText),
    ],
  });
  const { data: spans } = traceSpans;
  const { data: matches } = spanMatches;
  const [root] = spans;
  const durationMs = traceDuration(spans);
  const onCriticalPath = showCriticalPath ? criticalPath(spans) : undefined;
  const highlighted =
    isDefined(onCriticalPath) && isDefined(matches)
      ? onCriticalPath.intersection(matches)
      : (onCriticalPath ?? matches ?? undefined);

  const shown = visibleSpans(spans, collapsed);
  const selection = useSelection(shown, (span) => span.span_id, spanId);
  const { selected } = selection;
  const deferredSelected = useDeferredValue(selected);

  function selectSpan(spanId: string) {
    setCollapsed((collapsed) => expandTo(spans, collapsed, spanId));
    selection.select(spanId);
  }

  function selectFirstMatch(candidates: Span[]) {
    const match = candidates.find((span) => matches?.has(span.span_id) === true);
    if (isDefined(match)) {
      selectSpan(match.span_id);
    }
  }

  if (jumping && search.deferredText === search.text && isDefined(selected)) {
    setJumping(false);
    selectFirstMatch([selected, ...around(spans, selected, 1)]);
  }

  const selectedSpanId = deferredSelected?.span_id;
  const spanContentOptions = spanContentQuery(connection, traceId, selectedSpanId);
  const spanContent = useQuery({ ...spanContentOptions, enabled: isDefined(selectedSpanId) });
  const links = spanContent.data?.links ?? [];
  const linkSelection = useSelection(links, (link) => link.span_id);
  const link = linkSelection.selected;

  const regions = links.length > 0 ? (["spans", "links"] as const) : (["spans"] as const);
  const [region, setRegion] = useRegion(regions);

  function openLink(link: SpanLink) {
    if (link.trace_id === traceId) {
      selectSpan(link.span_id);
      setRegion("spans");
    } else {
      onOpenTrace(link.trace_id, link.span_id);
    }
  }

  const browsing = !search.isEditing;

  return (
    <box flexGrow={1}>
      {traceSpans.isError ? (
        <Placeholder text="Failed to load trace" variant="error" />
      ) : !isDefined(root) || !isDefined(deferredSelected) ? (
        <Placeholder text="This trace is no longer available" />
      ) : (
        <>
          <PageHeader>
            <TraceHeader
              traceId={traceId}
              root={root}
              spans={spans}
              matchCount={matches?.size}
              durationMs={durationMs}
            />
          </PageHeader>
          <Split>
            <FocusScope
              focused={browsing && region === "spans"}
              onFocusRequest={() => setRegion("spans")}
            >
              <SpanWaterfall
                selection={selection}
                traceDurationMs={durationMs}
                hiddenCounts={hiddenCounts(spans, collapsed)}
                highlighted={highlighted}
              />
            </FocusScope>
            <SpanDetails
              key={deferredSelected.span_id}
              ref={detailsRef}
              traceId={traceId}
              span={deferredSelected}
            >
              <FocusScope
                focused={browsing && region === "links"}
                onFocusRequest={() => setRegion("links")}
              >
                <LinkList traceId={traceId} selection={linkSelection} />
              </FocusScope>
            </SpanDetails>
          </Split>
        </>
      )}
      <KeyHints>
        <SearchInput search={search} placeholder="span name, service, attribute or key=value" />
        <SearchKeys search={search} onApply={() => setJumping(true)} />
        <FocusScope focused={browsing}>
          {search.text === "" && (
            <Key name="escape" onPress={() => onBack()}>
              back
            </Key>
          )}
          <Key name="l" onPress={() => onOpenLogs()}>
            logs
          </Key>
          {isDefined(root) && (
            <MarkKeys
              trace={{ traceId, root: { service_name: root.service_name, name: root.name } }}
              marked={marked}
              onMark={(marked) => onMark(marked)}
              onCompare={(before, after) => onCompare(before, after)}
            />
          )}
          {isDefined(selected) && (
            <>
              <FocusScope focused={region === "spans"}>
                <Key
                  name="shift+l"
                  description="logs of the selected span"
                  onPress={() => onOpenLogs(selected.span_id)}
                />
                {isDefined(matches) && matches.size > 0 && (
                  <StepKeys
                    forward="n"
                    backward="shift+n"
                    backwardDescription="previous match"
                    onStep={(step) => selectFirstMatch(around(spans, selected, step))}
                  >
                    next match
                  </StepKeys>
                )}
                {shown.some((span) => span.is_error) && (
                  <ErrorKeys onStep={(step) => selection.jump(step, (span) => span.is_error)} />
                )}
                {descendantCount(spans, spans.indexOf(selected)) > 0 && (
                  <Key
                    name="space"
                    description={
                      collapsed.has(selected.span_id)
                        ? "expand the span's children"
                        : "collapse the span's children"
                    }
                    onPress={() => setCollapsed((collapsed) => toggle(collapsed, selected.span_id))}
                  >
                    {collapsed.has(selected.span_id) ? "unfold" : "fold"}
                  </Key>
                )}
                <Key
                  name="c"
                  description={showCriticalPath ? "show every span" : "highlight the critical path"}
                  onPress={() => setShowCriticalPath((show) => !show)}
                >
                  {showCriticalPath ? "all spans" : "critical"}
                </Key>
                <CopyKey name="y" text={selected.span_id} description="copy the span's ID">
                  copy id
                </CopyKey>
                <CopyKey name="shift+y" text={traceId} description="copy the trace's ID" />
              </FocusScope>
              <ScrollKeys target={detailsRef} />
            </>
          )}
          <FocusScope focused={region === "links"}>
            <ListKeys
              description="next link"
              backwardDescription="previous link"
              onStep={(step) => linkSelection.move(step)}
            />
            {isDefined(link) && canOpenLink(link, traceId, spans) && (
              <Key name="return" onPress={() => openLink(link)}>
                open link
              </Key>
            )}
          </FocusScope>
        </FocusScope>
        <FocusScope focused={browsing}>
          <PauseKey />
          <RegionKeys regions={regions} region={region} onChange={(region) => setRegion(region)} />
        </FocusScope>
      </KeyHints>
    </box>
  );
}
