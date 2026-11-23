import { Activity, useState } from "react";

export type ScreenMode = "visible" | "hidden";

interface ScreenProps {
  mode: ScreenMode;
  children: React.ReactNode;
}

export function Screen({ mode, children }: ScreenProps) {
  const visible = mode === "visible";
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) {
    setMounted(true);
  }

  return mounted && <Activity mode={mode}>{children}</Activity>;
}
