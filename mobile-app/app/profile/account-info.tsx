/**
 * H6 · Account.
 *
 * SIGN IN group (email, password → H7, connected sign-in), DEVICES group
 * (reuses the real session list already built for `/profile/security`
 * rather than duplicating it), YOUR DATA group (Delete account).
 *
 * "Connected sign-in" (which OAuth provider, if any, is linked) has no
 * client-exposed field anywhere in this API surface — `UserIdentity` rows
 * exist server-side but nothing in `lib/api/auth.ts`'s `UserProfile`
 * returns them. Shown as unavailable rather than guessed from
 * `hasPassword` (a passwordless account could be Apple OR Google — that
 * distinction genuinely isn't knowable client-side today).
 *
 * "Password — last changed" has no timestamp field on the backend
 * (`AppUser` has no `password_changed_at`), so only the action is shown,
 * not a fabricated date.
 */

import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { Group, Row } from "@/components/ui/SettingsRow";
import { useAuth } from "@/providers/AuthProvider";

export default function AccountInfoScreen(): React.ReactElement {
  const { user } = useAuth();

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-account-info">
      <BackHeader title="Account" onBack={() => router.back()} padding={0} />

      <Group label="SIGN IN">
        <Row title="Email" value={user?.email ?? "—"} disabled />
        {user?.hasPassword ? (
          <Row
            title="Password"
            onPress={() => router.push("/profile/change-password")}
            testID="row-change-password"
          />
        ) : (
          <Row
            title="Password"
            value="Not set — signed in with Apple or Google"
            disabled
          />
        )}
        <Row title="Connected sign-in" value="Not shown" disabled last />
      </Group>

      <Group label="DEVICES">
        <Row
          title="Signed-in devices"
          value="Manage"
          onPress={() => router.push("/profile/security")}
          testID="row-devices"
          last
        />
      </Group>

      <Group label="YOUR DATA">
        <Row
          title="Delete account"
          destructive
          onPress={() => router.push("/profile/account")}
          testID="row-delete-account"
          last
        />
      </Group>

      <View style={{ marginTop: 14 }}>
        <Text variant="metaSm" color={colors.t4}>
          Signing out of a specific device happens from Signed-in devices.
        </Text>
      </View>
    </ScrollScreen>
  );
}
