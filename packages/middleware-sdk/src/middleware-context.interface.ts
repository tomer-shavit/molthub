/** Logger interface provided to middlewares */
export interface IMiddlewareLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/** Context provided to middlewares during initialization */
export interface IMiddlewareContext {
  readonly botName: string;
  readonly externalPort: number;
  readonly internalPort: number;
  readonly middlewareConfig: Record<string, unknown>;
  readonly logger: IMiddlewareLogger;
}
