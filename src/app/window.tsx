import { AvailableSizeProvider, useAvailableSize } from "#ui/available-size.tsx";
import { COLUMN_GAP } from "#ui/columns.ts";

const TOP_BAR_HEIGHT = 1;

interface WindowProps {
  children: React.ReactNode;
}

export function Window({ children }: WindowProps) {
  return <box flexGrow={1}>{children}</box>;
}

interface TopBarProps {
  children: React.ReactNode;
}

export function TopBar({ children }: TopBarProps) {
  return (
    <box
      height={TOP_BAR_HEIGHT}
      flexDirection="row"
      justifyContent="space-between"
      gap={COLUMN_GAP}
      paddingRight={1}
    >
      {children}
    </box>
  );
}

interface ContentProps {
  children: React.ReactNode;
}

export function Content({ children }: ContentProps) {
  const { width, height = 0 } = useAvailableSize();

  return (
    <box flexGrow={1}>
      <AvailableSizeProvider value={{ width, height: height - TOP_BAR_HEIGHT }}>
        {children}
      </AvailableSizeProvider>
    </box>
  );
}
