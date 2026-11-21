const POLL_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 10;

export async function pollUntil<T>(read: () => T | Promise<T>, isDone: (value: T) => boolean) {
  const deadline = performance.now() + POLL_TIMEOUT_MS;
  let value = await read();
  while (!isDone(value) && performance.now() < deadline) {
    await Bun.sleep(POLL_INTERVAL_MS);
    value = await read();
  }
  return value;
}
