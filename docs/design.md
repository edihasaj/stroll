# Design

Tokens — every color, font size, weight, spacing step, radius, icon size, letter spacing — live in `packages/app/src/styles/theme.ts`.

---

## 1. Character

Paseo is minimal, spacious, quiet, confident. Whitespace is deliberate. Nothing crowds, nothing decorates, nothing apologizes. A row, a label, a control. That is the bar.

The app is calm so the user's work is not. Every visual decision serves either _act on this_ or _understand this_ — never _look at this_.

**Monochrome.** There is no brand accent. `accent` — the one-CTA fill, the focus ring, the switch's on-state — is a neutral: near-white in dark, near-black in light. Color is reserved for status: `statusDanger`/`statusWarning`/`statusSuccess`/`statusMerged` and their dot variants (§13) are the only hues left in the UI. A theme whose job is to look like a brand (Midnight, Claude) still gets to have one — see "Dark tint definitions" in `theme.ts` — but the built-in Light/Dark pair does not, and `success` is wired to the status family rather than to `accent` specifically so that stays true even where a tint's accent happens to be colored.

Both built-in themes read as two tones of chrome plus one working surface: a sidebar/icon-rail tone (`surfaceSidebar`) and a canvas tone (`surface0`/`background`), with `surfaceComposer`/`surfaceComposerStrip` as the two raised tones the composer card and its context strip sit on. The light theme's chrome is neutral off-white (sidebar, cards, dividers) around a pure white working surface, separated by hairline borders instead of shadows — no warm undertone left in either theme.

Consistency comes from component reuse, not from hand-matching styles across surfaces. A row in the projects list, a row in settings, and a row in a modal are the same component, not three implementations that happen to look alike. When two surfaces do the same semantic thing in two different ways, one of them is wrong.

---

## 2. Component reuse

A semantic element used in three or more places is a primitive. One of a kind is a screen.

Primitives live in `packages/app/src/components/ui/` and `packages/app/src/components/headers/`. Card and row layout live in `packages/app/src/styles/settings.ts`. Section structure lives in `packages/app/src/screens/settings/settings-section.tsx`.

A pressable styled to look like a button is wrong; the button is `<Button>` (`packages/app/src/components/ui/button.tsx`). A bare `<Text>` styled to look like a section header is wrong; the section header is `<SettingsSection>` (`packages/app/src/screens/settings/settings-section.tsx`). A custom `Modal` for a confirmation is wrong; the confirmation is `confirmDialog` (`packages/app/src/utils/confirm-dialog.ts`). A hand-rolled overflow menu is wrong; the menu is `<DropdownMenu>` (`packages/app/src/components/ui/dropdown-menu.tsx`). A hand-rolled status pill is wrong; the pill is `<StatusBadge>` (`packages/app/src/components/ui/status-badge.tsx`). A circle pinned over a scrolling surface is wrong; the floating action is `<FloatingActionButton>` (`packages/app/src/components/ui/floating-action-button.tsx`), one per surface, and the surface reserves `FLOATING_ACTION_BUTTON_CLEARANCE` below its content so the button never traps the last row.

Before adding a new component, read `components/ui/`. The primitive usually exists.

---

## 3. Hierarchy

Hierarchy is conveyed through weight and color, not size. Most interface text is `fontSize.base`; compact metadata and hints use `fontSize.sm`. The distinction between a row's primary line and its secondary line is `foreground` versus `foregroundMuted`.

The authored interface ramp uses a 14px base. New native installs default to 15px; web and desktop default to 14px. The Appearance **Interface size** setting is the rendered `fontSize.base` value and scales the rest of the UI ramp proportionally. Primary readable content has its own `fontSize.content`, which defaults to 16px on native and 15px on web and desktop. It owns message bodies, composer input, Markdown, and PR prose. Controls, navigation, metadata, tool chrome, code, diffs, editors, and terminals stay on their interface or code tokens. **Code size** remains independent.

Weight has three tiers, applied by role:

- **Screen titles** — the title in app chrome — use `<ScreenTitle>` (`packages/app/src/components/headers/screen-title.tsx`), which renders `fontSize.base` at weight `400` on compact and `300` on desktop. The new-chat hero is the only larger product title; it's a pinned 28px/-0.015em literal on desktop (22px on compact), not a ramp step — see `packages/app/src/screens/new-workspace/chat-hero.tsx` and §16.
- **Structural labels** use `fontWeight.medium`. This applies to section labels above a stack of rows (`packages/app/src/components/agent-list.tsx:519-523`, `packages/app/src/components/keyboard-shortcuts-dialog.tsx:63-67`), form field labels above an input inside a modal (`packages/app/src/components/add-host-modal.tsx:19-23`, `packages/app/src/components/pair-link-modal.tsx:24-28`), the title at the top of a modal/sheet/dialog (`packages/app/src/components/adaptive-modal-sheet.tsx:90-94`, `packages/app/src/components/ui/combobox.tsx:1607-1611`, `packages/app/src/components/welcome-screen.tsx:48-53`), action button labels in tight components such as the sidebar callout actions (`packages/app/src/components/sidebar-callout.tsx:218-221`), and inline data emphasis on dense metadata rows (`packages/app/src/components/git-diff-pane.tsx:2322-2327`, `packages/app/src/components/file-explorer-pane.tsx:1115-1122`).
- **Content** uses `fontWeight.normal`. This applies to settings rows (`packages/app/src/styles/settings.ts`), sidebar primary list-item titles (`packages/app/src/components/sidebar-workspace-list.tsx:2680-2686`, `packages/app/src/components/agent-list.tsx:572-578`), `<Button>` text (`packages/app/src/components/ui/button.tsx:80-84`), `<StatusBadge>` text (`packages/app/src/components/ui/status-badge.tsx:56-60`), and `<SidebarCallout>` titles (`packages/app/src/components/sidebar-callout.tsx:175-180`).

The rule, condensed: text that _names_ a surface or a group is `medium`. Text that lives _inside_ a surface or a group is `normal`. Top-of-screen titles are `<ScreenTitle>`, which is lighter still.

A structural label at `fontSize.xl` (18px) or larger layers on a fourth signal: tightened tracking, and often `fontWeight.semibold` in place of `medium` — see "Finish" in §5 for the exact tokens. `<ScreenTitle>` is exempt; it never crosses 18px and stays at its own fixed weights.

The sidebar's group headers — the SESSIONS header, and the collapsible label and status groups below it (`packages/app/src/components/sidebar/sidebar-status-list.tsx`, `packages/app/src/components/sidebar/pinned-section-header.tsx`) — carry `medium` further: `fontSize.sm` (the smallest ramp step), `textTransform: "uppercase"`, and `letterSpacing.wide`, the one letter-spacing token in the theme. Reserve that combination for these small-caps sidebar group labels; a regular structural label stays sentence case. Each collapsible group leads with a permanent `ChevronDown`/`ChevronRight` toggle rather than swapping an icon in on hover — the affordance for "this collapses" should not itself be hidden behind hover. The desktop panel's own "Projects" header (`packages/app/src/components/sidebar/sidebar-panel-projects-header.tsx`, §9) is the one exception: sentence case, `fontSize.sm` (13px), `foregroundExtraMuted`, no uppercase or tracking — the Codex-parity rail+panel it belongs to mirrors that surface's own quieter section label rather than this sidebar's small-caps convention.

Foreground is for the thing being acted on: row titles, section headings, the selected sidebar item. `foregroundMuted` is for context: hints, descriptions, secondary metadata, idle sidebar items, placeholders, status text.

`foregroundExtraMuted` is reserved for passive chrome that must sit behind muted text, such as an always-visible window control. Use the solid token instead of lowering SVG opacity; per-path opacity makes overlapping icon strokes render unevenly. Interactive hover and pressed states return to `foreground`.

Accent is the one CTA per surface. A `<Button variant="default">` filled with `accent` appears at most once on a page. Most pages have zero — settings is mostly toggles and text, the workspace pane is mostly content, the chat composer is the input itself.

Destructive is a color, not a click. Restart-daemon and remove-host are `<Button variant="outline">` in the row trailing slot; the destructive surface only appears inside the `confirmDialog` (`packages/app/src/screens/settings/host-page.tsx:541-547`). Workspace archive opens a confirm dialog before any red appears (`packages/app/src/components/sidebar-workspace-list.tsx`). Red appears after the user has indicated intent.

---

## 4. Buttons

The button is `<Button>` (`packages/app/src/components/ui/button.tsx`). It has five variants. Each has one job. Every variant shares `borderRadius.md` (8), a `pressed` state that scales to `0.98` rather than dimming (the same curve icon buttons use — `icon-button-chrome.ts`), a `focusRing`/`focusBorder` pair on focus (web `:focus-visible`-shaped via `onFocus`/`onBlur`; native focus where supported), and `disabled` as opacity only (§11). See "Finish" in §5 for the token definitions.

