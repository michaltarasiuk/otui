import { useTerminalDimensions } from "@opentui/react";
import { createContext, use } from "react";

export interface Size {
  width: number;
  height: number | undefined;
}

const AvailableSizeContext = createContext<Size | undefined>(undefined);

interface AvailableSizeProviderProps {
  value: Size;
  children: React.ReactNode;
}

export function AvailableSizeProvider({ value, children }: AvailableSizeProviderProps) {
  return <AvailableSizeContext value={value}>{children}</AvailableSizeContext>;
}

export function useAvailableSize(): Size {
  const terminal = useTerminalDimensions();
  return use(AvailableSizeContext) ?? terminal;
}
