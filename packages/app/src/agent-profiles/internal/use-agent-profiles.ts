import { useCallback } from "react";
import type { AgentProfile } from "@getpaseo/protocol/messages";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useSessionStore } from "@/stores/session-store";
import { supportsAgentProfiles } from "./capabilities";

export interface UseAgentProfilesResult {
  /** `null` until the daemon config has arrived. */
  profiles: AgentProfile[] | null;
  /** False on daemons that predate agent profiles, or while disconnected. */
  isSupported: boolean;
  /** Writes the whole list; there is no per-profile RPC. */
  saveProfiles: (next: AgentProfile[]) => Promise<void>;
  /** `null` until the daemon config has arrived, or when there is no default. */
  defaultProfileId: string | null;
  /** `null` clears the default; profiles themselves stay config.json-only. */
  setDefaultProfile: (profileId: string | null) => Promise<void>;
}

export function useAgentProfiles(serverId: string | null): UseAgentProfilesResult {
  const { config, patchConfig } = useDaemonConfig(serverId);
  const isSupported = useSessionStore((state) => {
    return supportsAgentProfiles(state.sessions[serverId ?? ""]?.serverInfo?.features);
  });

  const saveProfiles = useCallback(
    async (next: AgentProfile[]) => {
      await patchConfig({ agentProfiles: next });
    },
    [patchConfig],
  );

  const setDefaultProfile = useCallback(
    async (profileId: string | null) => {
      await patchConfig({ defaultAgentProfile: profileId });
    },
    [patchConfig],
  );

  return {
    profiles: config ? (config.agentProfiles ?? []) : null,
    isSupported,
    saveProfiles,
    defaultProfileId: config ? (config.defaultAgentProfile ?? null) : null,
    setDefaultProfile,
  };
}
