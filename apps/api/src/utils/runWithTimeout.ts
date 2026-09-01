/**
 * Races a promise against a timeout. If the timeout wins, the returned
 * promise rejects; the original work is not cancelled (JavaScript cannot
 * cancel an in-flight promise), but the caller stops waiting for it.
 */
export async function runWithTimeout<T>(work: Promise<T>, timeoutMilliseconds: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMilliseconds}ms.`));
    }, timeoutMilliseconds);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
