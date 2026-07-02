declare module "bun:test" {
  type TestCallback = () => void | Promise<void>;

  export function describe(name: string, callback: TestCallback): void;
  export function test(name: string, callback: TestCallback): void;
  export function expect<T>(actual: T): {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toContain(expected: string): void;
    not: {
      toBeNull(): void;
    };
  };
}
