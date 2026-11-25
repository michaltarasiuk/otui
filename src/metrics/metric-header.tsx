import { Description, DetailsHeader, Id, Meta, Fact, Title } from "#ui/details.tsx";
import { ServiceName } from "#ui/service-name.tsx";
import { isDefined } from "#utils/is-defined.ts";
import { formatCount } from "#utils/number.ts";

import { type Metric, temporalityLabel, typeLabel } from "./metric.ts";

interface MetricHeaderProps {
  metric: Metric;
  seriesCount: number;
}

export function MetricHeader({ metric, seriesCount }: MetricHeaderProps) {
  const temporality = temporalityLabel(metric);

  return (
    <>
      <DetailsHeader>
        <Title>{metric.name}</Title>
        <Id>{typeLabel(metric.type)}</Id>
      </DetailsHeader>
      <Meta>
        {isDefined(metric.service_name) && (
          <Fact>
            <ServiceName name={metric.service_name} />
          </Fact>
        )}
        {metric.unit !== "" && <Fact>unit {metric.unit}</Fact>}
        {isDefined(temporality) && <Fact>{temporality}</Fact>}
        <Fact>{formatCount(seriesCount, "series", "series")}</Fact>
      </Meta>
      {metric.description !== "" && <Description>{metric.description}</Description>}
    </>
  );
}
