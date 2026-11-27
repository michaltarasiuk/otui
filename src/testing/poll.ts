export async function pollUntil<T>(read: () => T | Promise<T>, isDone: (value: T) => boolean) {
  const deadline = performance.now() + 3000;
  let value = await read();
  while (!isDone(value) && performance.now() < deadline) {
    await Bun.sleep(10);
    value = await read();
  }
  return value;
}
