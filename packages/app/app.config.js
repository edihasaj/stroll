const fs = require("node:fs");
const path = require("node:path");
const pkg = require("./package.json");
const withAndroidAsyncStorageSize = require("./plugins/with-android-async-storage-size");
const withAndroidProfileable = require("./plugins/with-android-profileable");
const withFdroidAutolinking = require("./plugins/with-fdroid-autolinking");
const withPasteInput = require("./plugins/with-paste-input");
const withAndroidScroll = require("./modules/paseo-scroll/app.plugin");
const { getNativeReleaseVersion } = require("./native-release-version");
const appVariant = process.env.APP_VARIANT ?? "production";
const isFdroidBuild = process.env.PASEO_FDROID_BUILD === "1";
const isProfileBuild = process.env.PASEO_PROFILE_BUILD === "1";

const buildProfile = isFdroidBuild
  ? {
      androidPermissions: [
        "RECORD_AUDIO",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
      ],
      cameraPlugins: [],
      fdroidPlugins: [withFdroidAutolinking],
      notificationPlugins: [],
    }
  : {
      androidPermissions: [
        "RECORD_AUDIO",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "CAMERA",
        "android.permission.CAMERA",
      ],
      cameraPlugins: [
        [
          "expo-camera",
          {
            cameraPermission:
              "Allow $(PRODUCT_NAME) to access your camera to scan pairing QR codes.",
          },
        ],
      ],
      fdroidPlugins: [],
      notificationPlugins: [
        [
          "expo-notifications",
          {
            icon: "./assets/images/notification-icon.png",
            color: "#20744A",
          },
        ],
      ],
    };

function resolveSecretFile(params) {
  const fromEnv = process.env[params.envKey];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const fallbackAbsolutePath = path.resolve(__dirname, params.fallbackRelativePath);
  if (fs.existsSync(fallbackAbsolutePath)) {
    return params.fallbackRelativePath;
  }

  return undefined;
}

const variants = {
  production: {
    name: "Stroll",
    packageId: "com.edihasaj.stroll",
    googleServicesFile: resolveSecretFile({
      envKey: "GOOGLE_SERVICES_FILE_PROD",
      fallbackRelativePath: "./.secrets/google-services.prod.json",
    }),
    googleServiceInfoPlist: resolveSecretFile({
      envKey: "GOOGLE_SERVICE_INFO_PLIST_PROD",
      fallbackRelativePath: "./.secrets/GoogleService-Info.prod.plist",
    }),
  },
  development: {
    name: "Stroll Debug",
    packageId: "com.edihasaj.stroll.debug",
    googleServicesFile: resolveSecretFile({
      envKey: "GOOGLE_SERVICES_FILE_DEBUG",
      fallbackRelativePath: "./.secrets/google-services.debug.json",
    }),
    googleServiceInfoPlist: resolveSecretFile({
      envKey: "GOOGLE_SERVICE_INFO_PLIST_DEBUG",
      fallbackRelativePath: "./.secrets/GoogleService-Info.debug.plist",
    }),
  },
};

const variant = variants[appVariant] ?? variants.production;
const nativeReleaseVersion = getNativeReleaseVersion(pkg.version);

export default {
  expo: {
    name: variant.name,
    slug: "voice-mobile",
    version: nativeReleaseVersion.appVersion,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "stroll",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSMicrophoneUsageDescription: "This app needs access to the microphone for voice commands.",
        ITSAppUsesNonExemptEncryption: false,
      },
      bundleIdentifier: variant.packageId,
      ...(variant.googleServiceInfoPlist
        ? { googleServicesFile: variant.googleServiceInfoPlist }
        : {}),
      buildNumber: nativeReleaseVersion.iosBuildNumber,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/images/android-icon-foreground.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      // Allow HTTP connections for local network hosts (required for release builds)
      usesCleartextTraffic: true,
      permissions: buildProfile.androidPermissions,
      package: variant.packageId,
      versionCode: nativeReleaseVersion.androidVersionCode,
      ...(variant.googleServicesFile ? { googleServicesFile: variant.googleServicesFile } : {}),
    },
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    autolinking: {
      searchPaths: ["../../node_modules", "./node_modules"],
    },
    plugins: [
      "expo-router",
      withPasteInput,
      withAndroidScroll,
      [withAndroidAsyncStorageSize, 64],
      ...buildProfile.cameraPlugins,
      // Geist (interface) and Geist Mono (code), statically linked at build time — no
      // runtime load, no flash. iOS groups weights under the font's own typographic
      // family name ("Geist" / "Geist Mono" cover Regular/Medium/SemiBold) via plain
      // UIAppFonts registration, so flat paths are enough. Android has no such grouping
      // without an explicit font-family resource, so its entries are objects naming the
      // family and each weight's file — see node_modules/expo-font/plugin for the shape.
      // See docs/design.md "Finish" for the font rules these feed.
      [
        "expo-font",
        {
          ios: {
            fonts: [
              "./assets/fonts/geist/Geist-Regular.ttf",
              "./assets/fonts/geist/Geist-Medium.ttf",
              "./assets/fonts/geist/Geist-SemiBold.ttf",
              "./assets/fonts/geist/GeistMono-Regular.ttf",
              "./assets/fonts/geist/GeistMono-Medium.ttf",
            ],
          },
          android: {
            fonts: [
              {
                fontFamily: "Geist",
                fontDefinitions: [
                  { path: "./assets/fonts/geist/Geist-Regular.ttf", weight: 400 },
                  { path: "./assets/fonts/geist/Geist-Medium.ttf", weight: 500 },
                  { path: "./assets/fonts/geist/Geist-SemiBold.ttf", weight: 600 },
                ],
              },
              {
                fontFamily: "Geist Mono",
                fontDefinitions: [
                  { path: "./assets/fonts/geist/GeistMono-Regular.ttf", weight: 400 },
                  { path: "./assets/fonts/geist/GeistMono-Medium.ttf", weight: 500 },
                ],
              },
            ],
          },
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      ...buildProfile.notificationPlugins,
      "expo-audio",
      [
        "expo-gradle-jvmargs",
        {
          xmx: "4096m",
          maxMetaspace: "1024m",
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 29,
            kotlinVersion: "2.1.20",
            // Allow HTTP connections for local network hosts in release builds
            usesCleartextTraffic: true,
          },
        },
      ],
      ...buildProfile.fdroidPlugins,
      ...(isProfileBuild ? [withAndroidProfileable] : []),
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      autolinkingModuleResolution: true,
    },
    extra: {
      fdroidBuild: isFdroidBuild,
      profileBuild: isProfileBuild,
      router: {},
      eas: {
        projectId: "0e7f65ce-0367-46c8-a238-2b65963d235a",
      },
    },
    owner: "getpaseo",
  },
};
