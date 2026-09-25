import React from "react";
import LegalDocument from "@/components/LegalDocument";
import { TERMS } from "@/constants/legal";

export default function TermsScreen(): React.ReactElement {
  return <LegalDocument screenTitle="Terms of Service" doc={TERMS} testID="terms-screen" />;
}