`default` is the one primary action on a surface — filled with `accent`, a 1px `border` hairline (the same alpha-black/white hairline used everywhere, composited over the accent fill it reads as "a touch darker," not a second colour), `shadow.xs` plus `insetHighlight` for a soft top lift. Its label is the one button text that takes `fontWeight.medium` and a hair of negative tracking (`theme.textTracking.button`) — every other variant's label stays `normal`/untracked. Hover brightens (`opacity: 0.92`) rather than darkening — the inverse of a hairline control's hover. At most one per page. The primary slot inside an `<AdaptiveModalSheet>` and the highlighted action on the welcome screen are the canonical uses.

`secondary` is the paired action when two actions carry equal weight. Light sits as a raised `surface0` (white) card with a `border` hairline and `shadow.xs`; dark sits as a `surface2` panel with the same hairline and `insetHighlight` instead of a shadow, since a dark surface's own shadow barely reads. Hover raises the border to `borderAccent`. The component default is `secondary`, which matches its frequency in the codebase.

`outline` is the low-frequency action that lives on a row — transparent fill, `border` hairline (not `borderAccent` — that's reserved for secondary's hover and the picker-panel border in §6). Hover fills with `interactionHighlight` rather than swapping the border colour. Restart, Remove, Update on host detail (`packages/app/src/screens/settings/host-page.tsx:585-594`).

`ghost` is structural and non-committal — no border, no fill, unchanged by the Finish pass beyond the shared radius/press/focus rules above. Back arrows, header toggles, "Load more" footers (`packages/app/src/screens/sessions-screen.tsx:54-63`), more-affordances. Ghost is used when the affordance is part of the chrome, not a decision.

Header and toolbar controls use `interactionHighlight` for hovered, pressed, open, and selected
backgrounds. It is a translucent semantic fill so the same control works over the main surface and
the sidebar. Apply it as `backgroundColor`; setting `opacity` on the control also fades its content.

`destructive` gets `default`'s treatment (border, shadow, hover brighten) with the `destructive` fill. It only appears inside a confirm. The button on the page is `outline`; the destructive button is the confirm button inside the dialog.

Sizes: `xs` for ultra-tight inline triggers. `sm` for any button sitting in a row. `md` is the page default. `lg` is reserved for large standalone CTAs.

Sizes are a shared contract across control kinds, defined once in `control-geometry.ts`: `xs` = 28px tall with `fontSize.sm` labels, `sm` = 32px with `fontSize.base`, `md`/`lg` = 44px with `fontSize.base`. Every size shares the same `borderRadius.md` — radius no longer scales with size. `<SegmentedControl>` (`packages/app/src/components/ui/segmented-control.tsx`) takes the same `xs`/`sm`/`md` sizes — a segmented control next to a `<Button>` of the same size always matches in height and label size, and its track shares the button's `md` radius; the selected segment itself sits one step tighter at `borderRadius.base`, since it's inset inside the track's own padding and a matching radius there reads as too loose. Its segments run one padding step tighter than a button, because the gap between segments already reads as padding. The selected segment is a `background`/`surface0` fill with `shadow.xs` and `foreground` text, not an inverted one — inverting it inside thin chrome puts a white slab in the toolbar. Thin chrome such as the file toolbar uses `xs`; settings rows use `sm`. Never shrink a control's font or padding locally to fit a context — if the context needs a smaller control, the size tier is missing or the wrong one is in use.

A `<Pressable>` wrapping a `<Text>` is a sixth variant. It is wrong. `<Button>` accepts `style`, `textStyle`, `leftIcon`, `disabled`, `size`, and `variant`.

---

## 5. Borders

Borders group, separate, or rarely emphasize.

A logical block of related rows lives inside a card — one border around the whole group. The card primitive is `settingsStyles.card`; the keyboard-shortcuts dialog uses the same shape inline (`packages/app/src/components/keyboard-shortcuts-dialog.tsx:68-73`). The border defines what belongs together.

Rows after the first inside a card carry `settingsStyles.rowBorder` — a single top border. The first row never has one. The same divider pattern appears in the keyboard-shortcuts dialog rows (`packages/app/src/components/keyboard-shortcuts-dialog.tsx:74-83`). Rows do not need their own background to feel separated.

A list that is itself the page content — sidebar items in `sidebar-workspace-list.tsx`, the workspace list, the agent list (`packages/app/src/components/agent-list.tsx`) — uses spacing and surface, not borders, to separate items. Rows-in-a-card is an interior pattern; lists-as-pages are not.

Pane chrome — the workspace pane header, the file-explorer header, the diff pane header — uses a single bottom border to separate the header from the content (`packages/app/src/components/git-diff-pane.tsx:2328-2331`). One border, no shadow.

`borderAccent` is reserved for the outline button. Inputs use `border`. Single-thing borders are wrong; a single bordered element is either a card with one row (use the card) or it does not need a border.

### Finish

The modernization pass (fonts, radius, borders, elevation, focus) that brought the app up from its original flatter finish. Downstream work on buttons, inputs, and surfaces builds on these tokens — read this before changing any of them.

**Fonts.** The interface font is Geist; the code font is Geist Mono. Both are vendored under `packages/app/assets/fonts/geist/` (native TTFs, statically linked — see the `expo-font` plugin block in `packages/app/app.config.js`) and `packages/app/public/fonts/geist/` (web/Electron WOFF2s, declared as `@font-face` in `packages/app/public/index.html` with `font-display: swap`), SIL OFL 1.1 (`LICENSE.txt` ships beside both copies). `DEFAULT_UI_FONT_STACK` and `DEFAULT_MONO_FONT_STACK` (`packages/app/src/styles/theme.ts`) lead with `"Geist"`/`"Geist Mono"` ahead of the previous platform-native fallback chain, so a user-configured interface/code font empty string still resolves to Geist. Three weights are linked — Regular (400), Medium (500), SemiBold (600) for Geist; Regular and Medium for Geist Mono — under one family name per face, so existing `fontFamily` + `fontWeight` call sites keep working unchanged; nothing above this layer needs to know weights are separate files. The "Prose font" setting's "System" option now means the UI font (Geist) on every platform, not each platform's native sans — `defaultProseFont` (`packages/app/src/hooks/use-settings/storage.ts`) returns `"system"` everywhere; "Serif" remains a pick, and a stored legacy `"serif"` default flips to `"system"` once via the `prose-font-modern` migration (`packages/app/src/hooks/use-settings/migrations.ts`) — picking Serif again afterward sticks.

Headings at `fontSize.xl` (18px) and up tighten their tracking: `theme.textTracking.tightXl`/`tight2xl`/`tight3xl`/`tight4xl` (−0.2 to −0.4px, computed per size since RN `letterSpacing` is absolute px, not em). `textTracking.wide` is the existing small-caps sidebar-label value, unchanged. Body text, labels, and buttons stay untracked. Counts, timestamps, diff stats, and token counts use `theme.tabularNums` (spread into a `Text` style) so digits don't shift width as they update in place.

**Radius.** `BORDER_RADIUS` (`packages/app/src/styles/theme.ts`): `none` 0, `sm` 3, `base` 5, `md` 8, `lg` 10, `xl` 14, `2xl` 18, `full` 9999. The mapping: buttons `md`, inputs `lg`, cards and settings cards `xl`, the composer card `2xl`, menus/popovers/pickers `xl` (tooltips `md`), pills and badges `full`, sidebar rows `md`, code block fences `lg`. A component this scale doesn't name is one radius step looser than it used to be by design — that's the modernization. A few call sites are pinned to a literal instead of a token because the scale shift reads wrong at their size (both tagged with a comment pointing here): the composer's stop-glyph mark (`packages/app/src/composer/index.tsx`, a 10px square that needs to stay crisp, not rounded).

**Borders are alpha hairlines, not solid hex.** `border`, `borderAccent` (the strong/hover/outline-button variant), and `borderDivider` (the softer row-separator inside a card, one step quieter than `border`) are `rgba()` values composited over whatever surface draws beneath them: light uses black at 0.08/0.14/0.06, dark uses white at 0.07/0.12/0.05. This is one formula for every built-in theme — Paper light and every dark tint (Paseo, Zinc, Midnight, Claude, Ghostty, Pure black) — because compositing white or black over a tinted surface lightens or darkens toward that surface's own hue rather than desaturating it to neutral grey, so e.g. Midnight's blue-tinted dark surfaces still show a blue-leaning hairline without a per-tint hex. A plugin-contributed theme may still override `border`/`borderAccent` with its author's own hex (part of the existing plugin palette contract); `borderDivider` is not part of that contract and always derives from the formula. `insetHighlight` (`theme.shadow.insetHighlight`) is a one-line inset highlight for raised surfaces — `inset 0 1px 0 rgba(255,255,255,0.04)` dark, `inset 0 1px 0 rgba(255,255,255,0.6)` light — composed alongside an elevation step, not instead of it.

