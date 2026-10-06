import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentBriefPayload } from "@getpaseo/client/internal/daemon-client";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useFetchQuery } from "@/data/query";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import type { ToastApi } from "@/components/toast-host";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { ICON_SIZE } from "@/styles/theme";
import { joinBriefList, splitBriefList } from "./internal/brief-text";
import { useAgentRoutesConfig } from "./internal/use-agent-routes-config";
import { AgentBriefHistorySection } from "./brief-sheet-history";

const ThemedRefreshCw = withUnistyles(RefreshCw);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

interface BriefEditState {
  goal: string;
  state: string;
  decisionsText: string;
  openItemsText: string;
  filesText: string;
}

function seedEditState(payload: AgentBriefPayload | undefined): BriefEditState | null {
  if (!payload?.brief) return null;
  const { brief } = payload;
  return {
    goal: brief.goal,
    state: brief.state,
    decisionsText: joinBriefList(brief.decisions),
    openItemsText: joinBriefList(brief.openItems),
    filesText: joinBriefList(brief.files),
  };
}

function AgentBriefSheetBody({
  serverId,
  agentId,
  onClose,
  toast,
}: {
  serverId: string;
  agentId: string;
  onClose: () => void;
  toast: ToastApi;
}): ReactElement {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const queryClient = useQueryClient();
  const { profiles } = useAgentRoutesConfig(serverId);
  const queryKey = useMemo(() => ["agent-brief", serverId, agentId] as const, [serverId, agentId]);
  const briefQuery = useFetchQuery({
    queryKey,
    enabled: Boolean(client),
    dataShape: "value",
    // Always current on open: the sheet's body unmounts when closed (see `AgentBriefSheet`
    // below), so every open is already a fresh fetch; a route can also regenerate the brief
    // between opens on its own.
    staleTimeMs: 0,
    queryFn: async () => {
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      return client.getAgentBrief(agentId);
    },
  });

  const [edit, setEdit] = useState<BriefEditState | null>(null);
  const [seedVersion, setSeedVersion] = useState(0);
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !briefQuery.data) return;
    seededRef.current = true;
    setEdit(seedEditState(briefQuery.data));
  }, [briefQuery.data]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!client) return;
    setIsRefreshing(true);
    try {
      const result = await client.getAgentBrief(agentId, { refresh: true });
      queryClient.setQueryData(queryKey, result);
      setEdit(seedEditState(result));
      setSeedVersion((version) => version + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [agentId, client, queryClient, queryKey, toast]);

  const [isSaving, setIsSaving] = useState(false);
  const handleSave = useCallback(async () => {
    if (!client || !edit) return;
    setIsSaving(true);
    try {
      const result = await client.updateAgentBrief(agentId, {
        goal: edit.goal,
        state: edit.state,
        decisions: splitBriefList(edit.decisionsText),
        openItems: splitBriefList(edit.openItemsText),
        files: splitBriefList(edit.filesText),
      });
      queryClient.setQueryData(
        queryKey,
        (previous: AgentBriefPayload | undefined): AgentBriefPayload | undefined =>
          previous ? { ...previous, brief: result.brief } : previous,
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }, [agentId, client, edit, onClose, queryClient, queryKey, toast]);

  const setField = useCallback(
    (field: keyof BriefEditState) => (text: string) =>
      setEdit((previous) => (previous ? { ...previous, [field]: text } : previous)),
    [],
  );
  const handleGoalChange = useMemo(() => setField("goal"), [setField]);
  const handleStateChange = useMemo(() => setField("state"), [setField]);
  const handleDecisionsChange = useMemo(() => setField("decisionsText"), [setField]);
  const handleOpenItemsChange = useMemo(() => setField("openItemsText"), [setField]);
  const handleFilesChange = useMemo(() => setField("filesText"), [setField]);
  const handleRetryLoad = useCallback(() => void briefQuery.refetch(), [briefQuery]);

  if (briefQuery.isLoading) {
    return (
      <View style={styles.centered} testID="agent-brief-loading">
        <ThemedLoadingSpinner size="large" uniProps={mutedIconColorMapping} />
      </View>
    );
  }

  if (briefQuery.isError) {
    return (
      <View style={styles.centered} testID="agent-brief-error">
        <Text style={styles.emptyText}>{t("agentRoutes.brief.loadFailed")}</Text>
        <Button size="sm" variant="secondary" onPress={handleRetryLoad}>
          {t("common.actions.retry")}
        </Button>
      </View>
    );
  }

  if (!edit) {
    return (
      <View style={styles.centered} testID="agent-brief-empty">
        <Text style={styles.emptyText}>{t("agentRoutes.brief.empty")}</Text>
        <Button
          size="sm"
          variant="secondary"
          onPress={handleRefresh}
          loading={isRefreshing}
          testID="agent-brief-empty-refresh"
        >
          {t("agentRoutes.brief.refresh")}
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <Pressable
        onPress={handleRefresh}
        disabled={isRefreshing}
        style={styles.refreshRow}
        accessibilityRole="button"
        accessibilityLabel={t("agentRoutes.brief.refresh")}
        testID="agent-brief-refresh"
      >
        {isRefreshing ? (
          <ThemedLoadingSpinner size={14} uniProps={mutedIconColorMapping} />
        ) : (
          <ThemedRefreshCw size={ICON_SIZE.sm} uniProps={mutedIconColorMapping} />
        )}
        <Text style={styles.refreshLabel}>
          {isRefreshing ? t("agentRoutes.brief.refreshing") : t("agentRoutes.brief.refresh")}
        </Text>
      </Pressable>
      <Field label={t("agentRoutes.brief.goal")}>
        <FormTextInput
          multiline
          initialValue={edit.goal}
          resetKey={seedVersion}
          onChangeText={handleGoalChange}
          style={styles.textArea}
          testID="agent-brief-goal"
        />
      </Field>
      <Field label={t("agentRoutes.brief.state")}>
        <FormTextInput
          multiline
          initialValue={edit.state}
          resetKey={seedVersion}
          onChangeText={handleStateChange}
          style={styles.textArea}
          testID="agent-brief-state"
        />
      </Field>
      <Field label={t("agentRoutes.brief.decisions")} hint={t("agentRoutes.brief.oneLineHint")}>
        <FormTextInput
          multiline
          initialValue={edit.decisionsText}
          resetKey={seedVersion}
          onChangeText={handleDecisionsChange}
          style={styles.textArea}
          testID="agent-brief-decisions"
        />
      </Field>
      <Field label={t("agentRoutes.brief.openItems")} hint={t("agentRoutes.brief.oneLineHint")}>
        <FormTextInput
          multiline
          initialValue={edit.openItemsText}
          resetKey={seedVersion}
          onChangeText={handleOpenItemsChange}
          style={styles.textArea}
          testID="agent-brief-open-items"
        />
      </Field>
      <Field label={t("agentRoutes.brief.files")} hint={t("agentRoutes.brief.oneLineHint")}>
        <FormTextInput
          multiline
          initialValue={edit.filesText}
          resetKey={seedVersion}
          onChangeText={handleFilesChange}
          style={styles.textArea}
          testID="agent-brief-files"
        />
      </Field>
      <AgentBriefHistorySection
        handoffPreview={briefQuery.data?.handoffPreview ?? null}
        events={briefQuery.data?.events ?? []}
        profiles={profiles}
      />
      <BriefFormActions onSave={handleSave} onCancel={onClose} isSaving={isSaving} />
    </View>
  );
}

/**
 * Save/cancel for the brief form, inside the scrollable body rather than the sheet's sticky
 * `footer` prop — the same shape `add-host-modal.tsx` uses, since this form's content varies
 * enough in height (a long handoff preview, a long history) that a pinned footer would float
 * over content on a short sheet and separate from it on a tall one.
 */
function BriefFormActions({
  onSave,
  onCancel,
  isSaving,
}: {
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <View style={styles.actions}>
      <Button variant="secondary" size="md" onPress={onCancel} disabled={isSaving}>
        {t("common.actions.cancel")}
      </Button>
      <Button
        variant="default"
        size="md"
        onPress={onSave}
        loading={isSaving}
        testID="agent-brief-save"
      >
        {isSaving ? t("agentRoutes.brief.saving") : t("agentRoutes.brief.save")}
      </Button>
    </View>
  );
}

/**
 * The thread brief and handoff history (docs/agent-routes.md). Opened from the agent panel's
 * Context toolbar button, which owns the `visible`/`onClose` open state.
 */
export function AgentBriefSheet({
  serverId,
  agentId,
  visible,
  onClose,
  toast,
}: {
  serverId: string;
  agentId: string;
  visible: boolean;
  onClose: () => void;
  toast: ToastApi;
}): ReactElement {
  const { t } = useTranslation();
  const header = useMemo<SheetHeader>(() => ({ title: t("agentRoutes.brief.title") }), [t]);

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      desktopMaxWidth={520}
      testID="agent-brief-sheet"
    >
      {visible ? (
        <AgentBriefSheetBody
          key={agentId}
          serverId={serverId}
          agentId={agentId}
          onClose={onClose}
          toast={toast}
        />
      ) : null}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  centered: {
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[8],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  form: {
    gap: theme.spacing[4],
  },
  refreshRow: {
    flexDirection: "row",
    alignSelf: "flex-end",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  refreshLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
