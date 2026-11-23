import { useRetry } from "#ui/error-boundary.tsx";
import { Key, KeyHints } from "#ui/key-hints.tsx";
import { Placeholder } from "#ui/placeholder.tsx";

export function PageLoading() {
  return (
    <Fallback>
      <Placeholder text="Loading..." />
      <KeyHints />
    </Fallback>
  );
}

interface PageErrorProps {
  text: string;
  onBack?: (() => void) | undefined;
}

export function PageError({ text, onBack }: PageErrorProps) {
  const retry = useRetry();

  return (
    <Fallback>
      <Placeholder text={text} variant="error" />
      <KeyHints>
        <Key name="r" onPress={() => retry()}>
          retry
        </Key>
        {onBack !== undefined && (
          <Key name="escape" onPress={() => onBack()}>
            back
          </Key>
        )}
      </KeyHints>
    </Fallback>
  );
}

interface FallbackProps {
  children: React.ReactNode;
}

function Fallback({ children }: FallbackProps) {
  return (
    <box flexGrow={1} paddingTop={1}>
      {children}
    </box>
  );
}