Cards (settings cards, the composer's task-progress card, `packages/app/src/composer/task-list/index.tsx`) apply that pairing concretely, and the two themes diverge on purpose: light has nowhere brighter than the page to lift a card to, so it fills `surface0` and lifts with `shadow.xs`; dark fills `surface1` and lifts with `insetHighlight` on that surface's own step instead of a shadow. Both keep the `border` hairline underneath either way. Rows inside those cards keep using `borderDivider`, one step quieter than the card's own outline — see §12.

**Elevation is a layered shadow with a 1px ring, never a heavy border.** `theme.shadow` (`xs`/`sm`/`md`/`lg`) are `boxShadow` CSS strings, not `shadowColor`/`shadowOffset`/`shadowRadius`/`elevation` objects — RN's new architecture renders the CSS `boxShadow` string on `View` on every platform this app ships from this checkout. `md` and `lg` each carry a `0 0 0 1px` ring ahead of their soft falloff; that ring is how elevation separates a surface from its background without reaching for a visible border color. Apply as `boxShadow: theme.shadow.md` — never spread (`...theme.shadow.md` was the pre-modernization shape; it no longer works, since the token is a string). Because the ring already does a border's job, a floating panel that sits on `shadow.md`/`shadow.lg` — menus, the combobox panel, tooltips, `<AdaptiveModalSheet>` — does not also pair it with a `borderAccent` hairline; that pairing was an earlier step of the modernization and is gone (§6).

**Focus is a ring, not a border-color swap.** `theme.shadow.focusRing` is a `0 0 0 3px` ring in the active theme's own accent at ~22% alpha; `theme.colors.focusBorder` is the same accent at ~55% alpha, for the 1px edge right at the control. Every theme computes both from its own `accent`, so Midnight focuses blue and Claude focuses orange rather than one fixed color. Buttons and inputs (next up) pair `borderColor: theme.colors.focusBorder` with `boxShadow: theme.shadow.focusRing` on focus.

---

## 6. Pickers

Five primitives. The pick is determined by option count, the need to search, and how the picker is anchored.

`<DropdownMenu>` is for a small fixed set anchored to a trigger. Theme picker, kebab menus on workspace and project rows (`packages/app/src/components/sidebar-workspace-list.tsx:684-770`), row "more" menus. Items can be async (`status: "pending"`) and can include destructive entries. Under ~10 options where the user knows what they're looking for.

`<Combobox>` is for a large or searchable list. Host switcher in the sidebar footer, model selector in the composer, branch switcher in the workspace header (`packages/app/src/components/branch-switcher.tsx`). The user types to find the option, or the list is long enough to scroll.

`<ContextMenu>` is for right-click and long-press on a target. The row is the trigger; there is no visible affordance. Used for incidental actions on workspace rows in the sidebar (`packages/app/src/components/sidebar-workspace-list.tsx`).

`<AdaptiveModalSheet>` is for a focused task. Multi-field forms (`packages/app/src/components/add-host-modal.tsx`, `packages/app/src/components/pair-link-modal.tsx`, `packages/app/src/components/project-picker-modal.tsx`), confirmations with detail, anything that earns a backdrop. Bottom sheet on compact, centered card on desktop. Raw `Modal` is wrong for any of these.

`<AdaptiveModalSheet>` owns the presentation. Its content inset — the gutter that puts sheet content on the same rails as the sheet header — and compact bottom safe-area padding are the sheet's, not the caller's. A caller declares layout intent through `contentStyle` and never branches on form factor to add its own margins. If a sheet's first snap point is shorter than its header, content, and safe-area clearance, raise that snap point rather than moving the sheet container.

`confirmDialog` is for destructive yes/no and imperative confirmation. Promise-based: `await confirmDialog({ destructive: true, ... })`. Anything where a wrong click loses work.

Three themes is `DropdownMenu`. Thirty hosts is `Combobox`. A label and a value is `AdaptiveModalSheet`. "Are you sure?" is `confirmDialog`.

### Picker chrome

`DropdownMenu`, `ContextMenu`, and `Combobox` share one panel shape: `surface1`, `borderRadius.xl`, `shadow.md` — no separate hairline border; `shadow.md`'s own 1px ring does that job (§5 "Finish"). Rows sit on `borderRadius.md` and fill `interactionHighlight` on hover, press, and active (the row you're inside, not the row you chose) — never `surface2`, which is reserved for a trigger's open state. A selected row draws a trailing `Check` (`iconSize.sm`, `foreground`) instead of a background; a submenu row's `ChevronRight` is 12px and `foregroundMuted`. Section labels (`MenuLabel`) are `fontSize.sm`, `fontWeight.medium`, uppercase, `letterSpacing.wide`, `foregroundMuted`. Popovers hold a floor of 220 desktop width regardless of trigger size.

A combobox's search row sits inside the panel with a leading `Search` glyph and no box of its own — just a hairline divider below it. An empty result is `foregroundMuted`, centered, in a 32px row.

`DropdownTrigger` and `ComboboxTrigger` are quiet ghost pills where they sit in a toolbar, a row's trailing slot, or the composer: transparent at rest, `interactionHighlight` on hover, `surface2` once open. The trailing `ChevronDown` is 12px `foregroundMuted`.

`SelectField` stands alone as a form control — a settings row's only content, not a trigger sharing a row with other controls — so it takes the full text-input field chrome instead of the ghost-pill look: `borderRadius.lg`, the scheme's field fill and rest shadow, a `border` hairline that moves to `borderAccent` on hover and `focusBorder` + `shadow.focusRing` on open/focus (`control-geometry.ts`'s shared `controlRest`/`controlHover`/`controlActive`, the same tokens `FormTextInput` uses — see "Finish" above). The fill never changes between hover and open; only the border and shadow do. This holds whether or not `field` (the `<Field>` label/hint wrapper) is set — `field={false}` only drops the wrapper, not the chrome, for a `SelectField` sharing a label with a sibling field (`cadence-editor.tsx`'s preset picker above its cron `FormTextInput`). `SelectField` keeps its row height in settings.

`<AdaptiveModalSheet>`'s desktop card is `borderRadius.xl`, `shadow.lg` — same no-separate-border rule as above. The title is `fontWeight.medium`; the close affordance is a ghost `X`. The header's bottom border is `borderDivider`. The compact sheet's grabber is `border`.

---

## 7. Density and rhythm

Settings detail pages, the projects detail page, and any list+detail content sit inside a centered, max-width 720 column (`packages/app/src/screens/settings-screen.tsx`, `packages/app/src/screens/projects-screen.tsx`). Lines stay readable, the eye does not have to track wide horizontal distances. Form modals carry their own narrower content frame (`packages/app/src/components/add-host-modal.tsx`).

Workspace and chat surfaces use the full width — these are working surfaces, not reading surfaces. The composer carries `MAX_CONTENT_WIDTH` from `packages/app/src/constants/layout.ts` to keep lines readable while letting the workspace pane fill the rest.

Sections sit apart. `<SettingsSection>` owns its own bottom margin; the next thing is wrapped in another `<SettingsSection>`. The agent-list `sectionHeading` carries the same `marginTop`/`marginBottom` rhythm (`packages/app/src/components/agent-list.tsx:511-517`). Adding `marginBottom` to a section is wrong.

A section or group explains itself through the `info` prop on `<SettingsSection>` or `<SettingsGroup>` — an info icon beside the header that opens a tooltip (`packages/app/src/components/settings/headings/settings-info-tip.tsx`). A muted paragraph between the header and the card is wrong: it sits in the section's own gap, so it reads as a second heading rather than as prose belonging to the header. Explanatory copy that describes one row belongs to that row, as `settingsStyles.rowHint` inside the card.

Cards inside a section sit closer than sections. Rows inside a card touch — only the divider separates them. The rhythm is page → spacious; section → spacious; card → tight.

Rows have generous vertical padding: roughly 16px of content plus 16px of vertical padding for settings rows, 8–12px for sidebar list items where many rows must fit. Compressing rows below the established density to fit more on the screen is wrong. Too many rows means more cards or more sections, not smaller rows.

The whitespace is the design.

---

## 8. Alignment

Things align to their glyphs, not to their boxes. A row's leading icon, its title, and the label of the button in its trailing slot sit on the same rails — the ink lines up, not the padding, not the touch target, not the hover background.

Pick the rails from the content, then hold them. A settings card establishes a leading rail at the icon's left edge and a trailing rail at the last glyph's right edge; every row in that card uses the same two. A row whose icon is absent still starts its title on the leading rail. Indentation is a new rail, not an arbitrary offset.

The pressable is bigger than the glyph, and that is fine. Hit areas grow outward from the aligned content — they never move it. A button that looks two pixels off because its padding is asymmetric is misaligned even though its box is correct.

