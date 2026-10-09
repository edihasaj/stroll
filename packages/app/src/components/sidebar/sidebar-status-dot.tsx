import type { ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";
import { STATUS_INDICATOR_FILLED_DOT_SIZE } from "@/utils/status-indicator-geometry";

function dotStyle(bucket: SidebarStateBucket) {
  switch (bucket) {
    case "needs_input":
      return styles.needsInput;
    case "failed":
      return styles.failed;
    case "running":
      return styles.running;
    case "attention":
      return styles.attention;
    case "done":
      return null;
  }
}

/** The filled status dot for a sidebar bucket; an idle bucket has none. */
export function SidebarStatusDot({
  bucket,
  testID,
}: {
  bucket: SidebarStateBucket;
  testID?: string;
}): ReactElement | null {
  const style = dotStyle(bucket);
  return style ? <View testID={testID} style={style} /> : null;
}

const styles = StyleSheet.create((theme) => ({
  needsInput: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
  },
  failed: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined,
  },
  running: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "running" }) ?? undefined,
  },
  attention: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
  },
}));
