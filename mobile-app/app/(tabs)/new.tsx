/**
 * Placeholder for the tab bar's centre slot.
 *
 * The route keeps the fifth tab slot selectable while its report-wizard action is
 * temporarily paused with the rest of the tab content.
 */

import React from "react";
import ComingSoon from "@/components/ui/ComingSoon";

export default function CentreSlot(): React.ReactElement {
  // TODO(Centre Slot): Re-enable the report-wizard action when report development resumes.
  // return <Redirect href="/report" />;
  return <ComingSoon />;
}
