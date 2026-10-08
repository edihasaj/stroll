import type { Ref } from "react";
import { useDroppable } from "@dnd-kit/core";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export interface PaneDropHover {
  paneId: string;
}

export interface PaneDropZoneProps {
  paneId: string;
  active: boolean;
  preview: PaneDropHover | null;
}

export function buildPaneDropZoneId(paneId: string): string {
  return `pane-drop:${paneId}`;
}

export function PaneDropZone({ paneId, active, preview }: PaneDropZoneProps) {
  const { setNodeRef } = useDroppable({
    id: buildPaneDropZoneId(paneId),
    disabled: !active,
    data: {
      kind: "pane-drop",
      paneId,
    },
  });

  if (!active) {
    return null;
  }

  return (
    <View ref={setNodeRef as unknown as Ref<View>} style={styles.overlay} pointerEvents="none">
      {preview?.paneId === paneId ? (
        <>
          <View pointerEvents="none" style={styles.previewOverlay} />
          <View pointerEvents="none" style={styles.previewFrame} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  previewOverlay: {
    position: "absolute",
    left: theme.spacing[2],
    top: theme.spacing[2],
    right: theme.spacing[2],
    bottom: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent,
    opacity: 0.6,
  },
  previewFrame: {
    position: "absolute",
    left: theme.spacing[2],
    top: theme.spacing[2],
    right: theme.spacing[2],
    bottom: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
}));
