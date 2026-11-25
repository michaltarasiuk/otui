import { AvailableSizeProvider, useAvailableSize } from "./available-size.tsx";
import { THEME } from "./theme.ts";

export const SPLIT_PADDING_X = 1;

interface SplitProps {
  children: [React.ReactNode, React.ReactNode];
}

export function Split({ children: [top, bottom] }: SplitProps) {
  const { width } = useAvailableSize();

  return (
    <box flexGrow={1}>
      {top}
      <box
        flexGrow={1}
        flexBasis={0}
        border={["top"]}
        borderColor={THEME.textMuted}
        paddingX={SPLIT_PADDING_X}
      >
        <AvailableSizeProvider value={{ width: width - 2 * SPLIT_PADDING_X, height: undefined }}>
          {bottom}
        </AvailableSizeProvider>
      </box>
    </box>
  );
}
