import { COLUMN_SERVICE_WIDTH, COLUMN_TIME_WIDTH } from "#ui/columns.ts";
import { Rows } from "#ui/rows.tsx";
import { ServiceName } from "#ui/service-name.tsx";
import { Cell, Column, Row, Secondary, TableHeader } from "#ui/table.tsx";
import type { Selection } from "#ui/use-selection.ts";
import { isDefined } from "#utils/is-defined.ts";
import { collapseWhitespace } from "#utils/text.ts";
import { formatTime } from "#utils/time.ts";

import type { Log } from "./log.ts";
import { severityColor } from "./severity-color.ts";

const COLUMN_SEVERITY_WIDTH = 8;

interface LogTableProps {
  selection: Selection<Log>;
}

export function LogTable({ selection }: LogTableProps) {
  return (
    <>
      <TableHeader>
        <Column width={COLUMN_TIME_WIDTH}>Time</Column>
        <Column width={COLUMN_SEVERITY_WIDTH}>Severity</Column>
        <Column width={COLUMN_SERVICE_WIDTH}>Service</Column>
        <Column grow={1}>Body</Column>
      </TableHeader>
      <Rows selection={selection}>
        {(log) => (
          <Row>
            <Cell width={COLUMN_TIME_WIDTH} muted>
              {isDefined(log.time) && formatTime(log.time)}
            </Cell>
            <Cell width={COLUMN_SEVERITY_WIDTH} color={severityColor(log.severity)}>
              {log.severity ?? log.severity_text}
            </Cell>
            <Cell width={COLUMN_SERVICE_WIDTH} muted>
              {isDefined(log.service_name) && <ServiceName name={log.service_name} />}
            </Cell>
            <Cell grow={1}>
              {isDefined(log.event_name) && <Secondary>{log.event_name} </Secondary>}
              {isDefined(log.body) && collapseWhitespace(log.body)}
            </Cell>
          </Row>
        )}
      </Rows>
    </>
  );
}
