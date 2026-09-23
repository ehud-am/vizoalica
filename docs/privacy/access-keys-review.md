# Access keys: privacy review

**Status**: Recorded 2026-09-23 for [spec 018](../../specs/018-npm-console-first-setup/spec.md)
(FR-046–FR-054). This is the review the constitution requires before any new data field is accepted.
It covers what this release adds: owner and analyst access keys, and the environments they are scoped
to. This is an operator-facing credential, not visitor data, but it governs who can see visitor
aggregates, so it is recorded here on the same basis.

## Decisions

| Field                                 | Decision | Purpose                                                                 | Retention                                                  | Access boundary                                                                                                                      | Re-identification risk                                                                                                 |
| ------------------------------------- | -------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Access key** (`vzk_id_secret`)      | Approved | Let a website owner or analyst use the console without the admin secret | Until revoked or replaced; the Worker stores only its hash | The Worker validates it per request; the console never persists it beyond the local file only the key holder's own computer can read | None. It identifies a role and a scope, not a person.                                                                  |
| **Key label**                         | Approved | Let an admin tell keys apart when listing or revoking                   | Same as the key                                            | Admin only, in the key list                                                                                                          | Low. Whatever label the admin chose, typically a person's name — the admin's own choice, not collected from a visitor. |
| **Key scope** (project or website id) | Approved | Limit what a key can see or change                                      | Same as the key                                            | Same as any other project/website id already in the system                                                                           | None; not new to this release.                                                                                         |

## Rules that hold

1. **A key is valid only for the one environment it was issued from.** Environments are separate
   Worker/D1 pairs; a key issued against one is refused (401) if presented to another, with no extra
   check needed in the route matrix — isolation is a property of the environments being physically
   separate backends.
2. **An owner sees only what its scope allows**: everything, one project, or one website. It manages
   projects and websites in scope, sees their analytics, and can never reach backend-level operations
   (deploy, update, rotate, purge, sample data, or issuing further keys).
3. **An analyst sees everything an admin can see, but changes nothing.** Every state-changing route is
   refused for an analyst key at the Worker, independent of what the console's own UI shows or hides.
4. **Neither an owner key nor an analyst key can ever reveal**: the administrator secret, the
   website's signing secret, another access key, or a raw credential hash. Routes that would expose
   any of these refuse both roles outright.
5. **A key is shown once**, at issue time, with an explicit confirmation before the console clears it
   from memory; the console never re-displays a previously issued key.
6. **Revoking a key is immediate** and irreversible; a revoked key's holder sees "Your access was
   revoked. Ask your admin for a new key." and no stale data.

## Known limits

- The website's signing secret (`VIZOALICA_TOKEN_SECRET`) is shared by every website in an
  environment; sharing setup details with an owner does not scope that secret to one website. This is
  an existing limit, unchanged by access keys.
- An access key carries no expiry by itself; rotation is manual (revoke and reissue).

Anything added later needs its own entry here first.
