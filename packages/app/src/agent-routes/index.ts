/**
 * Agent routes: the app-side UI for the daemon's route/failover/brief system
 * (docs/agent-routes.md). Three capabilities leave this module — the agent panel's Context
 * button and brief sheet, the route banner above the composer, and the Settings → Host →
 * Routes page. Everything else (the pure label/reason/preflight mappings, the config-reading
 * hook) is internal; import from `@/agent-routes`, never a path inside it.
 */
export { AgentContextToolbar } from "./context-toolbar";
export { RouteBanner } from "./route-banner";
export { AgentRoutesSection } from "./settings/agent-routes-section";
export { useAgentRoutesConfig } from "./internal/use-agent-routes-config";
