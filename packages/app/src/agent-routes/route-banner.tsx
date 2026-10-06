import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { readAgentRouteLabels } from "@getpaseo/protocol/agent-route";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ToastApi } from "@/components/toast-host";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { useSessionStore } from "@/stores/session-store";
import { useAgentRoutesConfig } from "./internal/use-agent-routes-config";
import { resolveRouteBannerViewModel } from "./internal/route-banner-model";

function useAgentDisplayName(serverId: string, agentId: string | null): string | null {
  return useSessionStore((state) => {
    if (!agentId) return null;
    const session = state.sessions[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    return agent?.title ?? agent?.model ?? null;
  });
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
  const { profiles } = useAgentRoutesConfig(serverId);
  const nextProfileName = useMemo(
    () => profiles?.find((profile) => profile.id === labels?.nextProfileId)?.name ?? null,
    [profiles, labels?.nextProfileId],
  );
  const continuedByAgentTitle = useAgentDisplayName(serverId, labels?.continuedByAgentId ?? null);
  const previousAgentTitle = useAgentDisplayName(serverId, labels?.continuesAgentId ?? null);
  const viewModel = useMemo(
    () =>
      resolveRouteBannerViewModel(
        { labels, nextProfileName, continuedByAgentTitle, previousAgentTitle },
        t,
      ),
    [labels, nextProfileName, continuedByAgentTitle, previousAgentTitle, t],
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
    );
  }

  if (viewModel.kind === "paused") {
    return (
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
    );
  }

  if (viewModel.kind === "continued") {
    return (
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
    );
  }

  return (
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
  );
}
