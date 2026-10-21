---
summary: "Patched Node tooling and the remaining Electron security-release dependency."
read_when:
  - Building Stroll for the October 21, 2026 Node advisory.
---

# October 21 Node security release

Developer tooling, CI and the standalone Docker runtime use Node 22.23.4.
Rebuild and replace an existing container to update its running binary.

The desktop app bundles Electron's Node runtime. Electron 44.2.0 includes
Node 24.20.0; the current 44.9.3 and 45.0.0 releases report Node 24.22.0 and
do not document backports of this Node advisory. Updating system Node does
not fix that embedded runtime. Verify a patched Electron release before
claiming the desktop app includes the October 21 security fixes.

Keep the existing CI spending policy and release authorization controls intact.
Run local validation while the repository's Actions setting remains disabled.
