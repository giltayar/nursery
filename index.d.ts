import { AbortController, AbortSignal } from "abort-controller";
export { AbortController, AbortSignal } from "abort-controller";

export type Task<T> = PromiseLike<T> | FunctionTask<T>;

export type FunctionTask<T> = (taskArgs: TaskArgs<T>) => PromiseLike<T>;

export interface TaskArgs<T> {
  nurse: Nurse<T>;
  supervisor: Nurse<T>;
  abortController: AbortController;
  signal: AbortSignal;
}

export type Nurse<T> = (task: Task<T>) => void;

export interface NurseryOptions<T> {
  retries?: number;
  onRetry?: OnRetry;
  execution?: (fn: () => PromiseLike<T>) => PromiseLike<T>;
}

export type OnRetry = (args: {
  attempt: number;
  remaining: number;
}) => PromiseLike<void>;

declare function Nursery<T>(
  options?: NurseryOptions<T>
): AsyncGenerator<TaskArgs<T>>;

declare function Nursery<T>(
  task: Task<T>,
  options?: NurseryOptions<T>
): Promise<T>;

declare function Nursery<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(
  taskList: readonly [
    Task<T1>,
    Task<T2>,
    Task<T3>,
    Task<T4>,
    Task<T5>,
    Task<T6>,
    Task<T7>,
    Task<T8>,
    Task<T9>,
    Task<T10>
  ],
  options?: NurseryOptions<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>
): Promise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;

declare function Nursery<T1, T2, T3, T4, T5, T6, T7, T8, T9>(
  taskList: readonly [
    Task<T1>,
    Task<T2>,
    Task<T3>,
    Task<T4>,
    Task<T5>,
    Task<T6>,
    Task<T7>,
    Task<T8>,
    Task<T9>
  ],
  options?: NurseryOptions<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9>
): Promise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;

declare function Nursery<T1, T2, T3, T4, T5, T6, T7, T8>(
  taskList: readonly [
    Task<T1>,
    Task<T2>,
    Task<T3>,
    Task<T4>,
    Task<T5>,
    Task<T6>,
    Task<T7>,
    Task<T8>
  ],
  options?: NurseryOptions<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8>
): Promise<[T1, T2, T3, T4, T5, T6, T7, T8]>;

declare function Nursery<T1, T2, T3, T4, T5, T6, T7>(
  taskList: readonly [
    Task<T1>,
    Task<T2>,
    Task<T3>,
    Task<T4>,
    Task<T5>,
    Task<T6>,
    Task<T7>
  ],
  options?: NurseryOptions<T1 | T2 | T3 | T4 | T5 | T6 | T7>
): Promise<[T1, T2, T3, T4, T5, T6, T7]>;

declare function Nursery<T1, T2, T3, T4, T5, T6>(
  taskList: readonly [
    Task<T1>,
    Task<T2>,
    Task<T3>,
    Task<T4>,
    Task<T5>,
    Task<T6>
  ],
  options?: NurseryOptions<T1 | T2 | T3 | T4 | T5 | T6>
): Promise<[T1, T2, T3, T4, T5, T6]>;

declare function Nursery<T1, T2, T3, T4, T5>(
  taskList: readonly [Task<T1>, Task<T2>, Task<T3>, Task<T4>, Task<T5>],
  options?: NurseryOptions<T1 | T2 | T3 | T4 | T5>
): Promise<[T1, T2, T3, T4, T5]>;

declare function Nursery<T1, T2, T3, T4>(
  taskList: readonly [Task<T1>, Task<T2>, Task<T3>, Task<T4>],
  options?: NurseryOptions<T1 | T2 | T3 | T4>
): Promise<[T1, T2, T3, T4]>;

declare function Nursery<T1, T2, T3>(
  taskList: readonly [Task<T1>, Task<T2>, Task<T3>],
  options?: NurseryOptions<T1 | T2 | T3>
): Promise<[T1, T2, T3]>;

declare function Nursery<T1, T2>(
  taskList: readonly [Task<T1>, Task<T2>],
  options?: NurseryOptions<T1 | T2>
): Promise<[T1, T2]>;

declare function Nursery<T>(
  taskList: readonly Task<T>[],
  options?: NurseryOptions<T>
): Promise<T[]>;

declare namespace Nursery {
  const moreErrors: symbol;

  class CancelTask<T> extends Error {
    constructor(value: T, message?: string);

    static isCancelledTaskError(err: Error): boolean;
  }

  function constantTimeRetry(options: { delta: number }): OnRetry;

  function linearTimeRetry(options: {
    start: number;
    delta?: number;
    max?: number;
  }): OnRetry;

  function exponentialTimeRetry(options: {
    start: number;
    factor?: number;
    max?: number;
  }): OnRetry;

  class TimeoutError extends Error {}

  function timeoutTask(
    ms: number,
    options?: { name?: string }
  ): FunctionTask<void>;
}

export default Nursery;
