export class TiingoHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`Tiingo request failed with ${status}${body ? `: ${body}` : ""}`);
  }
}

export function isTiingoAuthorizationError(error: unknown): boolean {
  return (
    error instanceof TiingoHttpError &&
    (error.status === 401 || error.status === 402 || error.status === 403)
  );
}
