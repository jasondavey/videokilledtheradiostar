export function logAndReturn<T extends Record<string, any>>(result: T): T {
  console.log('[Lambda Response]', JSON.stringify(result, null, 2));
  return result;
}
