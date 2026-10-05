import type { ReactElement, RefObject } from "react";
import { Pressable, Text, View } from "react-native";
import { Folder, GitBranch, Monitor } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedFolder = withUnistyles(Folder, mutedColorMapping);
const ThemedGitBranch = withUnistyles(GitBranch, mutedColorMapping);
const ThemedMonitor = withUnistyles(Monitor, mutedColorMapping);

export type ContextStripItemKind = "project" | "branch" | "machine";

export interface ContextStripItem {
  kind: ContextStripItemKind;
  key: string;
  label: string;
  /** Present only when the item is a real, working picker — a read-only label when absent. */
  onPress?: () => void;
  anchorRef?: RefObject<View | null>;
  testID?: string;
}

interface ChatContextStripProps {
  items: ContextStripItem[];
  testID?: string;
}

const STRIP_ICON_SIZE = 14;

function StripIcon({ kind }: { kind: ContextStripItemKind }): ReactElement {
  if (kind === "project") return <ThemedFolder size={STRIP_ICON_SIZE} />;
  if (kind === "branch") return <ThemedGitBranch size={STRIP_ICON_SIZE} />;
  return <ThemedMonitor size={STRIP_ICON_SIZE} />;
}

function ContextStripEntry({ item }: { item: ContextStripItem }): ReactElement {
  if (!item.onPress) {
    return (
      <View style={styles.item}>
        <StripIcon kind={item.kind} />
        <Text style={styles.label} numberOfLines={1}>
          {item.label}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      ref={item.anchorRef}
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      testID={item.testID}
      // Self-styling hover only (render-prop form) — the hovered flag never drives state
      // outside this Pressable, so it is exempt from the canonical hover pattern
      // (docs/hover.md, "What about Pressable.onHoverIn / onHoverOut?").
      style={styles.item}
    >
      {({ hovered }: { hovered?: boolean }) => (
        <>
          <StripIcon kind={item.kind} />
          <Text style={[styles.label, hovered && styles.labelHovered]} numberOfLines={1}>
            {item.label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** The context strip above the composer (new chat and workspace chats): project, branch
 * (git workspaces only), and machine. Real pickers where the flow backing them exists;
 * read-only labels otherwise — see docs/design.md §16. */
export function ChatContextStrip({ items, testID }: ChatContextStripProps): ReactElement {
  return (
    <View style={styles.strip} testID={testID}>
      {items.map((item) => (
        <ContextStripEntry key={item.key} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  strip: {
    backgroundColor: theme.colors.surfaceComposerStrip,
    borderTopLeftRadius: theme.borderRadius["2xl"],
    borderTopRightRadius: theme.borderRadius["2xl"],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2.5],
    // Generous bottom padding — the composer card overlaps this strip's bottom edge by
    // ~14px (negative margin at the call site), so the strip's own content needs to clear
    // that overlap with room to spare.
    paddingBottom: theme.spacing[6],
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  label: {
    fontSize: 13,
    color: theme.colors.foregroundMuted,
    maxWidth: 220,
  },
  labelHovered: {
    color: theme.colors.foreground,
  },
}));
