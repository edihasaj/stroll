import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { HostPicker } from "@/components/hosts/host-picker";
import { useActiveHostSummary } from "@/components/sidebar/use-active-host-summary";
import { SidebarFooterRows } from "@/components/sidebar/sidebar-footer-rows";
import { deriveIdentityColorName, identityColor } from "@/styles/identity-colors";
import { UsageSidebarRoot } from "@/usage";

function sidebarPanelHostOptionTestID(serverId: string): string {
  return `sidebar-panel-host-row-${serverId}`;
}

/**
 * The panel footer: the Usage and plugin footer rows, then an identity-color avatar carrying the
 * active host's initial plus its name. Import session, Help, and Settings used to share this row — they moved to the
 * rail's `•••` menu and the rail's own Settings icon respectively, so the footer is only ever
 * the host identity trigger (the same `<HostPicker>` the rail's Chats icon and the old brand row
 * both opened — one menu, converged triggers, per docs/design.md §12). Keeps the mobile sidebar's
 * `sidebar-hosts-trigger`/`sidebar-footer`/`sidebar-footer-bottom-line` ids — the two footers are
 * siblings in the same sense as `sidebar-settings` (`left-sidebar.tsx`'s `SidebarFooter`): only
 * one of the two ever mounts for a given breakpoint. Needs its own `<UsageSidebarRoot>` — Mobile's
 * `SidebarFooter` carries one, but this tree is a separate branch under `SidebarPanel`, so without
 * one here `UsageSidebarItem`'s `useOpenSidebarUsage()` throws the moment the Usage row is visible.
 */
export function SidebarPanelFooter({
  onAddHost,
  onOpenHostSettings,
}: {
  onAddHost: () => void;
  onOpenHostSettings: (serverId: string) => void;
}) {
  const { hosts, serverId, label } = useActiveHostSummary();
  const triggerRef = useRef<View | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback((id: string) => onOpenHostSettings(id), [onOpenHostSettings]);
  const handleOpen = useCallback(() => setIsOpen(true), []);
  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      hovered && styles.triggerHovered,
    ],
    [],
  );

  return (
    <UsageSidebarRoot>
      <View testID="sidebar-footer">
        <SidebarFooterRows />
        <View style={styles.footer} testID="sidebar-footer-bottom-line">
          <HostPicker
            hosts={hosts}
            value=""
            onSelect={handleSelect}
            open={isOpen}
            onOpenChange={setIsOpen}
            anchorRef={triggerRef}
            includeAddHost
            onAddHost={onAddHost}
            showActiveConnection
            onOpenHostSettings={onOpenHostSettings}
            searchable
            desktopPlacement="top-start"
            desktopMinWidth={240}
            addHostTestID="sidebar-panel-host-add"
            hostOptionTestID={sidebarPanelHostOptionTestID}
          >
            <Pressable
              ref={triggerRef}
              style={triggerStyle}
              onPress={handleOpen}
              testID="sidebar-hosts-trigger"
              nativeID="sidebar-hosts-trigger"
              accessible
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: identityColor(deriveIdentityColorName(serverId ?? label)) },
                ]}
              >
                <Text style={styles.initial}>{label.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.label} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          </HostPicker>
        </View>
      </View>
    </UsageSidebarRoot>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderDivider,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  triggerHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  initial: {
    color: "#ffffff",
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  label: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
  },
}));
