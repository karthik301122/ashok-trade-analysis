export function asxDataPlugin(): {
  name: string
  configureServer: (server: {
    middlewares: {
      use: (fn: (req: unknown, res: unknown, next: () => void) => void | Promise<void>) => void
    }
  }) => void
}
