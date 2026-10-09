import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingsSection, SettingsCard, SettingsSelect } from "@/components/settings";
import {
  useAppSettings,
  type PullRequestOpenLocation,
  type ServiceUrlBehavior,
} from "@/hooks/use-settings";

/**
 * The main view holds one chat, so a pull request never opens there: it opens beside the chat or in
 * Explorer. A saved "main" from before shows as the side pane, where it now opens.
 */
const PULL_REQUEST_DESTINATIONS = ["side", "explorer"] as const;

const SERVICE_URL_BEHAVIORS: readonly ServiceUrlBehavior[] = ["ask", "in-app", "external"];

const SERVICE_URL_LABEL_KEYS: Record<ServiceUrlBehavior, string> = {
  ask: "settings.general.serviceUrls.options.ask",
  "in-app": "settings.general.serviceUrls.options.inApp",
  external: "settings.general.serviceUrls.options.external",
};

function PullRequestLocationRow() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const options = useMemo(
    () =>
      PULL_REQUEST_DESTINATIONS.map((value) => ({
        value,
        label: t(`settings.layout.openInSidePane.destinations.${value}`),
      })),
    [t],
  );
  const change = useCallback(
    (pullRequestOpenLocation: PullRequestOpenLocation) =>
      void updateSettings({ pullRequestOpenLocation }),
    [updateSettings],
  );
  return (
    <SettingsSelect
      label={t("settings.layout.openInSidePane.sources.pullRequests.label")}
      value={
        settings.pullRequestOpenLocation === "main" ? "side" : settings.pullRequestOpenLocation
      }
      options={options}
      onValueChange={change}
    />
  );
}

function ServiceUrlRow() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const options = useMemo(
    () =>
      SERVICE_URL_BEHAVIORS.map((value) => ({ value, label: t(SERVICE_URL_LABEL_KEYS[value]) })),
    [t],
  );
  const change = useCallback(
    (serviceUrlBehavior: ServiceUrlBehavior) => void updateSettings({ serviceUrlBehavior }),
    [updateSettings],
  );
  return (
    <SettingsSelect
      label={t("settings.layout.openInSidePane.sources.serviceUrls.label")}
      value={settings.serviceUrlBehavior}
      options={options}
      onValueChange={change}
    />
  );
}

/** Where pull requests and script URLs open. Desktop only. */
export function OpenLocationSection() {
  const { t } = useTranslation();
  return (
    <SettingsSection title={t("settings.layout.openInSidePane.title")}>
      <SettingsCard>
        <PullRequestLocationRow />
        <ServiceUrlRow />
      </SettingsCard>
    </SettingsSection>
  );
}
