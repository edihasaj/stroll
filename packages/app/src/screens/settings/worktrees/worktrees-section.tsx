import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Pin, PinOff, Trash2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useToast } from "@/contexts/toast-context";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useSidebarWorkspacePinController } from "@/hooks/use-sidebar-workspace-pin";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";
import {
  isWorktreesRootDirty,
  listWorktreeRows,
  normalizeWorktreesRootInput,
  type WorktreeRow,
} from "./worktrees-model";

const ThemedPin = withUnistyles(Pin);
const ThemedPinOff = withUnistyles(PinOff);
const ThemedTrash2 = withUnistyles(Trash2);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const pinIcon = <ThemedPin size={ICON_SIZE.sm} uniProps={mutedColorMapping} />;
const unpinIcon = <ThemedPinOff size={ICON_SIZE.sm} uniProps={mutedColorMapping} />;
const removeIcon = <ThemedTrash2 size={ICON_SIZE.sm} uniProps={destructiveColorMapping} />;

export function WorktreesSection({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(serverId);

  if (!isConnected) {
    return (
      <SettingsSection title={t("settings.host.worktrees.listTitle")}>
        <View style={settingsStyles.card}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t("settings.host.worktrees.unavailable")}</Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  return (
    <>
      <WorktreeLocation serverId={serverId} />
      <WorktreeCleanup serverId={serverId} />
      <WorktreeList serverId={serverId} />
    </>
  );
}

function WorktreeLocation({ serverId }: { serverId: string }): ReactElement | null {
  const supported = useHostFeature(serverId, "worktreeSettings");
  const { config, patchConfig } = useDaemonConfig(serverId);
  // The field mounts only once the host's config has loaded, so `initialValue` is the real root.
  if (!supported || !config) {
    return null;
  }
  return <WorktreeLocationForm configuredRoot={config.worktrees?.root} patchConfig={patchConfig} />;
}

function WorktreeLocationForm({
  configuredRoot,
  patchConfig,
}: {
  configuredRoot: string | undefined;
  patchConfig: (patch: { worktrees: { root: string } }) => Promise<unknown>;
}): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const controlSize = useIsCompactFormFactor() ? "md" : "sm";
  const [draft, setDraft] = useState(configuredRoot ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const dirty = isWorktreesRootDirty(configuredRoot, draft);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await patchConfig({ worktrees: { root: normalizeWorktreesRootInput(draft) } });
      toast.show(t("settings.host.worktrees.location.saved"), { variant: "success" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.errors.unableToSave"));
    } finally {
      setIsSaving(false);
    }
  }, [draft, patchConfig, t, toast]);

  const handleSavePress = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  return (
    <SettingsSection
      title={t("settings.host.worktrees.location.title")}
      testID="worktrees-location-section"
    >
      <View style={[settingsStyles.card, styles.locationCard]}>
        <Field
          label={t("settings.host.worktrees.location.label")}
          hint={t("settings.host.worktrees.location.hint")}
        >
          <View style={styles.locationControls}>
            <View style={styles.locationInput}>
              <FormTextInput
                size={controlSize}
                testID="worktrees-root-input"
                accessibilityLabel={t("settings.host.worktrees.location.label")}
                initialValue={configuredRoot ?? ""}
                onChangeText={setDraft}
                placeholder={t("settings.host.worktrees.location.placeholder")}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Button
              variant="outline"
              size="sm"
              onPress={handleSavePress}
              disabled={!dirty}
              loading={isSaving}
              testID="worktrees-root-save"
            >
              {t("settings.host.worktrees.location.save")}
            </Button>
          </View>
        </Field>
      </View>
    </SettingsSection>
  );
}

function WorktreeCleanup({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const { config, patchConfig } = useDaemonConfig(serverId);

  const handleValueChange = useCallback(
    (next: boolean) => {
      void patchConfig({ autoArchiveAfterMerge: next }).catch((error) => {
        console.error("[Worktrees] Failed to update auto-archive after merge", error);
        toast.error(
          error instanceof Error ? error.message : t("settings.host.worktrees.autoArchive.failed"),
        );
      });
    },
    [patchConfig, t, toast],
  );

  return (
    <SettingsSection title={t("settings.host.worktrees.cleanupTitle")}>
      <View style={settingsStyles.card} testID="host-page-auto-archive-merged-workspaces-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>
              {t("settings.host.worktrees.autoArchive.title")}
            </Text>
            <Text style={settingsStyles.rowHint}>
              {t("settings.host.worktrees.autoArchive.hint")}
            </Text>
          </View>
          <Switch
            value={config?.autoArchiveAfterMerge === true}
            onValueChange={handleValueChange}
            accessibilityLabel={t("settings.host.worktrees.autoArchive.title")}
            testID="host-page-auto-archive-merged-workspaces-switch"
          />
        </View>
      </View>
    </SettingsSection>
  );
}

function WorktreeList({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const workspaces = useSessionStore((state) => state.sessions[serverId]?.workspaces);
  const rows = useMemo(() => listWorktreeRows(workspaces?.values() ?? []), [workspaces]);

  return (
    <SettingsSection
      title={t("settings.host.worktrees.listTitle")}
      info={t("settings.host.worktrees.listInfo")}
      testID="worktrees-list-section"
    >
      <View style={settingsStyles.card} testID="worktrees-list">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <WorktreeRowView
              key={row.workspaceId}
              serverId={serverId}
              row={row}
              isFirst={index === 0}
            />
          ))
        ) : (
          <View style={styles.emptyCard} testID="worktrees-empty">
            <Text style={styles.emptyText}>{t("settings.host.worktrees.empty")}</Text>
          </View>
        )}
      </View>
    </SettingsSection>
  );
}

