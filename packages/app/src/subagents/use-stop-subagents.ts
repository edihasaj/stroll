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
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const activeManagedSubagentIds = useMemo(
    () =>
      rows.filter((row) => row.kind === "paseo" && row.status === "running").map((row) => row.id),
    [rows],
  );
  const stopSubagent = useCallback(
    (subagentId: string) => {
      if (!client) return;
      void client.cancelAgent(subagentId).catch(() => undefined);
    },
    [client],
  );
  const stopAll = useCallback(async () => {
    if (!client || activeManagedSubagentIds.length === 0) return;
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
    await Promise.all(activeManagedSubagentIds.map((subagentId) => client.cancelAgent(subagentId)));
  }, [activeManagedSubagentIds, client, rows, t]);
  return {
    stopSubagent,
    stopAllActive: activeManagedSubagentIds.length > 0 ? stopAll : undefined,
  };
}
