/**
 * Marks a screen that is still showing prototype data.
 *
 * Worth the space: these screens look finished, and without a marker it is easy
 * to demo one and believe the numbers. It renders only while `VITE_USE_MOCK_DATA`
 * is on, so it disappears by itself as each module is wired to its endpoint.
 */

import env from "@/config/env";

export function FixtureNotice({ module }: { module?: string }) {
  if (!env.useMockData) return null;

  return (
    <div className="fixture-notice">
      <strong>Prototype data.</strong>
      <span>
        {module
          ? `${module} is not connected to the API yet — these figures come from the design fixtures.`
          : "This screen is not connected to the API yet — these figures come from the design fixtures."}
      </span>
    </div>
  );
}

export default FixtureNotice;
