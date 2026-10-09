import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/contexts/toast-context";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { confirmDialog } from "@/utils/confirm-dialog";
import { McpServerFormSheet, type McpServerFormTarget } from "./mcp-server-form-sheet";
import type { McpServerFormResult } from "./mcp-server-form-model";
import {
  listMcpServerRows,
  removeMcpServer,
  setMcpServerEnabled,
  upsertMcpServer,
  type McpServerRow,
  type McpServers,
} from "./mcp-servers-model";
import { useMcpServers } from "./use-mcp-servers";

const ThemedPlus = withUnistyles(Plus);
const ThemedPencil = withUnistyles(Pencil);
const ThemedTrash2 = withUnistyles(Trash2);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const addIcon = <ThemedPlus size={ICON_SIZE.sm} uniProps={mutedColorMapping} />;
const editIcon = <ThemedPencil size={ICON_SIZE.sm} uniProps={mutedColorMapping} />;
const removeIcon = <ThemedTrash2 size={ICON_SIZE.sm} uniProps={destructiveColorMapping} />;

export function McpServersSection({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const { state, saveServers } = useMcpServers(serverId);
  const [target, setTarget] = useState<McpServerFormTarget | null>(null);
  const servers: McpServers | null = state.status === "loaded" ? state.servers : null;

  const handleAdd = useCallback(() => {
    if (!servers) return;
    setTarget({ mode: "create", otherNames: Object.keys(servers) });
  }, [servers]);

  const handleEdit = useCallback(
    (name: string) => {
      const value = servers?.[name];
      if (!servers || !value) return;
      setTarget({
        mode: "edit",
        server: { name, value },
        otherNames: Object.keys(servers).filter((other) => other !== name),
      });
    },
    [servers],
  );

  const handleClose = useCallback(() => setTarget(null), []);

  const handleSave = useCallback(
    async (result: McpServerFormResult, previousName: string | undefined) => {
      await saveServers(upsertMcpServer(servers ?? {}, { ...result, previousName }));
    },
    [saveServers, servers],
  );

  const persist = useCallback(
    async (next: McpServers) => {
      try {
        await saveServers(next);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("common.errors.unableToSave"));
      }
    },
    [saveServers, t, toast],
  );

  const handleToggle = useCallback(
    (name: string, enabled: boolean) => {
      if (!servers) return;
      void persist(setMcpServerEnabled(servers, name, enabled));
    },
    [persist, servers],
  );

  const handleRemove = useCallback(
    async (name: string) => {
      if (!servers) return;
      const confirmed = await confirmDialog({
        title: t("settings.host.mcpServers.removeConfirmTitle"),
        message: t("settings.host.mcpServers.removeConfirmMessage", { name }),
        confirmLabel: t("settings.host.mcpServers.remove"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      });
      if (confirmed) {
        await persist(removeMcpServer(servers, name));
      }
    },
    [persist, servers, t],
  );

  const handleRemovePress = useCallback(
    (name: string) => {
      void handleRemove(name);
    },
    [handleRemove],
  );

  const addButton = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        leftIcon={addIcon}
        onPress={handleAdd}
        disabled={!servers}
        accessibilityLabel={t("settings.host.mcpServers.addTitle")}
        testID="mcp-servers-add-button"
      />
    ),
    [handleAdd, servers, t],
  );

  const rows = useMemo(() => (servers ? listMcpServerRows(servers) : []), [servers]);

  return (
    <>
      <SettingsSection
        title={t("settings.host.mcpServers.sectionTitle")}
        info={t("settings.host.mcpServers.info")}
        trailing={state.status === "loaded" ? addButton : undefined}
        testID="mcp-servers-section"
      >
        <View style={settingsStyles.card} testID="mcp-servers-card">
          {state.status === "loaded" && rows.length > 0 ? (
            rows.map((row, index) => (
              <McpServerRowView
                key={row.name}
                row={row}
                isFirst={index === 0}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onRemove={handleRemovePress}
              />
            ))
          ) : (
            <View style={styles.emptyCard} testID="mcp-servers-empty">
              <Text style={styles.emptyText}>{emptyMessage(state.status, t)}</Text>
            </View>
          )}
        </View>
      </SettingsSection>
      <McpServerFormSheet target={target} onClose={handleClose} onSave={handleSave} />
    </>
  );
}

function emptyMessage(
  status: "disconnected" | "unsupported" | "loading" | "loaded",
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (status) {
    case "disconnected":
      return t("settings.host.mcpServers.unavailable");
    case "unsupported":
      return t("settings.host.mcpServers.unsupported");
    case "loading":
      return t("settings.host.mcpServers.loading");
    case "loaded":
      return t("settings.host.mcpServers.empty");
  }
}

interface McpServerRowViewProps {
  row: McpServerRow;
  isFirst: boolean;
  onToggle: (name: string, enabled: boolean) => void;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
}

function McpServerRowView({
  row,
  isFirst,
  onToggle,
  onEdit,
  onRemove,
}: McpServerRowViewProps): ReactElement {
  const { t } = useTranslation();
  const handleToggle = useCallback(
    (enabled: boolean) => onToggle(row.name, enabled),
    [onToggle, row.name],
  );
  const handleEdit = useCallback(() => onEdit(row.name), [onEdit, row.name]);
  const handleRemove = useCallback(() => onRemove(row.name), [onRemove, row.name]);
  const rowStyle = useMemo(
    () => [settingsStyles.row, isFirst ? null : settingsStyles.rowBorder, styles.row],
    [isFirst],
  );

  return (
    <View style={rowStyle} testID={`mcp-server-row-${row.name}`}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.summary} numberOfLines={1}>
          {row.summary}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <Switch
          value={row.enabled}
          onValueChange={handleToggle}
          accessibilityLabel={t("settings.host.mcpServers.toggleAccessibility", {
            name: row.name,
          })}
          testID={`mcp-server-toggle-${row.name}`}
        />
        <Button
          variant="ghost"
          size="sm"
          leftIcon={editIcon}
          onPress={handleEdit}
          accessibilityLabel={t("settings.host.mcpServers.edit")}
          testID={`mcp-server-edit-${row.name}`}
        />
        <Button
          variant="ghost"
          size="sm"
          leftIcon={removeIcon}
          onPress={handleRemove}
          accessibilityLabel={t("settings.host.mcpServers.remove")}
          testID={`mcp-server-remove-${row.name}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: theme.spacing[2],
    minHeight: 56,
  },
  summary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
    marginTop: theme.spacing[1],
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  emptyCard: {
    padding: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
