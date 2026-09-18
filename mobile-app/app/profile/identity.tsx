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
 * The photo is uploaded the moment it is picked, not on Save: presign →
 * direct PUT to storage → commit. Two reasons for not deferring it to the
 * Save button. A multi-megabyte upload behind a button that also closes
 * the screen gives the person nothing to look at and no way to retry; and
 * `updateProfile` is a JSON PATCH, so the bytes were never going to travel
 * with it anyway. The local preview shows immediately and is replaced by
 * the server's `avatarUrl` once commit returns.
 *
 * Save therefore carries only the text fields and the avatar mode.
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

/**
 * What the picker returns, mapped to a type the server will sign for.
 *
 * `ImagePicker` reports a `mimeType` on most assets but not all — an older
 * Android gallery can return none. The extension is the fallback, and JPEG is
 * the last resort because that is what the picker produces when it re-encodes.
 */
function mimeFor(asset: { mimeType?: string | null; uri: string }): string {
  const reported = asset.mimeType?.toLowerCase();
  if (reported && ALLOWED_MIMES.includes(reported)) return reported;
  const extension = asset.uri.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "image/jpeg";
}

/** Mirrors the server's accepted set — see `userAuth.avatarPresign`. */
const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export default function IdentityScreen(): React.ReactElement {
  useThemeSync();
  const { user, updateProfile, uploadAvatar, removeAvatar, busy, error, clearError } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarMode, setAvatarMode] = useState<AvatarMode>(user?.avatarMode ?? "initials");
  /**
   * The just-picked local file, shown until commit returns.
   *
   * Cleared on success so the tile falls through to the server's `avatarUrl` —
   * keeping the local URI would leave the screen rendering a cache path that
   * stops resolving once the app is reinstalled.
   */
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedPhotoInSession, setUploadedPhotoInSession] = useState(false);

  /** The server's photo, or the local one while it is still on its way up. */
  const photoUri = previewUri ?? user?.avatarUrl ?? null;

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
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      // Show it straight away. The upload takes as long as it takes, and an
      // avatar tile that stays on the old image until commit returns reads as
      // the picker having failed.
      setPreviewUri(asset.uri);
      setAvatarMode("photo");
      setUploading(true);
      try {
        const ok = await uploadAvatar(asset.uri, mimeFor(asset));
        if (ok) {
          // Fall through to the server's URL — see `previewUri` above.
          setPreviewUri(null);
          setUploadedPhotoInSession(true);
          showSnackbar({ message: "Profile photo updated.", type: "success" });
        } else {
          // Put the tile back the way it was. `uploadAvatar` sets `error` on
          // the provider but never shows it — this is the one place that
          // read of it happens, so a failure isn't just a preview quietly
          // reverting with no explanation.
          setPreviewUri(null);
          setAvatarMode(user?.avatarMode ?? "initials");
          showSnackbar({
            message: error ?? "That photo could not be uploaded. Try again.",
            type: "error",
          });
          clearError();
        }
      } finally {
        setUploading(false);
      }
    },
    [clearError, error, showSnackbar, uploadAvatar, user?.avatarMode],
  );

  const removePhoto = useCallback(async () => {
    setPreviewUri(null);
    setUploadedPhotoInSession(false);
    setAvatarMode(anonymous ? "anonymous" : "initials");
    // Only a round trip when there is something on the server to remove. A
    // photo picked and then removed before it finished uploading has no key
    // to delete.
    if (!user?.avatarUrl) return;
    const ok = await removeAvatar();
    if (!ok) {
      // The optimistic clear above was wrong — put the photo back rather
      // than leave the tile showing "removed" when the server still has it.
      setAvatarMode(user?.avatarMode ?? "initials");
      showSnackbar({
        message: error ?? "That photo could not be removed. Try again.",
        type: "error",
      });
      clearError();
    }
  }, [anonymous, clearError, error, removeAvatar, showSnackbar, user?.avatarMode, user?.avatarUrl]);

  const openAvatarActions = useCallback(() => {
    // "Remove Photo" only applies to a BlackNexa-uploaded avatar. A fresh
    // Google account may show the provider picture as `avatarUrl`, but there is
    // no app photo to remove yet, so the sheet should offer Cancel instead.
    const canRemovePhoto = Boolean(previewUri || uploadedPhotoInSession);
    const options = canRemovePhoto
      ? ["Take Photo", "Choose from Library", "Remove Photo", "Cancel"]
      : ["Take Photo", "Choose from Library", "Cancel"];
    const destructiveButtonIndex = canRemovePhoto ? 2 : undefined;
    const cancelButtonIndex = canRemovePhoto ? 3 : 2;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex, cancelButtonIndex },
        (index) => {
          if (index === 0) void pickFrom("camera");
          else if (index === 1) void pickFrom("library");
          else if (canRemovePhoto && index === 2) void removePhoto();
        },
      );
      return;
    }

    Alert.alert("Change photo", undefined, [
      { text: "Take Photo", onPress: () => void pickFrom("camera") },
      { text: "Choose from Library", onPress: () => void pickFrom("library") },
      ...(canRemovePhoto
        ? [{ text: "Remove Photo", style: "destructive" as const, onPress: () => void removePhoto() }]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickFrom, previewUri, removePhoto, uploadedPhotoInSession]);

  const toggleAnonymous = useCallback(() => {
    setAvatarMode((current) =>
      current === "anonymous" ? (photoUri ? "photo" : "initials") : "anonymous",
    );
  }, [photoUri]);

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
          disabled={busy || uploading}
          accessibilityRole="button"
          testID="identity-save"
        >
          <Text variant="label" color={busy || uploading ? colors.t4 : colors.acc}>
            {uploading ? "Uploading…" : busy ? "Saving…" : "Save"}
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
            {photoUri && avatarMode === "photo" ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: 88, height: 88, opacity: uploading ? 0.5 : 1 }}
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
          {/* Hidden while anonymous — there is no photo to edit: the tile
              above already shows the generic silhouette instead of a photo
              or initials, so a pencil here would open a picker for a photo
              nobody would ever see published. */}
          {anonymous ? null : (
            <Pressable
              onPress={openAvatarActions}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              accessibilityState={{ disabled: uploading, busy: uploading }}
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
          )}
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
          ) : photoUri && avatarMode === "photo" ? (
            <Image
              source={{ uri: photoUri }}
              style={{ width: 32, height: 32 }}
              resizeMode="cover"
            />
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
