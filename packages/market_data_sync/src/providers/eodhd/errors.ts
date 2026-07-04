export class EodhdHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`EODHD request failed with ${status}${body ? `: ${body}` : ""}`);
  }
}

export function isProviderAuthorizationError(error: unknown): boolean {
  return (
    error instanceof EodhdHttpError &&
    (error.status === 401 || error.status === 402 || error.status === 403)
  );
}
