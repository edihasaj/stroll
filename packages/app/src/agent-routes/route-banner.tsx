import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { readAgentRouteLabels, type AgentRouteFailureReason } from "@getpaseo/protocol/agent-route";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ToastApi } from "@/components/toast-host";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { useSessionStore } from "@/stores/session-store";
import { useAgentRoutesConfig } from "./internal/use-agent-routes-config";
import { resolveRouteBannerViewModel } from "./internal/route-banner-model";

interface RoutedAgentSummary {
  /** The route profile the agent runs on, falling back to its title. */
  name: string | null;
  reason: AgentRouteFailureReason | null;
}

/**
 * A continuation usually carries its predecessor's title, so the banner names the profile each
 * agent ran on ("Qwen (Spark)", "Codex (personal)") instead.
 */
function useRoutedAgentSummary(
  serverId: string,
  agentId: string | null,
  config: Pick<ReturnType<typeof useAgentRoutesConfig>, "routes" | "profiles">,
): RoutedAgentSummary {
  const agent = useSessionStore((state) => {
    if (!agentId) return null;
    const session = state.sessions[serverId];
    return session?.agents.get(agentId) ?? session?.agentDetails.get(agentId) ?? null;
  });
  return useMemo(() => {
    if (!agent) return { name: null, reason: null };
    const labels = readAgentRouteLabels(agent.labels ?? null);
    const route = config.routes?.find((candidate) => candidate.id === labels?.routeId);
    const entry =
      labels?.entryIndex !== null && labels?.entryIndex !== undefined
        ? route?.entries[labels.entryIndex]
        : undefined;
    const profileName = entry
      ? (config.profiles?.find((profile) => profile.id === entry.profileId)?.name ?? null)
      : null;
    return {
      name: profileName ?? agent.title ?? agent.model ?? null,
      reason: labels?.reason ?? null,
    };
  }, [agent, config.routes, config.profiles]);
}

/**
 * The banner the agent panel shows above its composer for a routed thread — failover offers,
 * pauses, and continuations (docs/agent-routes.md). Renders nothing for an agent that never
 * started on a route.
 */
export function RouteBanner({
  serverId,
  agentId,
  toast,
}: {
  serverId: string;
  agentId: string;
  toast: ToastApi;
}): ReactElement | null {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const labelsSnapshot = useSessionStore(
    (state) => state.sessions[serverId]?.agents.get(agentId)?.labels,
  );
  const labels = useMemo(() => readAgentRouteLabels(labelsSnapshot ?? null), [labelsSnapshot]);
  const { routes, profiles } = useAgentRoutesConfig(serverId);
  const nextProfileName = useMemo(
    () => profiles?.find((profile) => profile.id === labels?.nextProfileId)?.name ?? null,
    [profiles, labels?.nextProfileId],
  );
  const continuedBy = useRoutedAgentSummary(serverId, labels?.continuedByAgentId ?? null, {
    routes,
    profiles,
  });
  const previous = useRoutedAgentSummary(serverId, labels?.continuesAgentId ?? null, {
    routes,
    profiles,
  });
  const viewModel = useMemo(
    () =>
      resolveRouteBannerViewModel(
        {
          labels,
          nextProfileName,
          continuedByAgentTitle: continuedBy.name,
          previousAgentTitle: previous.name,
          previousReason: previous.reason,
        },
        t,
      ),
    [labels, nextProfileName, continuedBy.name, previous.name, previous.reason, t],
  );
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = useCallback(
    async (operation: "continue" | "switch_back") => {
      if (!client) return;
      setIsMoving(true);
      try {
        const result =
          operation === "continue"
            ? await client.continueAgentRoute(agentId)
            : await client.switchBackAgentRoute(agentId);
        if (result.targetAgentId) {
          navigateToAgent({ serverId, agentId: result.targetAgentId });
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setIsMoving(false);
      }
    },
    [agentId, client, serverId, toast],
  );
  const handleContinue = useCallback(() => void handleMove("continue"), [handleMove]);
  const handleUndo = useCallback(() => void handleMove("switch_back"), [handleMove]);
  const handleOpenContinuation = useCallback(() => {
    if (viewModel.kind === "continued") {
      navigateToAgent({ serverId, agentId: viewModel.continuedByAgentId });
    }
  }, [serverId, viewModel]);

  if (viewModel.kind === "none") {
    return null;
  }

  if (viewModel.kind === "awaiting_choice") {
    return (
      <BannerFrame>
        <Alert variant="info" description={viewModel.message} testID="agent-route-banner">
          <Button
            size="sm"
            variant="outline"
            onPress={handleContinue}
            loading={isMoving}
            testID="agent-route-banner-continue"
          >
            {t("agentRoutes.banner.continueAction")}
          </Button>
        </Alert>
      </BannerFrame>
    );
  }

  if (viewModel.kind === "paused") {
    return (
      <BannerFrame>
        <Alert variant="warning" description={viewModel.message} testID="agent-route-banner">
          <Button
            size="sm"
            variant="outline"
            onPress={handleContinue}
            loading={isMoving}
            testID="agent-route-banner-resume"
          >
            {t("agentRoutes.banner.resumeAction")}
          </Button>
        </Alert>
      </BannerFrame>
    );
  }

  if (viewModel.kind === "continued") {
    return (
      <BannerFrame>
        <Alert variant="default" description={viewModel.message} testID="agent-route-banner">
          <Button
            size="sm"
            variant="outline"
            onPress={handleOpenContinuation}
            testID="agent-route-banner-open"
          >
            {t("agentRoutes.banner.openAction")}
          </Button>
        </Alert>
      </BannerFrame>
    );
  }

  return (
    <BannerFrame>
      <Alert variant="default" description={viewModel.message} testID="agent-route-banner">
        <Button
          size="sm"
          variant="outline"
          onPress={handleUndo}
          loading={isMoving}
          testID="agent-route-banner-undo"
        >
          {t("agentRoutes.banner.undoAction")}
        </Button>
      </Alert>
    </BannerFrame>
  );
}

/** Lines the banner up with the composer column below it. */
function BannerFrame({ children }: { children: ReactNode }): ReactElement {
  return (
    <View style={styles.frame}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  frame: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  column: {
    width: "100%",
    maxWidth: theme.contentMaxWidth,
  },
}));
