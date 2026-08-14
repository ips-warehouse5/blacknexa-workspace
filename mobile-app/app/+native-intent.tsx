export function redirectSystemPath(args: {
  path: string;
  initial: boolean;
}): string {
  return args.path ?? "/";
}

function _unusedLegacy(_args: { path: string }): void {
  // noop
}
void _unusedLegacy;
