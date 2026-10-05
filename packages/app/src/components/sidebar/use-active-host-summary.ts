import { useTranslation } from "react-i18next";
import { useEarliestOnlineHostServerId } from "@/app/_layout";
import { friendlyHostDisplayName } from "@/hosts/display-name";
import { useHosts } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { HostProfile } from "@/types/host-connection";

export interface ActiveHostSummary {
  hosts: HostProfile[];
  serverId: string | null;
  host: HostProfile | null;
  label: string;
}

/**
 * The host the sidebar's identity chrome (brand row, footer) should name: the active
 * workspace's host, falling back to the earliest host that is online. Shared so the two
 * chrome rows that show "which host am I talking to" never resolve it differently.
 */
export function useActiveHostSummary(): ActiveHostSummary {
  const { t } = useTranslation();
  const hosts = useHosts();
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const onlineHostServerId = useEarliestOnlineHostServerId();
  const serverId = activeWorkspaceSelection?.serverId ?? onlineHostServerId ?? null;
  const host = hosts.find((candidate) => candidate.serverId === serverId) ?? null;
  const label = host ? friendlyHostDisplayName(host) : t("sidebar.help.appName");
  return { hosts, serverId, host, label };
}