Optical alignment beats arithmetic when a glyph disagrees with its bounding box. Icons with visual weight on one side, chevrons, and single-character labels usually need a small nudge to look centered. Trust the eye, then leave a comment saying the offset is optical.

One row off the rail makes the whole card look unconsidered.

---

## 9. Responsiveness

Compact-first. The small case is designed; the large case adds chrome around it.

The list+detail pattern is canonical and reused across surfaces. The settings shell (`packages/app/src/screens/settings-screen.tsx`) and the projects screen (`packages/app/src/screens/projects-screen.tsx`) implement it identically:

- On compact: full-screen list with `<BackHeader>` at the top. Tapping a row pushes a full-screen detail with its own `<BackHeader>` that returns to the list.
- On desktop: a 320px sidebar on the left holds the list with `surfaceSidebar` background. The content pane on the right holds the selected detail with `<ScreenHeader>`, `<HeaderIconBadge>`, and `<ScreenTitle>`.

The branching is one `useIsCompactFormFactor()` check at the top of the screen component. The list and the detail are the same components in both layouts; only the framing changes.

The workspace screen (`packages/app/src/screens/workspace/workspace-screen.tsx`) follows a different but parallel rule: tabs collapse on compact, desktop adds a side pane beside the main pane. The sidebar (`packages/app/src/components/left-sidebar.tsx`) is overlaid on compact and pinned on desktop.

The desktop sidebar has three states — expanded, icon-only rail, and hidden — resolved by `resolveDesktopSidebarMode` (`packages/app/src/components/desktop-sidebar-layout.ts`). Two independent toggles move between them: the keyboard shortcut, command center action, and header hamburger flip `desktop.agentListOpen` (hidden ↔ whichever of expanded/rail was last chosen — this is the toggle that owns the corner-obstruction consequences below), while the rail's own inline collapse icon flips `desktop.sidebarRailMode` and never hides the sidebar.

Expanded and rail are not one column that resizes — they are two pieces (`SidebarRail` + `SidebarPanel`, `packages/app/src/components/sidebar/`) that sit side by side, and rail mode is simply the panel disappearing. The rail is a fixed `SIDEBAR_RAIL_WIDTH` (52px) column that is always rendered while the sidebar is visible: Chats (the Stroll mark; opens the last/primary workspace view), Projects, Schedules, plugin-contributed items, a `•••` overflow (History, Import session, and every `SidebarHelpMenu` item), and Settings pinned to the bottom, each a 34px icon button behind a tooltip carrying its label and shortcut. The panel is the resizable piece next to it — `sidebarWidth` in `panel-store` is the panel's own width, not the rail+panel total, so `resolveDesktopSidebarWidth` clamps only that; `resolveDesktopSidebarEffectiveWidth`/`canDesktopAppSidebarShare` add the rail back in for layout-sharing decisions. It holds the host-filter header ("Stroll" plus a chevron over the existing host filter, and a search button opening the Command Center), a New chat row with a trailing New workspace `+`, a collapsible "Projects" section wrapping the existing project/workspace tree (`SidebarWorkspaceList`, unchanged), and a plain identity footer. The user-customizable sidebar-items setting (new workspace/new chat/history/search/schedules) still gates visibility — see `sidebar-rail-model.ts`'s `deriveSidebarRailItems`/`deriveSidebarPanelItems` — it no longer governs row order, since the rail and panel's layout is fixed.

Under each workspace row in the project tree the panel lists that workspace's chats (`packages/app/src/components/sidebar/sidebar-workspace-chats.tsx`): its non-archived root chats, most recently active first, five at a time with a compact Show more row. Subagents stay in their parent's track. A chat row is one line. Its status slot uses the workspace row's geometry, so the title lands on the workspace title's rail; idle chats leave the slot empty. The right edge holds a compact relative time that a kebab (Rename, Archive chat, Delete chat) replaces on hover, and is always a kebab on touch. Rows read from one index per host that is rebuilt when that host's agents change (`use-sidebar-workspace-chats.ts`); do not subscribe each row to the agent store. Hide chats in the workspace menu folds a list into one `N chats` row, and the fold persists per workspace in the collapsed-sections store.

Expanded ↔ rail eases the _container's_ width over `duration.slow` — the rail's own width never changes, so in practice this animates the panel's width down to zero and back. The panel itself is a plain conditional render rather than a second entering/exiting animation: §17 flags an in-flow element whose size can change as a web layout-animation hazard, and this exact sidebar is the surface that hazard was first found on. See `packages/app/src/components/left-sidebar.tsx`'s `DesktopSidebar`. Rail still owns the top-left corner exactly like expanded does; `resolveDesktopAppChromeLayout`'s corner assignment depends only on visibility, not width.

On a narrow desktop route, app navigation yields to the rendered content topology when the remaining width cannot preserve its center target: Settings keeps its 320px list + 400px detail split, and a workspace Explorer keeps its current visible width plus a 400px center pane. That is a topology decision at the app container, not a second compact breakpoint. Temporary width clamps are render-only; widening restores the user's saved sidebar widths.

Electron window controls are top-corner obstructions, not a compact-layout condition. Rendered surfaces declare which top corners they physically occupy; only those corners receive clearance. Full-window overlays redeclare both corners. A focused split pane owns both corners; if focus restoration temporarily exposes the full split tree, the split boundary reserves one top strip instead of assigning a control rectangle to an arbitrarily narrow leaf. The 720px desktop breakpoint preserves the default 320px sidebar and target 400px center width when the Explorer is closed; it is product policy, not an obstruction gate.

Windows and Linux controls are fixed window chrome, outside scrolling header content. A tab rail that reaches them ends at their obstruction and shows the shared overflow fade. On macOS, the Explorer toggle occupies a fixed top-right window slot so opening and closing Explorer does not move the pointer target.

A new list+detail feature copies the settings shell. A new workspace-shaped feature copies the workspace shell. Inventing a third shape happens in design review, not in a PR.

---

## 10. Copy and voice

Sentence case. "Pair a device", "Danger zone", "Restart daemon", "Inject Paseo tools", "No sessions yet", "Load more". Proper nouns retain casing — Paseo, Beta, Stable, Local. Title case is wrong.

No trailing periods on row titles, labels, or buttons. No trailing period on a single-clause hint: "What happens when you press Enter while the agent is running" (`packages/app/src/screens/settings-screen.tsx:271-272`). Periods exist inside multi-sentence prose: "Restarts the daemon process. The app will reconnect automatically."

Empty-state strings are short noun phrases or short sentences: "No projects yet", "Select a project", "No sessions yet" (`packages/app/src/screens/sessions-screen.tsx:74-76`), "Host not found".

Buttons are imperative: Save, Cancel, Restart, Remove, Update, Install update, Add host, Load more. In-flight labels are present-participle with a literal three-dot ellipsis: "Saving...", "Restarting...", "Removing...", "Loading...".

Error copy is direct. "Unable to remove host" (`packages/app/src/screens/settings/host-page.tsx:697`), not "Sorry, we couldn't remove the host." Recovery instructions are concrete: "Wait for it to come online before restarting." Errors describe state; they do not editorialize.

Terminology:

- Workspace, never "checkout".
- Host, except where the user-facing concept is the daemon process itself ("Restart daemon").
- Project, not "repo" or "repository".
- Provider, not "model provider".
- Session and agent are distinct: a session is a historical entry in `sessions-screen.tsx`; an agent is a live entity in the workspace.

---

## 11. States

Loading is inline by default. `<LoadingSpinner size={14} color={foregroundMuted} />` sits next to the thing it relates to (`packages/app/src/screens/settings/providers-section.tsx:227-231`). Page-level loading is a centered `<LoadingSpinner size="large">` (`packages/app/src/screens/sessions-screen.tsx:69-72`). Card-level loading is a single short line, not a spinner. In-row dropdown items use `<DropdownMenuItem status="pending" pendingLabel="Removing...">`; the menu item handles its own pending state.

Screen-level empty states use a centered, muted noun phrase and at most one ghost button (`packages/app/src/screens/sessions-screen.tsx`). Sidebar list empty states use a quiet bordered card with a left-aligned `sm` title, a muted `sm` description, and `xs` `<Button>` actions. Use `secondary` for the primary action and `outline` for a secondary action (`packages/app/src/components/sidebar/empty-states.tsx`). Keep both forms short and free of illustrations.

Inline errors are a single sentence in `palette.red[300]` `xs`, sitting under the field or inside the card it relates to (`packages/app/src/screens/settings/providers-section.tsx:115-119`).

Page-level alerts — informational notices, success confirmations, warnings, or recoverable errors that need a small visible block on the page — use `<Alert>` (`packages/app/src/components/ui/alert.tsx`). Variants: `default`, `info`, `success`, `warning`, `error`. The chrome is quiet by design: a 1px tinted border, transparent background, a small variant-tinted icon, the title in the variant accent, the description in `foregroundMuted`. Actions go in the `children` slot as `<Button variant="outline" size="sm">` — recovery actions are low-frequency and outline keeps them quiet alongside the alert's accent (`packages/app/src/screens/project-settings-screen.tsx`). One `<Alert>` at a time per region.

