import { useSuspenseQueries } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { useConnection } from "#query/connection.ts";
import { CopyKey } from "#ui/clipboard.tsx";
import { FocusScope } from "#ui/focus.tsx";
import { JumpKeys, Key, KeyHints } from "#ui/key-hints.tsx";
import { PageHeader } from "#ui/page-header.tsx";
import { PauseKey } from "#ui/pause.tsx";
import { Placeholder } from "#ui/placeholder.tsx";
import { RegionKeys, useRegion } from "#ui/region.tsx";
import { Split } from "#ui/split.tsx";
import { useSelection } from "#ui/use-selection.ts";
import { isDefined } from "#utils/is-defined.ts";

import { OperationDiffTable } from "./operation-diff-table.tsx";
import { SpanDiffTable } from "./span-diff-table.tsx";
import {
  diffOperations,
  diffSpans,
  hasChanged,
  isAddedOrRemoved,
  operationDelta,
  selfDelta,
  type SpanDiff,
} from "./span-diff.ts";
import { TraceCompareHeader } from "./trace-compare-header.tsx";
import { traceSpansQuery } from "./trace-queries.ts";

const REGIONS = ["spans", "operations"] as const;

interface TraceComparePageProps {
  before: string;
  after: string;
  onBack: () => void;
  onOpenTrace: (traceId: string, spanId: string) => void;
}

export function TraceComparePage({ before, after, onBack, onOpenTrace }: TraceComparePageProps) {
  const connection = useConnection();
  const [swapped, setSwapped] = useState(false);
  const deferredSwapped = useDeferredValue(swapped);
  const [changedOnly, setChangedOnly] = useState(false);

  const [beforeId, afterId] = deferredSwapped ? [after, before] : [before, after];

  const [beforeSpans, afterSpans] = useSuspenseQueries({
    queries: [traceSpansQuery(connection, beforeId), traceSpansQuery(connection, afterId)],
  });
  const [root] = afterSpans.data;

  const allRows = diffSpans(beforeSpans.data, afterSpans.data);
  const rows = changedOnly ? allRows.filter((row) => hasChanged(row)) : allRows;
  const selection = useSelection(rows, (row) => row.id);
  const { selected } = selection;

  const operations = diffOperations(beforeSpans.data, afterSpans.data);
  const operationSelection = useSelection(operations, (operation) => operation.id);

  const maxDeltaMs = Math.max(
    allRows.reduce((max, row) => Math.max(max, Math.abs(selfDelta(row))), 0),
    operations.reduce((max, operation) => Math.max(max, Math.abs(operationDelta(operation))), 0),
  );

  const [region, setRegion] = useRegion(REGIONS);

  function openSlower({ before, after }: SpanDiff) {
    if (isDefined(after) && (!isDefined(before) || after.duration_ms >= before.duration_ms)) {
      onOpenTrace(afterId, after.span_id);
    } else if (isDefined(before)) {
      onOpenTrace(beforeId, before.span_id);
    }
  }

  return (
    <box flexGrow={1}>
      {beforeSpans.isError || afterSpans.isError ? (
        <Placeholder text="Failed to load traces" variant="error" />
      ) : !isDefined(root) || beforeSpans.data.length === 0 ? (
        <Placeholder text="A compared trace is no longer available" />
      ) : (
        <>
          <PageHeader>
            <TraceCompareHeader
              beforeId={beforeId}
              afterId={afterId}
              root={root}
              before={beforeSpans.data}
              after={afterSpans.data}
            />
          </PageHeader>
          <Split>
            <FocusScope focused={region === "spans"} onFocusRequest={() => setRegion("spans")}>
              {rows.length === 0 ? (
                <Placeholder text="No span changed" />
              ) : (
                <SpanDiffTable selection={selection} maxDeltaMs={maxDeltaMs} />
              )}
            </FocusScope>
            <FocusScope
              focused={region === "operations"}
              onFocusRequest={() => setRegion("operations")}
            >
              <OperationDiffTable selection={operationSelection} maxDeltaMs={maxDeltaMs} />
            </FocusScope>
          </Split>
        </>
      )}
      <KeyHints>
        <Key name="escape" onPress={() => onBack()}>
          back
        </Key>
        <FocusScope focused={region === "spans"}>
          {isDefined(selected) && (
            <Key
              name="return"
              description="open the span in the trace where it took longer"
              onPress={() => openSlower(selected)}
            >
              open
            </Key>
          )}
          <JumpKeys
            forward="e"
            backward="shift+e"
            forwardDescription="next added or removed span"
            backwardDescription="previous added or removed span"
            selection={selection}
            match={(row) => isAddedOrRemoved(row)}
          >
            added/removed
          </JumpKeys>
          <Key
            name="d"
            description={changedOnly ? "show every span" : "show only the spans that changed"}
            onPress={() => setChangedOnly((changedOnly) => !changedOnly)}
          >
            {changedOnly ? "all spans" : "changed"}
          </Key>
        </FocusScope>
        <Key
          name="x"
          description="swap the traces"
          onPress={() => setSwapped((swapped) => !swapped)}
        >
          swap
        </Key>
        <CopyKey name="y" text={afterId}>
          copy id
        </CopyKey>
        <PauseKey />
        <RegionKeys regions={REGIONS} region={region} onChange={(region) => setRegion(region)} />
      </KeyHints>
    </box>
  );
}
