import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";
import {
  apkFileName,
  environmentName,
  formatBuildDate,
  readAppConfig,
} from "../scripts/android-apk-name.js";

const SEP_26_2026 = new Date(2026, 8, 26, 14, 30);

describe("apkFileName", () => {
  test("matches the agreed format for every environment and build type", () => {
    const names = [];
    for (const environment of ["develop", "preview", "production"]) {
      for (const buildType of ["debug", "release"]) {
        names.push(apkFileName({ environment, buildType, version: "1.0.2", date: SEP_26_2026 }));
      }
    }
    expect(names).toEqual([
      "BlackNexa_develop_debug_v1.0.2_26092026.apk",
      "BlackNexa_develop_release_v1.0.2_26092026.apk",
      "BlackNexa_preview_debug_v1.0.2_26092026.apk",
      "BlackNexa_preview_release_v1.0.2_26092026.apk",
      "BlackNexa_production_debug_v1.0.2_26092026.apk",
      "BlackNexa_production_release_v1.0.2_26092026.apk",
    ]);
  });
});

describe("formatBuildDate", () => {
  test("pads day and month to two digits", () => {
    expect(formatBuildDate(new Date(2027, 0, 5))).toBe("05012027");
  });
});

describe("environmentName", () => {
  test("maps app.config.ts variants to file-name environments", () => {
    expect(environmentName("development")).toBe("develop");
    expect(environmentName("preview")).toBe("preview");
    expect(environmentName("production")).toBe("production");
  });

  test("rejects an unknown variant instead of naming the file after it", () => {
    expect(() => environmentName("staging")).toThrow();
  });
});

describe("readAppConfig", () => {
  test("reads the version from app.config.ts, not a copy of it", () => {
    const source = fs.readFileSync(path.join(import.meta.dir, "../app.config.ts"), "utf8");
    const declared = source.match(/const APP_VERSION = "([^"]+)"/)[1];
    expect(readAppConfig(path.join(import.meta.dir, "..")).version).toBe(declared);
  });
});