Sidebar callouts — cross-cutting alerts that apply across the whole app, like worktree setup, Rosetta install, and desktop update available — register through `useSidebarCallouts()` and render in the left sidebar via `<SidebarCallout>` (`packages/app/src/components/sidebar-callout.tsx`). The chrome (top-border-only, full-width action buttons) is tuned for that ~280px column. Canonical sources: `packages/app/src/components/worktree-setup-callout-source.tsx`, `packages/app/src/desktop/updates/rosetta-callout-source.tsx`, `packages/app/src/desktop/updates/update-callout-source.tsx`. Never import `<SidebarCallout>` into a page — that's what `<Alert>` is for.

Imperative errors are `Alert.alert("Error", "Unable to ...")` (the React Native `Alert` API, not this component) for failures that interrupt the flow and have no place on the page.

Disabled state is `opacity: theme.opacity[50]` on the outer pressable. Color changes for disabled state are wrong; a disabled button is the same button, dimmer.

Partial failure (a list mostly fine but one source errored) is a bordered banner above the list, listing each failure in red-300 `xs` (`packages/app/src/screens/projects-screen.tsx:151-159`). The list still renders.

State surfaces at the smallest scope it affects. Field error stays under the field; page error is a banner; flow-stopping error is an `Alert`.

Changing state must not move the layout. A row that grows when its badge arrives, a card that reflows when a count resolves, a list that jumps as data streams in — all wrong. Reserve the space the loaded state will need, so the skeleton, the spinner, and the content occupy the same box. A surface that shifts under the user stops feeling calm.

---

## 12. List rows

The row anatomy is a content column with an optional trailing slot. Inside a card the row is `settingsStyles.row`. Inside a sidebar list the row carries its own padding and `borderRadius.md` per item (`packages/app/src/components/sidebar-workspace-list.tsx:2694-2705`).

Rows that drill into a detail lead with a chevron in the trailing slot (`ChevronRight`, `iconSize.sm`, `foregroundMuted`). The whole row is the `<Pressable>`. Pair-device row (`packages/app/src/screens/settings/host-page.tsx:644-668`), provider row (`packages/app/src/screens/settings/providers-section.tsx:92-132`), project row in the projects list. A fixed right chevron means navigation. An expandable row uses a trailing right chevron that rotates down when expanded (`SettingsCollapsibleRow`); pressing the row reveals its child rows in place.

The chat timeline's tool-call activity row (`ExpandableBadge` with `activitySummary`, `packages/app/src/components/message.tsx`) is a row that expands in place rather than navigating, and it is quieter than the rest of this section: the leading glyph and trailing chevron are both fixed — neither swaps for the other on hover, unlike the default tool-call badge — and the sentence stays `foregroundExtraMuted` at 13.5px at rest (Codex parity; one step quieter than the app's usual `foregroundMuted` metadata tier). Hover and expanded state paint with `interactionHighlight` on the row background instead of a border or a solid fill. Use this shape for a row that summarizes a group and expands inline; the drill-down chevron above is for rows that navigate away.

The rest of the timeline follows the same Codex-parity pass. The user message bubble (`userMessageStylesheet` in `message.tsx`) is a flat `secondary` (`surfaceComposer`) fill, no border — the earlier hairline read as an extra surface where the fill alone is contrast enough against canvas — at a pinned 15px/1.5-line-height literal, not `fontSize.content`. Assistant prose no longer leads with the Stroll mark on desktop (`AssistantMessageContent` renders `prose` directly on every form factor now); the mark's job — identifying who's speaking — is already carried by the row's position and the user bubble's own right alignment, so a second per-message marker was redundant chrome. The live turn footer's "Working" label (`agent-stream/turn-footer.tsx`, `WorkingShimmerText` in `agent-stream/working-shimmer-text.tsx`) is a shimmering gradient sweep on web — the animation itself is the running indicator, so the loader spinner that used to sit beside it is gone — reading "Working · 2m 41s" at 13px `foregroundExtraMuted`. While a tool call is in flight the label names the step instead ("Running npm test", "Reading app.ts", "Thinking" while reasoning streams), from the newest item of the running turn (`agent-stream/live-activity.ts`); native falls back to a plain label inside an opacity-pulsing wrapper (applying a themed Unistyles style straight to a Reanimated-animated node crashes — see docs/unistyles.md's "Reanimated `Animated.View` + Dynamic Styles Crashes" — so the pulse lives on a theme-free wrapping `Animated.View`, the color on a separate static `Text` inside it).

A finished turn folds the way Codex does. Its work (tool calls, thoughts, in-between messages, and info notices) collapses behind one **"Worked for 1m 50s ›"** row with a hairline under it, and only the user's message and the final answer stay in view; pressing the row expands the work in place. `agent-stream/turn-fold.ts` builds the fold after presentation (display-only `turn_fold` rows that never reach the cache), folding each canonical turn on its own, never the running turn, and never errors or warnings. The **Detailed** tool-call level shows every row. Under the answer, copy and fork stay visible at reduced strength (full on hover) instead of appearing only on hover, and the footer label leads with the time the turn ended, with the duration one hover away.

Subagents follow Codex too. Each subagent has one identity glyph, a filled shape in one of six muted colours chosen from its id (`subagents/subagent-glyph-model.ts`), shown in the chat row, the composer track, and the panel; these glyphs are the only colour in the subagent UI. The header's **Toggle summary** button (a saved setting, on by default) shows a summary card at the top right of the chat (`subagents/chat-summary-card.tsx`): the subagents as glyphs with "1 working · 2 done" (and "needs you" first), and the uncommitted changes. The card only appears where the gutter beside the centred transcript can hold it; a narrower pane shows a small glyph cluster, and a narrow split shows none, so no transcript text is covered. Clicking the subagents opens the **Subagents** side-panel tab (`panels/subagents-panel.tsx`), listing them as "Active · n" and "Done · n"; a row opens that subagent beside the chat, and ⌘/Ctrl- or middle-click opens a tab.

The desktop workspace header (`workspace-screen.tsx`) and its tabs row (`workspace-desktop-tabs-row.tsx`) pick up the same pass: a diff-stat hairline pill (`<DiffStat>` in a bordered `borderRadius.full` shell, `packages/app/src/screens/workspace/workspace-header-git-pills.tsx`) and a primary Commit pill (`<Button variant="default">` with its radius overridden to `full` — every other Button token, including the one-primary-per-surface rule in §4, stays) sit beside the existing git actions split button, both reading from the same `useGitActions` policy so the pill calls the real commit handler rather than a decorative stand-in. The tabs row's selected state moved from a raised `surface0`/`surface2` + shadow pairing to a flat `interactionSelected` fill — quieter, no elevation, matching the sidebar/toolbar's own selected-background token.

Kebab menus (`<DropdownMenu>` with `<MoreVertical size={14} />` trigger) are for actions on the row, not navigation. Trigger style: `padding: 2`, `borderRadius: 4`, hover background `surface2`. Menu position: `align="end"`. Items use `<DropdownMenuItem leading={<Icon size={14} color={foregroundMuted} />} ...>`. Visibility is `isHovered || isTouchPlatform` — hover-revealed on web, always visible on native (`packages/app/src/components/sidebar-workspace-list.tsx:684-770`).

A row may carry both a chevron and a kebab when both navigation and row-level actions apply. Chevron sits at the end; kebab sits before it.

Switches and segmented controls also sit in the trailing slot. A row that both navigates and toggles is a `<Pressable>` with a `<Switch>` in the trailing slot — the switch calls `event.stopPropagation()` so the row press does not fire (`packages/app/src/screens/settings/providers-section.tsx:92-132`). Sidebar items that hold a status dot, a count, and a kebab follow the same rule (`packages/app/src/components/sidebar-workspace-list.tsx`).

Selected state on rows in a desktop list+detail uses `surfaceSidebarHover` as the background (`packages/app/src/screens/projects-screen.tsx`). Selected state on rows in the sidebar list uses `surface2` (`packages/app/src/components/agent-list.tsx:563-571`).

The subagent tree (`packages/app/src/subagents/track.tsx`) indents rows by depth with a 1px `border`-colored left rail rather than nested containers, so the rail reads as one continuous line down the tree instead of a box per level. A collapsed parent's trailing slot reports what its hidden children are doing rather than going quiet: an `N running` `<StatusBadge variant="success">` while anything under it is active, a plain muted count once nothing is. Row action icons (`Play`/`Square`/`Archive`/`Unlink`) follow the standard hover rule (`isHovered || isNative || isCompact`).

