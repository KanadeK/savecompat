export class SaveCompatError extends Error {
  readonly code: string;
  readonly path: string | undefined;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = "SaveCompatError";
    this.code = code;
    this.path = path;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
