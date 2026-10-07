import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Anchor, Square, SquareCheck } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentHookSummary } from "@getpaseo/protocol/agent-hooks";
import type { AgentControlIconProps } from "@/agent-controls/icons";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentControlTrigger } from "@/composer/agent-controls/control";
import { useToast } from "@/contexts/toast-context";
import type { Theme } from "@/styles/theme";
import { useAgentHooks } from "./use-agent-hooks";

const ThemedAnchor = withUnistyles(Anchor);
const ThemedSquare = withUnistyles(Square);
const ThemedSquareCheck = withUnistyles(SquareCheck);
const warningIconColorMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });

// The trigger passes a plain colour; the anchor takes the theme's warning colour instead, the way
// the mode pill marks an unattended mode.
function ReviewHooksIcon({ size }: AgentControlIconProps): ReactElement {
  return <ThemedAnchor size={size} uniProps={warningIconColorMapping} />;
}

/**
 * Codex's hooks badge: an anchor in the composer row, shown only while the agent has new or
 * changed hooks that its harness will not run until the user allows them. It opens the review.
 */
export const AgentHooksReviewButton = memo(function AgentHooksReviewButton({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const { needingReview, trust } = useAgentHooks(serverId, agentId);
  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  if (needingReview.length === 0) return null;
  const label = t("agentHooks.review.button", { count: needingReview.length });
  return (
    <>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild triggerRefProp="ref">
          <AgentControlTrigger
            icon={ReviewHooksIcon}
            surface="toolbar"
            label={label}
            showToolbarLabel={false}
            open={open}
            onPress={handleOpen}
            accessibilityLabel={label}
            testID="agent-hooks-review-button"
          />
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text>{label}</Text>
        </TooltipContent>
      </Tooltip>
      <HooksReviewSheet
        visible={open}
        hooks={needingReview}
        onClose={handleClose}
        onTrust={trust}
      />
    </>
  );
});

function HooksReviewSheet({
  visible,
  hooks,
  onClose,
  onTrust,
}: {
  visible: boolean;
  hooks: AgentHookSummary[];
  onClose: () => void;
  onTrust: (keys: readonly string[]) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const header = useMemo<SheetHeader>(() => ({ title: t("agentHooks.review.title") }), [t]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  // Only keys still on the list: a hook removed while the sheet was open is not sent.
  const selectedKeys = useMemo(
    () => hooks.filter((hook) => selected.has(hook.key)).map((hook) => hook.key),
    [hooks, selected],
  );
  const toggle = useCallback((key: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const allow = useCallback(
    async (keys: readonly string[]) => {
      setBusy(true);
      try {
        await onTrust(keys);
        setSelected(new Set());
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("agentHooks.review.failed"));
      } finally {
        setBusy(false);
      }
    },
    [onClose, onTrust, t, toast],
  );
  const allowSelected = useCallback(() => void allow(selectedKeys), [allow, selectedKeys]);
  const allowAll = useCallback(() => void allow(hooks.map((hook) => hook.key)), [allow, hooks]);
  const nothingSelected = selectedKeys.length === 0;
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button variant="ghost" onPress={onClose} disabled={busy}>
          {t("agentHooks.review.notNow")}
        </Button>
        <Button variant="secondary" onPress={allowAll} disabled={busy}>
          {t("agentHooks.review.allowAll")}
        </Button>
        <Button variant="default" onPress={allowSelected} disabled={busy || nothingSelected}>
          {t("agentHooks.review.allowSelected")}
        </Button>
      </View>
    ),
    [allowAll, allowSelected, busy, nothingSelected, onClose, t],
  );
  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      footer={footer}
      desktopMaxWidth={560}
      testID="agent-hooks-review-sheet"
    >
      <Text style={styles.description}>{t("agentHooks.review.description")}</Text>
      {hooks.map((hook) => (
        <HookRow key={hook.key} hook={hook} selected={selected.has(hook.key)} onToggle={toggle} />
      ))}
    </AdaptiveModalSheet>
  );
}

function HookRow({
  hook,
  selected,
  onToggle,
}: {
  hook: AgentHookSummary;
  selected: boolean;
  onToggle: (key: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onToggle(hook.key), [hook.key, onToggle]);
  const status =
    hook.trustStatus === "modified"
      ? t("agentHooks.review.statusModified")
      : t("agentHooks.review.statusNew");
  const accessibilityState = useMemo(() => ({ checked: selected }), [selected]);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={accessibilityState}
      accessibilityLabel={`${hook.event}, ${status}`}
      onPress={handlePress}
      style={styles.row}
    >
      {selected ? (
        <ThemedSquareCheck size={16} uniProps={mutedIconColorMapping} />
      ) : (
        <ThemedSquare size={16} uniProps={mutedIconColorMapping} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>
          {hook.event}
          <Text style={styles.rowMeta}>{` · ${status} · ${hook.source}`}</Text>
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {hook.sourcePath}
        </Text>
        {hook.command ? (
          <Text style={styles.rowCommand} numberOfLines={3}>
            {hook.command}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    marginBottom: theme.spacing[3],
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[0.5],
  },
  rowTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  rowMeta: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  rowCommand: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foreground,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
