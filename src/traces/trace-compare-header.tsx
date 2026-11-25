import { DetailsHeader, Fact, Id, Meta, Title } from "#ui/details.tsx";
import { ServiceName } from "#ui/service-name.tsx";
import { THEME } from "#ui/theme.ts";
import { isDefined } from "#utils/is-defined.ts";
import { formatInteger } from "#utils/number.ts";
import { shortId } from "#utils/text.ts";
import { formatDuration, formatOffset } from "#utils/time.ts";

import { traceDuration } from "./span-tree.ts";
import type { Span } from "./span.ts";

function errorCount(spans: Span[]) {
  return spans.filter((span) => span.is_error).length;
}

interface TraceCompareHeaderProps {
  beforeId: string;
  afterId: string;
  root: Span;
  before: Span[];
  after: Span[];
}

export function TraceCompareHeader({
  beforeId,
  afterId,
  root,
  before,
  after,
}: TraceCompareHeaderProps) {
  const beforeMs = traceDuration(before);
  const afterMs = traceDuration(after);
  const beforeErrors = errorCount(before);
  const afterErrors = errorCount(after);

  return (
    <>
      <DetailsHeader>
        <Title>{root.name}</Title>
        <Id>
          {shortId(beforeId)} → {shortId(afterId)}
        </Id>
      </DetailsHeader>
      <Meta>
        {isDefined(root.service_name) && (
          <Fact>
            <ServiceName name={root.service_name} />
          </Fact>
        )}
        <Fact color={THEME.text}>
          {formatDuration(beforeMs)} → {formatDuration(afterMs)}
        </Fact>
        <Fact>{formatOffset(afterMs - beforeMs)}</Fact>
        <Fact>
          {formatInteger(before.length)} → {formatInteger(after.length)} spans
        </Fact>
        {beforeErrors + afterErrors > 0 && (
          <Fact color={THEME.textError}>
            {formatInteger(beforeErrors)} → {formatInteger(afterErrors)} errors
          </Fact>
        )}
      </Meta>
    </>
  );
}
