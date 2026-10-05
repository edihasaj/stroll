/**
 * Friendly host display names (display only — never for identifiers, routing, or
 * storage; `serverId` stays the source of truth everywhere else).
 *
 * `HostProfile.label` (`@/types/host-connection`) is set to the daemon-reported OS
 * hostname at registration (`host-runtime.ts`'s direct-connection handshake) whenever the
 * caller doesn't supply one, and `serverId` is always a separate generated id (`srv_...`)
 * — the two are never equal in practice, so a label can't be told apart from a deliberate
 * rename by comparing it to `serverId`. Instead, {@link deriveFriendlyHostName} only
 * transforms a label that still looks like a raw hostname (ends in `.local`/`.lan`/
 * `.home`, the mDNS/LAN suffixes a daemon reports) and leaves anything else — including a
 * user's actual rename — untouched.
 */

const LOCAL_SUFFIX_PATTERN = /\.(local|lan|home)$/i;

/**
 * Derives a readable name from a raw hostname: strips a trailing mDNS/LAN suffix
 * (`.local`, `.lan`, `.home`) and turns `-` into spaces. A no-op when the input doesn't
 * end in one of those suffixes — that shape is the only signal this helper has that a
 * string is a raw hostname rather than a name someone chose.
 * "Edis-MacBook-Pro.local" -> "Edis MacBook Pro".
 */
export function deriveFriendlyHostName(rawHostName: string): string {
  const trimmed = rawHostName?.trim() ?? "";
  if (trimmed.length === 0 || !LOCAL_SUFFIX_PATTERN.test(trimmed)) {
    return trimmed;
  }
  const withoutSuffix = trimmed.replace(LOCAL_SUFFIX_PATTERN, "");
  const spaced = withoutSuffix.replace(/-/g, " ").trim();
  return spaced.length > 0 ? spaced : trimmed;
}

/**
 * Resolves the name to show a user for a host: `host.label` when set, falling back to
 * `host.serverId`, run through {@link deriveFriendlyHostName} so a raw hostname reads as
 * a name rather than a machine identifier.
 */
export function friendlyHostDisplayName(host: { label: string; serverId: string }): string {
  const trimmedLabel = host.label?.trim() ?? "";
  const source = trimmedLabel.length > 0 ? trimmedLabel : (host.serverId?.trim() ?? "");
  return deriveFriendlyHostName(source);
}
