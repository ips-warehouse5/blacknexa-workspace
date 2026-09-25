import React from "react";
import LegalDocument from "@/components/LegalDocument";
import { PRIVACY } from "@/constants/legal";

export default function PrivacyScreen(): React.ReactElement {
  return <LegalDocument screenTitle="Privacy Policy" doc={PRIVACY} testID="privacy-screen" />;
}
