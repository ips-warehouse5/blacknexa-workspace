/**
 * Generate the three iOS Xcode schemes the team uses locally.
 *
 * Expo prebuild creates one scheme from `config.name`; Xcode UI edits are easy
 * to lose when ios/ is regenerated. This plugin replaces that default scheme
 * with explicit environment schemes whose pre-actions write `.xcode.env.local`
 * and the per-environment Info.plist values before running.
 */

const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const PROJECT_NAME = "BlackNexa";
const FALLBACK_TARGET_BLUEPRINT_ID = "13B07F861A680F5B00A75B9A";
const FALLBACK_TEST_BLUEPRINT_ID = "00E356ED1AD99517003FC87E";

const SCHEMES = [
  {
    name: "BlackNexa Development",
    variant: "development",
    appEnv: "development",
    nodeEnv: "development",
    displayName: "BlackNexa",
    urlScheme: "blacknexa-dev",
  },
  {
    name: "BlackNexa Preview",
    variant: "preview",
    appEnv: "development",
    nodeEnv: "development",
    displayName: "BlackNexa",
    urlScheme: "blacknexa-preview",
  },
  {
    name: "BlackNexa Production",
    variant: "production",
    appEnv: "production",
    nodeEnv: "production",
    displayName: "BlackNexa",
    urlScheme: "blacknexa",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function schemePreAction({ variant, appEnv, nodeEnv, displayName, urlScheme }) {
  return escapeXml(
    `IOS_DIR="$(dirname "$WORKSPACE_PATH")"; ` +
      `if [ -z "$IOS_DIR" ] || [ "$IOS_DIR" = "." ]; then IOS_DIR="$PWD"; fi; ` +
      `ENV_FILE="$IOS_DIR/.xcode.env.local"; ` +
      `touch "$ENV_FILE"; ` +
      `TMP_FILE="\${ENV_FILE}.tmp"; ` +
      `grep -v -E '^(export )?(EXPO_PUBLIC_APP_VARIANT|EXPO_PUBLIC_APP_ENV|NODE_ENV)=' "$ENV_FILE" > "$TMP_FILE" || true; ` +
      `cat "$TMP_FILE" > "$ENV_FILE"; ` +
      `rm -f "$TMP_FILE"; ` +
      `printf "%s\\n" ` +
      `"export EXPO_PUBLIC_APP_VARIANT=${variant}" ` +
      `"export EXPO_PUBLIC_APP_ENV=${appEnv}" ` +
      `"export NODE_ENV=${nodeEnv}" >> "$ENV_FILE"; ` +
      `PLIST="$IOS_DIR/${PROJECT_NAME}/Info.plist"; ` +
      `/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${displayName}" "$PLIST"; ` +
      `/usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 ${urlScheme}" "$PLIST"; `,
  );
}

function readBuildableIds(schemesDir) {
  const defaultSchemePath = path.join(schemesDir, `${PROJECT_NAME}.xcscheme`);
  if (!fs.existsSync(defaultSchemePath)) {
    return {
      target: FALLBACK_TARGET_BLUEPRINT_ID,
      test: FALLBACK_TEST_BLUEPRINT_ID,
    };
  }

  const contents = fs.readFileSync(defaultSchemePath, "utf8");
  const targetMatch = contents.match(
    new RegExp(
      `BlueprintIdentifier = "([^"]+)"[\\s\\S]*?BuildableName = "${PROJECT_NAME}\\\\.app"`,
    ),
  );
  const testMatch = contents.match(
    new RegExp(
      `BlueprintIdentifier = "([^"]+)"[\\s\\S]*?BuildableName = "${PROJECT_NAME}Tests\\\\.xctest"`,
    ),
  );

  return {
    target: targetMatch?.[1] ?? FALLBACK_TARGET_BLUEPRINT_ID,
    test: testMatch?.[1] ?? FALLBACK_TEST_BLUEPRINT_ID,
  };
}

function buildableReference(blueprintIds, { test = false } = {}) {
  return `<BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${test ? blueprintIds.test : blueprintIds.target}"
               BuildableName = "${test ? `${PROJECT_NAME}Tests.xctest` : `${PROJECT_NAME}.app`}"
               BlueprintName = "${test ? `${PROJECT_NAME}Tests` : PROJECT_NAME}"
               ReferencedContainer = "container:${PROJECT_NAME}.xcodeproj">
            </BuildableReference>`;
}

function schemeXml(scheme, blueprintIds) {
  const preAction = schemePreAction(scheme);
  const appRef = buildableReference(blueprintIds);
  const testRef = buildableReference(blueprintIds, { test: true });

  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1130"
   version = "1.3">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <PreActions>
         <ExecutionAction
            ActionType = "Xcode.IDEStandardExecutionActionsCore.ExecutionActionType.ShellScriptAction">
            <ActionContent
               title = "Set ${scheme.name} Environment"
               scriptText = "${preAction}">
               <EnvironmentBuildable>
                  ${appRef}
               </EnvironmentBuildable>
            </ActionContent>
         </ExecutionAction>
      </PreActions>
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            ${appRef}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
         <TestableReference
            skipped = "NO">
            ${testRef}
         </TestableReference>
      </Testables>
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         ${appRef}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         ${appRef}
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
}

function writeSchemes(iosRoot) {
  const schemesDir = path.join(
    iosRoot,
    `${PROJECT_NAME}.xcodeproj`,
    "xcshareddata",
    "xcschemes",
  );

  fs.mkdirSync(schemesDir, { recursive: true });
  const blueprintIds = readBuildableIds(schemesDir);

  for (const entry of fs.readdirSync(schemesDir)) {
    if (entry.endsWith(".xcscheme")) {
      fs.rmSync(path.join(schemesDir, entry));
    }
  }

  for (const scheme of SCHEMES) {
    fs.writeFileSync(
      path.join(schemesDir, `${scheme.name}.xcscheme`),
      schemeXml(scheme, blueprintIds),
    );
  }
}

module.exports = function withIosEnvSchemes(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      writeSchemes(cfg.modRequest.platformProjectRoot);
      return cfg;
    },
  ]);
};