The sidebar's footer identity row (`packages/app/src/components/left-sidebar.tsx`'s `SidebarFooterIdentity` on mobile, `packages/app/src/components/sidebar/sidebar-panel-footer.tsx` on desktop) is the one `<HostPicker>` trigger — a 24px identity-color circle plus the active host's name. The desktop panel header's "Stroll" label is a different menu, deliberately: its chevron opens the host _filter_ (`sidebar-host-filter-menu.tsx`, scoping which hosts' workspaces the tree shows), not the host switcher.

---

## 13. Status pills and badges

There is exactly one token per status signal — `statusSuccess`, `statusDanger`, `statusWarning`, `statusMerged` — and every status surface uses it: PR state icons, CI check icons and pies, diff stats, file-change icons, status pills, usage bars. A surface does not get a quieter or louder variant because of where it sits. If a dense list feels loud, that is a density or weight problem; fix the density, not the color. The tokens are generated, not hand-picked — see the rule in `packages/app/src/styles/theme.ts` and regenerate rather than nudging one value. The level is set by the densest consumer, the sidebar workspace list.

Status **dots** are the one exception, and they are a family of their own — `statusDotSuccess`, `statusDotDanger`, `statusDotWarning`, `statusDotRunning`, read only by `getStatusDotColor` (`packages/app/src/utils/status-dot-color.ts`). Same hues and the same generation rule, but their own band: 90% of gamut chroma against the status family's 55–60%. A dot is a few points of solid color with no shape to read and no label attached, and the running one pulses, so at the status band's chroma the dots read dimmer than the metadata beside them — backwards, since the dot is the row's state. Lightness is set by hue separation rather than by distance from the surface: at 6pt four dark hues on a light surface all read as one dark blob no matter how much contrast they have. So the light band runs as bright as the contrast floor allows at L=0.62, the last step where all four clear 3:1 against the sidebar's `surface2`; the dark band sits at L=0.72, where danger turns pink above. All four move together; regenerate the set, never one hue — except `statusDotRunning`, which breaks from the generated family on purpose (monochrome rule, above): running is not a signal to celebrate or warn about, so its dot is `foregroundMuted`-ish neutral grey rather than a hue. `statusDanger`/`statusWarning` and their dot variants are pinned to the Codex-reference reds/oranges rather than the formula, since they are now the only saturated colors left anywhere in the UI and need the full weight of "this needs you." `success` reads from `statusSuccess` rather than `accent` — see `buildLightSemanticColors`/`buildDarkSemanticColors` in `theme.ts` — so it stays a true status green even on the monochrome default theme, where `accent` itself carries no color at all.

Status pills use the status token for text on the shared `surface3` and `border` shell, `borderRadius.full`. The neutral shell keeps the signal legible without manufacturing translucent colors outside the theme. Pill text is `fontSize.sm`, `fontWeight.medium` (the Finish-era exception noted in §14), with `theme.tabularNums` spread in since many callers pass a live count (the subagent tree's "N running", §12). The `<StatusBadge>` primitive (`packages/app/src/components/ui/status-badge.tsx`) is canonical; a pill never reaches into `palette`.

Keyboard shortcut chips (`<Shortcut>`, `packages/app/src/components/ui/shortcut.tsx`) sit one radius step tighter than a pill — `borderRadius.base` — with the same `border` hairline and `fontSize.sm`/`fontWeight.medium`/`tabularNums` text treatment.

Status dots — the small filled circles next to a host or agent name — are `borderRadius.full` filled with the status token. Which token a given agent state maps to is owned by `getStatusDotColor` (`packages/app/src/utils/status-dot-color.ts`); a row, a group header, and a project icon all call it rather than restating the mapping. They sit in the trailing slot of a sidebar row or as a leading marker on a status pill.

Identity badges — the project icon, the sidebar host badge, the PR-panel participant avatar, and the chat transcript's user-message avatar — do not use the theme palette. They draw from the fixed ten-color identity table in `packages/app/src/styles/identity-colors.ts`, whose hexes are held to one contrast band so a color identifies rather than ranks. Project icons, PR avatars, and the user-message avatar use it as a fill with a white letter — that is `identityColor`, one theme-independent hex per identity. Host badges use it as a _foreground_ on both the glyph and the label, which is a different contrast problem that the fill table cannot solve: no single hex clears 4.5:1 against both a near-white and a dark sidebar. Foregrounds therefore come from `identityForeground(name, colorScheme)`, one set per scheme, hue unchanged. That set is generated on the **status family's** lightness and chroma fraction, because a meta row puts a host badge beside a CI check and a diff stat, and two families at different lightness make the brighter one shout. Change the status band and this one changes with it. A host with no color assigned falls back to `foregroundMuted`. The table is theme-independent by design; do not fork it per theme, and do not add hexes to it without recomputing the band.

New status pills use `<StatusBadge>`. Identity, shortcut, and interactive link badges remain separate because color does not encode status there.

---

## 14. Forbidden

- `fontWeight.medium` on row titles, body text, non-primary button labels, or `<SidebarCallout>` titles. Medium is reserved for the structural-label tier described in §3 — section labels, modal/sheet titles, dense metadata emphasis, and tight action labels — plus two Finish-era exceptions: the one `<Button variant="default">` label per surface (§4) and `<StatusBadge>`/kbd-chip text (§13), both small enough that `normal` reads as too light against their own shell. Every other button variant, and every other badge-shaped text, stays `normal`. `<ScreenTitle>` is responsive `400/300` and is never overridden.
- `<Pressable>` wrapping `<Text>` to make a button. `<Button>` exists.
- Bare `<Text>` for a section header inside settings. `<SettingsSection>` exists.
- A muted paragraph between a section header and its card. Section-level explanation is the header's `info` tooltip (§7).
- A "Settings" CTA on a detail page. Detail pages are settings; settings is reached from the sidebar, the host entry, or a row's kebab menu.
- The word "checkout" in UI strings or identifiers. The term is "workspace".
- New color tokens or hardcoded hex outside the palette. The identity color table is the documented exception (§13), not a license.
- Placeholder text dimmed beyond `foregroundMuted`. No extra opacity, no italics, no ghost-text.
- `onPointerEnter` and `onPointerLeave`. They do not fire on native iOS. Hover uses Pressable's `onHoverIn`/`onHoverOut` gated with `isHovered || isCompact || isNative`.
- Raw DOM APIs without an `isWeb` guard.
- Spacing values outside the scale. `padding: 20` and `gap: 10` are wrong.
- Color changes for disabled state. Opacity only.
- Destructive actions without `confirmDialog`. Restart, remove, and future destructive actions are confirmed. Archive workspace is confirmed only when its worktree backing reports uncommitted changes or unpushed commits; otherwise it archives immediately.
- Bespoke status pills. `<StatusBadge>` is the pill primitive.
- Raw `Modal` for a focused task. `<AdaptiveModalSheet>` is the modal primitive.
- Importing `ActivityIndicator` directly. `<LoadingSpinner>` is the loading primitive.

---

## 15. Canonical surfaces by pattern

| Pattern                                             | Reference                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List+detail (compact stack, desktop sidebar+pane)   | `packages/app/src/screens/settings-screen.tsx`, `packages/app/src/screens/projects-screen.tsx`                                                                                                                                                                                                           |
| Detail card+row                                     | `packages/app/src/screens/settings/host-page.tsx`, `packages/app/src/screens/settings/providers-section.tsx`                                                                                                                                                                                             |
| Section grouping inside a card list                 | `packages/app/src/screens/settings/settings-section.tsx`                                                                                                                                                                                                                                                 |
| Form modal (label + input fields, primary + cancel) | `packages/app/src/components/add-host-modal.tsx`, `packages/app/src/components/pair-link-modal.tsx`, `packages/app/src/components/project-picker-modal.tsx`                                                                                                                                              |
| Destructive confirmation                            | `confirmDialog` invoked from `packages/app/src/screens/settings/host-page.tsx:541-547`                                                                                                                                                                                                                   |
| Centered hero / first-run                           | `packages/app/src/components/welcome-screen.tsx`                                                                                                                                                                                                                                                         |
| Sidebar list (workspaces, hosts)                    | `packages/app/src/components/sidebar-workspace-list.tsx`, `packages/app/src/components/left-sidebar.tsx`                                                                                                                                                                                                 |
| Live list of items with sections (agents)           | `packages/app/src/components/agent-list.tsx`                                                                                                                                                                                                                                                             |
| Historical list (sessions)                          | `packages/app/src/screens/sessions-screen.tsx`                                                                                                                                                                                                                                                           |
| Workspace pane (multi-tab, split)                   | `packages/app/src/screens/workspace/workspace-screen.tsx`                                                                                                                                                                                                                                                |
| Composer / message input                            | `packages/app/src/composer/index.tsx`, `packages/app/src/composer/input/input.tsx` (§16)                                                                                                                                                                                                                 |
| Pane chrome with single bottom border               | `packages/app/src/components/git-diff-pane.tsx`, `packages/app/src/components/file-explorer-pane.tsx`, `packages/app/src/components/terminal-pane.tsx`                                                                                                                                                   |
| Page-level alert (info / success / warning / error) | `packages/app/src/components/ui/alert.tsx`, `packages/app/src/screens/project-settings-screen.tsx`                                                                                                                                                                                                       |
| Sidebar callout (cross-cutting alert)               | `packages/app/src/components/sidebar-callout.tsx`, `packages/app/src/contexts/sidebar-callout-context.tsx`, `packages/app/src/components/worktree-setup-callout-source.tsx`, `packages/app/src/desktop/updates/rosetta-callout-source.tsx`, `packages/app/src/desktop/updates/update-callout-source.tsx` |
| Searchable picker                                   | `packages/app/src/components/ui/combobox.tsx`, `packages/app/src/components/branch-switcher.tsx`                                                                                                                                                                                                         |
| Trigger-anchored menu                               | `packages/app/src/components/ui/dropdown-menu.tsx` (used in `sidebar-workspace-list.tsx`, theme picker)                                                                                                                                                                                                  |
| Right-click / long-press menu                       | `packages/app/src/components/ui/context-menu.tsx` (used in `sidebar-workspace-list.tsx`)                                                                                                                                                                                                                 |
| Headers (back, screen, menu)                        | `packages/app/src/components/headers/back-header.tsx`, `screen-header.tsx`, `menu-header.tsx`                                                                                                                                                                                                            |

---

## 16. Composer

One rounded card — `borderRadius["2xl"]`, `surfaceComposer` fill, **no border, no focus ring or hairline of any kind** (Codex parity) — on the `MAX_CONTENT_WIDTH` rails (`packages/app/src/composer/input/input.tsx`) — holds the input and its controls row. The input sits on top; the controls row sits below it, inside the same card, never a second bordered surface stacked underneath. `surfaceComposer` is the one raised tone the card and the user's own chat bubble (§3) share, so the two read as one family. The composer autofocuses on nearly every surface it appears on, so any focus treatment (border, ring, or inset hairline) would read as a permanently outlined box rather than a state change — Codex shows no focus indicator on its composer at all, beyond the caret itself, and this card matches that exactly: the rest-state shadow (`theme.shadow.sm`, plus `insetHighlight` in dark) never changes on focus. A visible focus ring on focus is still correct for every other input in the app (§5 "Finish") — this is a composer-specific exception, not a new rule. The card's min height fits two lines of `fontSize.content` plus the controls row; input padding is `spacing[4]` horizontal, `spacing[3]` top. Placeholder text is `foregroundMuted` — the app-wide floor (§14) applies here too; a running workspace's composer shows "Ask for follow-up changes" instead of the blank-chat "Message Stroll" (`composer.placeholders.followUp`). Attachment pills render in a tray inside the card, above the input, never a second bordered surface. Compact/mobile keeps the same card with tighter padding.

**Context strip.** A `surfaceComposerStrip` strip sits behind the composer's top edge on the new-chat screen (`packages/app/src/composer/context-strip.tsx`'s `<ChatContextStrip>`, rendered by `screens/new-workspace-screen.tsx`'s `ChatComposerStack`): radius `2xl` on the top corners, the composer card overlapping its bottom edge by 14px (`marginTop: -14` on the card). The strip takes the card's width (the composer's `spacing[4]` inset and content-width cap); any wider and its square bottom corners show beside the card. Items are quiet icon+label rows at 13px `foregroundMuted`, brightening to `foreground` on hover — no pill chrome, no border. "Project" is a static "No project" label in chat mode (a new chat is never tied to a project — `ensureWorkspace`'s `createChatSourceWorkspace` branch has no project input at all, so wiring a picker here would be decorative); "machine" is a second, independent `<HostPicker>` trigger for the same host switch as the hero's inline picker (below), reachable only once more than one host is configured. The strip is new-chat-only — an existing workspace's header breadcrumb (§5's canonical-surfaces table, `workspace-screen.tsx`) already carries project/host for a running chat, so a second copy above its composer would be a pure duplicate.

**New-chat hero.** The blank-chat hero (`packages/app/src/screens/new-workspace/chat-hero.tsx`) leads with the Stroll mark (outline, 46px desktop / 36px compact, `foregroundExtraMuted`) above "What should we work on in `<host>`?" at a pinned 28px/-0.015em literal (22px/-0.33 compact — see §3). The host name carries a dotted underline and is a real `<HostPicker>` trigger once more than one host is configured (reusing the same `handleSelectHost`/`hostPickerOpen` state the workspace-creation form's host badge already uses — switching it changes which host the new chat is created on); with one host it renders plain, no affordance. Suggestion chips below the composer are `ghost` buttons, quieter than the earlier `outline` treatment, so they don't compete with the Codex-flat hero.

The controls row has a fixed desktop order, left to right:

- **Left.** The `+` attachments button, then the mode control as a pill with its provider-mapped Shield-family glyph and label (`packages/app/src/composer/agent-controls/mode-control.tsx`). When the selected mode is the provider's unattended, no-prompt mode (`colorTier: "dangerous"`, see `isUnattendedAgentMode` in `composer/agent-controls/utils.ts`), the glyph and label switch to `statusWarning` — picking it should read as a choice, not the default.
- **Right.** The model trigger and the thinking/effort trigger (`Zap` glyph) sit in one tightly-gapped group so the pair reads as "Model Effort ⌄" (model trigger drops its own trailing caret so only the group's last trigger shows one), then the dictation mic, then the send/stop button. The context-window ring no longer sits in this always-visible row (below). No separate running spinner sits in this row — the send/stop button carries its own running state (see below).

Provider/model/thinking/features are one `AgentControls` component (`packages/app/src/composer/agent-controls/index.tsx`) — restyle it, don't fork it into a left half and a right half. It renders the mode (and account) control first, then wraps the rest in a `marginLeft: auto` group so that group sits flush against the row's own right edge, adjacent to the mic/send group with no visible seam. Compact/mobile keeps its sheet flow; the split is desktop-only.

Every trigger pill in the row — mode, model, thinking, account — shares one geometry (`AgentControlTrigger` in `composer/agent-controls/control.tsx`): 28px tall `xs` ghost pill, `borderRadius["2xl"]`, transparent at rest, `fontSize.sm` value text, a leading glyph at `iconSize.sm`, a trailing `ChevronDown` at 12px (`COMPOSER_TOOLBAR_GEOMETRY.caretSize`). Hover paints `interactionHighlight`; the open state (the picker attached to the trigger) paints `surface2` instead, so a pressed-open pill stays visibly "on" after the pointer moves elsewhere. The mic and `+` buttons match the same 28px ghost geometry and hover token. The full-access warning color (`statusWarning`) on the mode pill is unaffected by any of this — it is a content color, not a state color.

The send/stop button is one 32px circle, one size step up from the 28px pills either side of it — the row's one committed action (`ComposerCancelButton` in `composer/index.tsx`, `SendButtonContent` in `composer/input/input.tsx`). Idle with content: filled `accent` with an `ArrowUp` glyph in `accentForeground`. Idle with nothing to send: the same shape at `opacity[50]` — color never changes for a disabled control (§14). Running: the **same `accent` circle** (Codex doesn't color-code stop as destructive) with a solid rounded-square stop glyph in `accentForeground` — a plain `View` sized to `borderRadius.sm`, not the lucide `Square` outline, so it reads as a filled mark — and a thin arc rotates around the circle at 4px clearance using the same ring primitive as `<LoadingSpinner>`. That ring is the row's only running indicator; there is no second spinner elsewhere in the controls row. All three are the same button changing state, not separate components. While a turn runs and there is something to send, a 28px ghost button (mic geometry) sits just left of send and runs the alternate send action: `ListEnd` to queue when Enter steers, `CornerDownRight` to steer when Enter queues (`composer/input/alternate-send-button.tsx`). It is the touch path to the Tab key, so it shows on every platform rather than on hover. The send/stop swap itself (`PrimaryAction` in `composer/input/input.tsx`) cross-fades with Reanimated `entering`/`exiting` on native, but web drops `entering` for `webAppearStyle` instead — the card's own height easing runs at the same moment a run starts or stops, and Reanimated's web layout-animation freezes the entering content at a `position: absolute` snapshot of its pre-resize coordinate, which visibly detached the running ring from the button until the snapshot expired. See `styles/motion.ts`'s `webAppearStyle` doc for the general hazard.

### Loaders

`<LoadingSpinner>` (`packages/app/src/components/ui/loading-spinner.tsx`) draws a thin ring: a full track circle at `border` (1.5px stroke, 1.25px at `size` ≤ 14) and a quarter-turn arc in the passed `color`, rotating continuously (`react-native-reanimated`, respects reduced motion). The `size`/`color`/`style` API is unchanged, so every call site — including the composer's running ring above — repaints without touching the caller.

`<ContextWindowMeter>` (`packages/app/src/components/context-window-meter.tsx`) is a quiet 14px ring: track at `foregroundExtraMuted`, fill at `foregroundMuted`, switching to `statusWarning` only above 80% usage. The tooltip on hover/press is unchanged. It still renders in its own fixed 28x28 slot in the controls row (no layout shift), but on desktop web that slot is hidden at `opacity[0]` until the whole controls row is hovered (`MessageInput`'s `onPointerEnter`/`onPointerLeave`, the canonical plain-`View` hover pattern — [hover.md](hover.md)); native and compact keep it always visible, since neither has hover.

A bordered "Task progress" card (`packages/app/src/composer/task-list/index.tsx`) sits above the composer card whenever the agent has a task list: header row with "Task progress" (`fontWeight.medium`) on the left, "Updated {{time}} ago · N of M" plus a chevron on the right (`foregroundMuted`, `fontSize.sm`), collapsible in place. Rows carry a leading state glyph — empty circle for pending, a clock for in progress, a check for done — and `fontWeight.normal` text. It is not the shared `ComposerTrackPill` popover: task progress is read continuously, not opened on demand. It still shares `ComposerTrackBar`'s row with the other ambient pills (subagents, diff stat, plugin pills, `packages/app/src/panels/agent-tracks.tsx`) — its `width: "100%"` forces that row (`packages/app/src/composer/tracks.tsx`) to wrap, so the card claims its own line above the rest.

`ComposerTrackBar` floats over the transcript on a fixed clearance estimated from one pill row (`resolveComposerTrackTailClearance`), not a measured one. The card starts collapsed for that reason — the header alone fits the reserved space — and its row list scrolls past a handful of rows rather than growing unbounded when expanded.

The queued-message track (`packages/app/src/composer/index.tsx`) uses the same quiet row anatomy as everywhere else in the app: leading glyph, text, trailing actions revealed on hover (`isHovered || isNative || isCompactLayout`, per [hover.md](hover.md)) rather than always visible.

---

## 17. Motion

One animation library — `react-native-reanimated` — and one set of tokens. `theme.motion` (`packages/app/src/styles/theme.ts`, alongside `spacing`/`radius`/`opacity`) holds `duration: { fast: 100, base: 150, slow: 200 }` and `easing.standard`, the `Easing.linear` curve Reanimated's `Keyframe` already applies by default. Read the exported `MOTION_DURATION`/`MOTION_EASING` constants directly in a module-scope animation builder (a `Keyframe`, a `FadeIn.duration(...)`) rather than through `theme` — durations don't vary by theme, and Reanimated builders are constructed once at import time, before any `StyleSheet.create` factory runs.

Every `entering`/`exiting`/`withTiming` call site reads reduced motion through one seam, `useAppReducedMotion()` (`packages/app/src/hooks/use-app-reduced-motion.ts`), not Reanimated's `useReducedMotion()` directly — that keeps one place to change if the app ever layers its own "reduce motion" setting on top of the OS preference. Pair it with `withMotion(reducedMotion, animation)`, which returns `animation` unchanged or `undefined`, so a call site stays a one-liner:

```tsx
const reducedMotion = useAppReducedMotion();
<Animated.View
  entering={withMotion(reducedMotion, appearEntering)}
  exiting={withMotion(reducedMotion, appearExiting)}
/>;
```

Two recipes, exported from `packages/app/src/styles/motion.ts`, cover every animated surface in the app:

- **`openCloseEntering`/`openCloseExiting`** — an anchored surface opening or closing in place: menus, popovers, comboboxes, tooltips, hover cards. Scale 0.97 → 1 plus opacity, `duration.base`/`duration.fast`. Reference implementation: the menu overlay (`packages/app/src/components/ui/menu/menu-overlay.tsx`), which imports these recipes rather than defining its own. These are floating surfaces (see `FloatingSurface`, `packages/app/src/components/ui/floating.tsx`) — out of flow by construction, so the web hazard below doesn't apply, and `FloatingSurface` strips `exiting` on web itself for an unrelated reason (a simultaneous ancestor+descendant unmount throws inside Reanimated's web runtime).
- **`appearEntering`/`appearExiting`** — a surface fading in or out with no scale change: the scroll-to-bottom pill, message entrances. `FadeIn`/`FadeOut` at `duration.slow`. Reference implementation: `packages/app/src/agent-stream/view.tsx`.

New motion is one of these two shapes, not a third. If neither fits, that's a sign the interaction needs its own review, not a bespoke `withTiming` call.

### Continuous loops on web are CSS, not Reanimated

Reanimated's `withRepeat` has no compositor path on web: it re-renders the animated style from a `requestAnimationFrame` callback, so every mounted spinner forces a main-thread style recalc and repaint 60 times a second for as long as it exists. Measured on a still screen, one Reanimated spinner added about 120 frame callbacks a second and about 5 points of a CPU core; the CSS version adds no callbacks. During streaming the difference vanishes, because the page redraws every frame anyway, which is why this stays invisible until the window is idle with agents running.

On web, run any infinite loop (spinners, pulses, shimmers) as a CSS `@keyframes` animation on `transform`/`opacity` so the compositor runs it off the main thread. Use `webSpinStyle(reducedMotion, durationMs)` (`packages/app/src/styles/motion.ts`) for rotation; `LoadingSpinner` (`packages/app/src/components/ui/loading-spinner.tsx`) splits into a CSS shell on web and a Reanimated shell on native, where Reanimated already runs on the UI thread. New infinite web animations follow the same split.

CSS alone is not enough: the animated property decides whether the compositor can run it. `background-position`, `color`, masks, and `opacity` on inline text all repaint on the main thread every frame. Measured on a streaming chat with a real GPU, the "Working" label's shimmer cost 14 points of a core as an animated `background-position` clipped to the text, 7 as a masked band moving over a copy of the text, and nothing measurable as one canvas-coloured gradient layer sliding over plain text with `transform` (`packages/app/src/agent-stream/working-shimmer-text.tsx`). Build an infinite effect from a layer that only moves.

Even a compositor-only loop is not free: while anything animates, the browser produces a frame for the whole window 60 times a second. Two 12px status rings in the sidebar cost about 12 points of a core on an otherwise still screen. So every loop stops while the window is unfocused or hidden: pass `!useAppActivelyVisible()` to `webSpinStyle`, set `animationPlayState`, or `pause()` a Web Animation (`packages/app/src/components/status-ring/clock.web.ts`). Short one-shot animations (entrances, word fades) are exempt from pausing, because a paused fade leaves its text half-drawn.

### Reanimated layout animations are native-only

Reanimated's web layout-animation runtime takes an `entering`/`exiting` element out of normal flow (`position: absolute`, a size snapshot taken at mount) for the animation's duration, then hands it back to static flow once its own bookkeeping decides the animation finished. That is safe for a floating surface (already out of flow) or a child inside a hard-sized parent (the composer's 32px send-button circle, `packages/app/src/composer/input/input.tsx`'s `SendButtonContent`/`PrimaryAction`). It breaks for an **in-flow element whose size can change**: the parent collapses to the stale snapshot instead of the live content height, and whatever renders after it in flow draws on top of it instead of below it. This shipped for real as the M1 message entrance rendering the live turn footer over still-streaming assistant text, and again for the sidebar's rail-mode workspace list.

On web, animate these in-flow elements with CSS keyframes on `opacity`/`transform` instead — never `position` or `height`. Use `webAppearStyle(reducedMotion, { riseBy? })` (`packages/app/src/styles/motion.ts`): it returns a style object driving the same fade (+ optional rise) via an injected `@keyframes` rule, or `undefined` on native (use the Reanimated `entering` prop there) and when `reducedMotion` is on. Keep native on the Reanimated recipe and drop `entering` on web:

```tsx
const reducedMotion = useAppReducedMotion();
<Animated.View
  entering={isWeb ? undefined : withMotion(reducedMotion, appearEntering)}
  style={[containerStyle, webAppearStyle(reducedMotion)]}
/>;
```

`exiting` isn't part of this helper — an element leaving the tree doesn't have the "keeps growing while off-flow" hazard, so it stays a plain Reanimated `exiting` on every platform (`FloatingSurface`'s web strip is the one exception, and it's for a different, unrelated crash). Message entrances (`packages/app/src/components/message.tsx`), the chat hero greeting/suggestions (`packages/app/src/screens/new-workspace/chat-hero.tsx`), and attachment pills (`packages/app/src/components/attachment-pill.tsx`) all follow this pattern. The desktop sidebar's expanded panel (`packages/app/src/components/sidebar/sidebar-panel.tsx`) hit this hazard directly — its old single-column `expandedContent` cross-fade is why it now mounts and unmounts as a plain conditional instead of a second `entering`/`exiting` pair; the container-width tween in `packages/app/src/components/left-sidebar.tsx` carries the whole transition.