interface WorktreeRowViewProps {
  serverId: string;
  row: WorktreeRow;
  isFirst: boolean;
}

function noop(): void {}

function WorktreeRowView({ serverId, row, isFirst }: WorktreeRowViewProps): ReactElement {
  const { t } = useTranslation();
  const togglePin = useSidebarWorkspacePinController();
  const { archive } = useWorkspaceArchive({
    serverId,
    workspaceId: row.workspaceId,
    workspaceKind: "worktree",
    name: row.name,
    isDirty: row.isDirty,
    aheadOfOrigin: row.aheadOfOrigin,
    diffStat: row.diffStat,
    onArchiveStarted: noop,
  });

  const handleTogglePin = useCallback(() => {
    togglePin({
      serverId,
      workspaceId: row.workspaceId,
      workspaceKey: `${serverId}:${row.workspaceId}`,
      pinnedAt: row.pinned ? "pinned" : null,
    });
  }, [row.pinned, row.workspaceId, serverId, togglePin]);

  const handleRemove = useCallback(async () => {
    // A risky worktree gets the archive flow's own warning listing what would be lost.
    if (!row.atRisk) {
      const confirmed = await confirmDialog({
        title: t("settings.host.worktrees.removeConfirmTitle"),
        message: t("settings.host.worktrees.removeConfirmMessage", { name: row.name }),
        confirmLabel: t("settings.host.worktrees.remove"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
    }
    archive();
  }, [archive, row.atRisk, row.name, t]);

  const handleRemovePress = useCallback(() => {
    void handleRemove();
  }, [handleRemove]);

  const rowStyle = useMemo(
    () => [settingsStyles.row, isFirst ? null : settingsStyles.rowBorder, styles.row],
    [isFirst],
  );
  const subtitle = [row.projectName, row.branch].filter(Boolean).join(" · ");

  return (
    <View style={rowStyle} testID={`worktree-row-${row.workspaceId}`}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={styles.path} numberOfLines={1}>
          {row.path}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={row.pinned ? unpinIcon : pinIcon}
          onPress={handleTogglePin}
          accessibilityLabel={
            row.pinned ? t("sidebar.workspace.actions.unpin") : t("sidebar.workspace.actions.pin")
          }
          testID={`worktree-pin-${row.workspaceId}`}
        />
        <Button
          variant="ghost"
          size="sm"
          leftIcon={removeIcon}
          onPress={handleRemovePress}
          disabled={!row.riskKnown}
          accessibilityLabel={t("settings.host.worktrees.remove")}
          testID={`worktree-remove-${row.workspaceId}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  locationCard: {
    padding: theme.spacing[4],
  },
  locationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  locationInput: {
    flex: 1,
  },
  row: {
    gap: theme.spacing[2],
    minHeight: 56,
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  path: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  emptyCard: {
    padding: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
