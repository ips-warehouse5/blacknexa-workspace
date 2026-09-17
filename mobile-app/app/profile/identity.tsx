/**
 * H5 · Edit profile.
 *
 * Reconciled against the board: Cancel/Save live in the header (not a
 * back-chevron + a footer button), the avatar carries a pencil badge that
 * opens a system action sheet (camera / library / remove — not a row of
 * mode chips), Contact email is its own read-mostly row with a VERIFIED
 * badge, and "Stay anonymous" is a single toggle rather than a three-way
 * chip group.
 *
 * The toggle still maps onto the same `avatarMode` field the backend has
 * (`"photo" | "initials" | "anonymous"` — there is no separate boolean
 * column): on means `"anonymous"`; off means `"photo"` if a photo is set,
 * else `"initials"`.
 *
 * No avatar-upload endpoint exists anywhere in the backend (checked:
 * `avatar_key` is declared on the model but never written by any route,
 * and `avatarUrl` is hardcoded `null` in every profile response). Camera
 * and library selection still work — real permission requests, real
 * picker — but the result previews locally for this session only, with an
 * explicit note that saving a photo isn't available yet, rather than
 * silently pretending `updateProfile` persisted it.
 */

import React, { useCallback, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Image, Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Pencil, Check, UserRound } from "lucide-react-native";
import { colors, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import TextField from "@/components/ui/TextField";
import { ScrollScreen } from "@/components/ui/Screen";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import type { AvatarMode } from "@/lib/api/auth";

export default function IdentityScreen(): React.ReactElement {
  useThemeSync();
  const { user, updateProfile, busy } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarMode, setAvatarMode] = useState<AvatarMode>(user?.avatarMode ?? "initials");
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const anonymous = avatarMode === "anonymous";

  const initials = useMemo(() => {
    const name = displayName.trim();
    if (!name) return (user?.email[0] ?? "?").toUpperCase();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [displayName, user?.email]);

  /** What a report or comment will actually publish. */
  const publishedName = anonymous || !displayName.trim() ? "Anonymous" : displayName.trim();

  const save = useCallback(async () => {
    // avatarMode drives this screen's own preview, but the "Anonymous
    // on/off" badge on the main profile screen reads the separate
    // anonymousByDefault preference — without sending it here, toggling
    // "Stay anonymous" changed nothing that screen could see.
    const ok = await updateProfile({
      displayName: displayName.trim(),
      avatarMode,
      anonymousByDefault: anonymous,
    });
    if (ok) router.back();
  }, [anonymous, avatarMode, displayName, updateProfile]);

  const cancel = useCallback(() => router.back(), []);

  const pickFrom = useCallback(
    async (source: "camera" | "library") => {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showSnackbar({
          message:
            source === "camera"
              ? "Camera access is off. Enable it in Settings to take a photo."
              : "Photo access is off. Enable it in Settings to choose one.",
          type: "error",
        });
        return;
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
      if (result.canceled || !result.assets[0]) return;
      setPreviewUri(result.assets[0].uri);
      setAvatarMode("photo");
      showSnackbar({
        message: "Previewing only — saving a profile photo isn't available yet.",
        type: "info",
      });
    },
    [showSnackbar],
  );

  const removePhoto = useCallback(() => {
    setPreviewUri(null);
    setAvatarMode(anonymous ? "anonymous" : "initials");
  }, [anonymous]);

  const openAvatarActions = useCallback(() => {
    // "Remove Photo" only makes sense when there's a photo to remove — offering
    // it unconditionally let someone with no photo set "remove" a photo that
    // was never there.
    const hasPhoto = avatarMode === "photo";
    const options = hasPhoto
      ? ["Take Photo", "Choose from Library", "Remove Photo", "Cancel"]
      : ["Take Photo", "Choose from Library", "Cancel"];
    const destructiveButtonIndex = hasPhoto ? 2 : undefined;
    const cancelButtonIndex = hasPhoto ? 3 : 2;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex, cancelButtonIndex },
        (index) => {
          if (index === 0) void pickFrom("camera");
          else if (index === 1) void pickFrom("library");
          else if (hasPhoto && index === 2) removePhoto();
        },
      );
      return;
    }

    Alert.alert("Change photo", undefined, [
      { text: "Take Photo", onPress: () => void pickFrom("camera") },
      { text: "Choose from Library", onPress: () => void pickFrom("library") },
      ...(hasPhoto
        ? [{ text: "Remove Photo", style: "destructive" as const, onPress: removePhoto }]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  }, [avatarMode, pickFrom, removePhoto]);

  const toggleAnonymous = useCallback(() => {
    setAvatarMode((current) =>
      current === "anonymous" ? (previewUri ? "photo" : "initials") : "anonymous",
    );
  }, [previewUri]);

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-identity">
      {/* Cancel / Save header, per the board — not a back-chevron + footer button. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 4,
        }}
      >
        <Pressable onPress={cancel} accessibilityRole="button" testID="identity-cancel">
          <Text variant="label" color={colors.acc}>
            Cancel
          </Text>
        </Pressable>
        <Text variant="label" color={colors.t0}>
          Edit profile
        </Text>
        <Pressable
          onPress={save}
          disabled={busy}
          accessibilityRole="button"
          testID="identity-save"
        >
          <Text variant="label" color={busy ? colors.t4 : colors.acc}>
            {busy ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      <View style={{ alignItems: "center", marginTop: 22 }}>
        <View style={{ position: "relative" }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 26,
              backgroundColor: colors.s6,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {previewUri && avatarMode === "photo" ? (
              <Image
                source={{ uri: previewUri }}
                style={{ width: 88, height: 88 }}
                resizeMode="cover"
              />
            ) : anonymous ? (
              <UserRound size={38} color={colors.t3} />
            ) : (
              <Text variant="displaySm" color={colors.acc}>
                {initials}
              </Text>
            )}
          </View>
          <Pressable
            onPress={openAvatarActions}
            accessibilityRole="button"
            accessibilityLabel="Change photo"
            testID="identity-avatar-edit"
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: colors.acc,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: colors.bg,
            }}
          >
            <Pencil size={14} color={colors.onAcc} />
          </Pressable>
        </View>
      </View>

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 26 }}>
        DISPLAY NAME
      </Text>
      <TextField
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="How should people see you?"
        autoCapitalize="words"
        height={50}
        containerStyle={{ marginTop: 8 }}
        testID="identity-name"
      />
      <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 8 }}>
        Shown on anything you post without anonymity on.
      </Text>

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
        CONTACT EMAIL
      </Text>
      <View
        style={{
          marginTop: 8,
          backgroundColor: colors.s3,
          borderRadius: 14,
          paddingVertical: 13,
          paddingHorizontal: 15,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text variant="labelLg" color={colors.t0}>
          {user?.email ?? "—"}
        </Text>
        {user?.emailVerified ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Check size={13} color={colors.ok} />
            <Text variant="metaSm" color={colors.ok}>
              VERIFIED
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 8 }}>
        Never shown to other people. Changing it needs a new code.
      </Text>

      <Pressable
        onPress={toggleAnonymous}
        accessibilityRole="switch"
        accessibilityState={{ checked: anonymous }}
        testID="identity-anonymous"
        style={{
          marginTop: 22,
          backgroundColor: colors.s3,
          borderRadius: 14,
          padding: 15,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="labelLg" color={colors.t0}>
            Stay anonymous
          </Text>
          <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 3 }}>
            {anonymous
              ? "On — new reports and comments publish without your name or photo."
              : "Off — new reports and comments publish under your name."}
          </Text>
        </View>
        <View
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            backgroundColor: anonymous ? colors.acc : colors.s6,
            padding: 2,
            justifyContent: "center",
            alignItems: anonymous ? "flex-end" : "flex-start",
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: colors.bg,
            }}
          />
        </View>
      </Pressable>

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
        HOW YOU WILL APPEAR
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.s2,
          borderRadius: 12,
          paddingVertical: 11,
          paddingHorizontal: 13,
          marginTop: 8,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 11,
            backgroundColor: colors.s6,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {publishedName === "Anonymous" ? (
            <UserRound size={16} color={colors.t3} />
          ) : (
            <Text variant="labelSm" color={colors.acc}>
              {initials}
            </Text>
          )}
        </View>
        <View>
          <Text variant="label" color={colors.t0}>
            {publishedName}
          </Text>
          <Text variant="metaSm" color={colors.t4}>
            Your area · just now
          </Text>
        </View>
      </View>

      <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 16, lineHeight: 19 }}>
        Changing this affects new reports and comments. Anything already published
        keeps the name it was published under.
      </Text>
    </ScrollScreen>
  );
}
