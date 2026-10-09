import { useCallback, useMemo, useState, useSyncExternalStore, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { DaemonMcpServer } from "@getpaseo/protocol/daemon-mcp-server";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { useIsCompactFormFactor } from "@/constants/layout";
import {
  openMcpServerForm,
  type McpServerFormErrors,
  type McpServerFormModel,
  type McpServerFormResult,
  type McpTransport,
} from "./mcp-server-form-model";

export interface McpServerFormTarget {
  mode: "create" | "edit";
  server?: { name: string; value: DaemonMcpServer };
  otherNames: readonly string[];
}

interface McpServerFormSheetProps {
  target: McpServerFormTarget | null;
  onClose: () => void;
  onSave: (result: McpServerFormResult, previousName: string | undefined) => Promise<void>;
}

/** Mounts a fresh form per open; a closed sheet holds no form at all (docs/forms.md). */
export function McpServerFormSheet({
  target,
  onClose,
  onSave,
}: McpServerFormSheetProps): ReactElement | null {
  if (!target) {
    return null;
  }
  return (
    <OpenMcpServerFormSheet
      key={`${target.mode}:${target.server?.name ?? ""}`}
      target={target}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function OpenMcpServerFormSheet({
  target,
  onClose,
  onSave,
}: Omit<McpServerFormSheetProps, "target"> & { target: McpServerFormTarget }): ReactElement {
  const { t } = useTranslation();
  const [model] = useState(() =>
    openMcpServerForm({
      mode: target.mode,
      otherNames: target.otherNames,
      server: target.server,
    }),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const previousName = target.server?.name;

  const handleSubmit = useCallback(async () => {
    const result = model.submit();
    if (!result) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSave(result, previousName);
      onClose();
    } catch (error) {
      model.setSubmitError(
        error instanceof Error ? error.message : t("common.errors.unableToSave"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [model, onClose, onSave, previousName, t]);

  const handleSubmitPress = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  const header = useMemo<SheetHeader>(
    () => ({
      title:
        target.mode === "edit"
          ? t("settings.host.mcpServers.editTitle")
          : t("settings.host.mcpServers.addTitle"),
    }),
    [t, target.mode],
  );

  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button
          style={styles.footerButton}
          variant="secondary"
          onPress={onClose}
          disabled={isSubmitting}
          testID="mcp-server-cancel"
        >
          {t("common.actions.cancel")}
        </Button>
        <Button
          style={styles.footerButton}
          variant="default"
          onPress={handleSubmitPress}
          loading={isSubmitting}
          testID="mcp-server-save"
        >
          {t("settings.host.mcpServers.save")}
        </Button>
      </View>
    ),
    [handleSubmitPress, isSubmitting, onClose, t],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible
      onClose={onClose}
      footer={footer}
      testID="mcp-server-form-sheet"
    >
      <McpServerFormFields model={model} />
    </AdaptiveModalSheet>
  );
}

function fieldError(
  t: ReturnType<typeof useTranslation>["t"],
  field: keyof McpServerFormErrors,
  errors: McpServerFormErrors,
): string | undefined {
  const code = errors[field];
  return code ? t(`settings.host.mcpServers.errors.${field}.${code}`) : undefined;
}

function McpServerFormFields({ model }: { model: McpServerFormModel }): ReactElement {
  const { t } = useTranslation();
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const controlSize = useIsCompactFormFactor() ? "md" : "sm";
  const transportOptions = useMemo<SegmentedControlOption<McpTransport>[]>(
    () => [
      {
        value: "stdio",
        label: t("settings.host.mcpServers.transport.stdio"),
        testID: "mcp-transport-stdio",
      },
      {
        value: "http",
        label: t("settings.host.mcpServers.transport.http"),
        testID: "mcp-transport-http",
      },
      {
        value: "sse",
        label: t("settings.host.mcpServers.transport.sse"),
        testID: "mcp-transport-sse",
      },
    ],
    [t],
  );

  return (
    <>
      <Field
        label={t("settings.host.mcpServers.nameLabel")}
        error={fieldError(t, "name", state.errors)}
        testID="mcp-server-name-field"
      >
        <FormTextInput
          size={controlSize}
          testID="mcp-server-name-input"
          accessibilityLabel={t("settings.host.mcpServers.nameLabel")}
          initialValue={state.name}
          onChangeText={model.setName}
          placeholder={t("settings.host.mcpServers.namePlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>

      <Field label={t("settings.host.mcpServers.transportLabel")}>
        <SegmentedControl
          options={transportOptions}
          value={state.transport}
          onValueChange={model.setTransport}
          size={controlSize}
          testID="mcp-server-transport"
        />
      </Field>

      {state.disclosure.showCommandFields ? (
        <>
          <Field
            label={t("settings.host.mcpServers.commandLabel")}
            error={fieldError(t, "command", state.errors)}
            testID="mcp-server-command-field"
          >
            <FormTextInput
              size={controlSize}
              testID="mcp-server-command-input"
              accessibilityLabel={t("settings.host.mcpServers.commandLabel")}
              initialValue={state.command}
              onChangeText={model.setCommand}
              placeholder={t("settings.host.mcpServers.commandPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <Field label={t("settings.host.mcpServers.argsLabel")}>
            <FormTextInput
              size={controlSize}
              testID="mcp-server-args-input"
              accessibilityLabel={t("settings.host.mcpServers.argsLabel")}
              initialValue={state.args}
              onChangeText={model.setArgs}
              placeholder={t("settings.host.mcpServers.argsPlaceholder")}
              style={styles.multilineInput}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <Field
            label={t("settings.host.mcpServers.envLabel")}
            error={fieldError(t, "env", state.errors)}
            testID="mcp-server-env-field"
          >
            <FormTextInput
              size={controlSize}
              testID="mcp-server-env-input"
              accessibilityLabel={t("settings.host.mcpServers.envLabel")}
              initialValue={state.env}
              onChangeText={model.setEnv}
              placeholder={t("settings.host.mcpServers.envPlaceholder")}
              style={styles.multilineInput}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        </>
      ) : null}

      {state.disclosure.showUrlFields ? (
        <>
          <Field
            label={t("settings.host.mcpServers.urlLabel")}
            error={fieldError(t, "url", state.errors)}
            testID="mcp-server-url-field"
          >
            <FormTextInput
              size={controlSize}
              testID="mcp-server-url-input"
              accessibilityLabel={t("settings.host.mcpServers.urlLabel")}
              initialValue={state.url}
              onChangeText={model.setUrl}
              placeholder={t("settings.host.mcpServers.urlPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>
          <Field
            label={t("settings.host.mcpServers.headersLabel")}
            error={fieldError(t, "headers", state.errors)}
            testID="mcp-server-headers-field"
          >
            <FormTextInput
              size={controlSize}
              testID="mcp-server-headers-input"
              accessibilityLabel={t("settings.host.mcpServers.headersLabel")}
              initialValue={state.headers}
              onChangeText={model.setHeaders}
              placeholder={t("settings.host.mcpServers.headersPlaceholder")}
              style={styles.multilineInput}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        </>
      ) : null}

      {state.submitError ? (
        <Text style={styles.submitError} testID="mcp-server-submit-error">
          {state.submitError}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    flex: 1,
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  footerButton: {
    flex: 1,
  },
  multilineInput: {
    minHeight: 72,
  },
  submitError: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
}));
