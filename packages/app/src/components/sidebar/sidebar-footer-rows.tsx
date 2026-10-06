import { useRef } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SidebarSeparator } from "@/components/sidebar/sidebar-separator";
import { PluginSidebarItem } from "@/plugins/sidebar-items";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import { UsageSidebarItem, useHasUsageSummary } from "@/usage";

/**
 * The footer rows in the user's `sidebarFooterItems` order: the Usage item and plugin rows. The
 * Usage item is left out while it has no summary to show. Shared by the mobile sidebar and the
 * desktop panel footer, which sit in different trees.
 */
export function SidebarFooterRows({ onBeforeNavigate }: { onBeforeNavigate?: () => void }) {
  const { items } = useSidebarNavItems("footer");
  const hasUsageSummary = useHasUsageSummary();
  const rowsRef = useRef<View | null>(null);
  const visibleItems = items.filter(
    (item) => item.visible && (item.kind === "plugin" || hasUsageSummary),
  );
  if (visibleItems.length === 0) return null;
  return (
    <>
      <View ref={rowsRef} collapsable={false} style={styles.footerRows}>
        {visibleItems.map((item) =>
          item.kind === "plugin" ? (
            <PluginSidebarItem
              key={item.key}
              group={item.group}
              section="footer"
              fallbackAnchorRef={rowsRef}
              onBeforeNavigate={onBeforeNavigate}
            />
          ) : (
            <UsageSidebarItem key={item.key} />
          ),
        )}
      </View>
      <SidebarSeparator testID="sidebar-footer-separator" />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  footerRows: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    gap: 2,
  },
}));
