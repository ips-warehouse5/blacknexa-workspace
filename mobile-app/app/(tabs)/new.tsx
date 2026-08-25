/**
 * Placeholder for the tab bar's centre slot.
 *
 * `Tabs` needs a registered route to lay out five slots, but this screen is never
 * shown: `tabBarButton` replaces the tab entirely and the `tabPress` listener
 * calls `preventDefault`, so the press opens the report wizard as a full-screen
 * modal instead — which is what A12 describes ("The centre button opens a report
 * over whatever you were doing").
 *
 * If this ever renders, the listener has been removed by mistake.
 */

import React from "react";
import { Redirect } from "expo-router";

export default function CentreSlot(): React.ReactElement {
  return <Redirect href="/report" />;
}
