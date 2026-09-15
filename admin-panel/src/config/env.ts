/**
 * Typed access to build-time configuration.
 *
 * Vite inlines `import.meta.env` at build time, so every value here is fixed
 * when the bundle is produced — nothing in this file is a runtime secret, and
 * nothing that is a secret belongs in it.
 */

/** Read a string variable, falling back when it is absent or blank. */
function str(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** Read a boolean variable. Anything other than "true" is false. */
function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

export const env = {
  /** Base path every API call is resolved against. */
  apiBaseUrl: str(import.meta.env.VITE_API_BASE_URL, "/api/v1"),

  /** Product name, shown in the sidebar brand and the document title. */
  appName: str(import.meta.env.VITE_APP_NAME, "BlackNexa"),

  /**
   * Whether screens without a backend yet should render prototype fixtures.
   * Auth and admin/roles are live regardless — they ignore this flag.
   */
  useMockData: bool(import.meta.env.VITE_USE_MOCK_DATA, true),

  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

export default env;
