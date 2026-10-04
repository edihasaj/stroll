import { StyleSheet } from "react-native-unistyles";

export const settingsStyles = StyleSheet.create((theme) => ({
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
    marginLeft: theme.spacing[1],
  },
  sectionHeaderTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  sectionHeaderLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  sectionHeaderLinkText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  // Light lifts the card off the page with a soft shadow on a brighter fill; dark
  // has nowhere brighter to go, so it lifts with a one-line inset highlight on the
  // card's own surface step instead. Both keep the same hairline border underneath
  // the elevation — see docs/design.md "Finish".
  card: {
    backgroundColor: theme.colorScheme === "dark" ? theme.colors.surface1 : theme.colors.surface0,
    // Cards/settings cards sit on `xl` — see docs/design.md "Finish" radius mapping.
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    boxShadow: theme.colorScheme === "dark" ? theme.shadow.insetHighlight : theme.shadow.xs,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  rowBorder: {
    borderTopWidth: 1,
    // The softer row-separator, not the card's outer hairline — rows inside a card
    // already belong together (docs/design.md "Finish").
    borderTopColor: theme.colors.borderDivider,
  },
  rowContent: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  rowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  rowHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  rowError: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
}));
