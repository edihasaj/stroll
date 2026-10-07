import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import type { SubagentRow } from "./select";

export interface SubagentStopActions {
  stopSubagent: (subagentId: string) => void;
  /** Asks first, then interrupts every running managed subagent. Undefined while none runs. */
  stopAllActive: (() => Promise<void>) | undefined;
}

/** Stop actions for a parent's subagents, shared by the composer pill and the Subagents panel. */
export function useStopSubagents({
  serverId,
  rows,
}: {
  serverId: string;
  rows: readonly SubagentRow[];
}): SubagentStopActions {
  const { t } = useTranslation();
  // Keyed by row id so a stop call routes to the host that actually owns the row — the parent's
  // own host for an ordinary subagent, another connected host for one spawned there (peers.md).
  const hostServerIdById = useMemo(
    () => new Map(rows.map((row) => [row.id, row.hostServerId] as const)),
    [rows],
  );
  const resolveClient = useCallback(
    (subagentId: string) => {
      const hostServerId = hostServerIdById.get(subagentId) ?? serverId;
      return useSessionStore.getState().sessions[hostServerId]?.client ?? null;
    },
    [hostServerIdById, serverId],
  );
  const activeManagedSubagentIds = useMemo(
    () =>
      rows.filter((row) => row.kind === "paseo" && row.status === "running").map((row) => row.id),
    [rows],
  );
  const stopSubagent = useCallback(
    (subagentId: string) => {
      const client = resolveClient(subagentId);
      if (!client) return;
      void client.cancelAgent(subagentId).catch(() => undefined);
    },
    [resolveClient],
  );
  const stopAll = useCallback(async () => {
    if (activeManagedSubagentIds.length === 0) return;
    const names = rows
      .filter((row) => activeManagedSubagentIds.includes(row.id))
      .map((row) => row.title)
      .join(", ");
    const confirmed = await confirmDialog({
      title: t("subagents.stopAllConfirmTitle"),
      message: t("subagents.stopAllConfirmMessage", {
        count: activeManagedSubagentIds.length,
        names,
      }),
      confirmLabel: t("subagents.stopAllAction"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) return;
    await Promise.all(
      activeManagedSubagentIds.map((subagentId) =>
        resolveClient(subagentId)?.cancelAgent(subagentId),
      ),
    );
  }, [activeManagedSubagentIds, resolveClient, rows, t]);
  return {
    stopSubagent,
    stopAllActive: activeManagedSubagentIds.length > 0 ? stopAll : undefined,
  };
}
