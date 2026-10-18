# Internal traffic exclusion: privacy review

**Status**: Recorded 2026-10-17 for [spec 023](../../specs/023-exclude-internal-traffic/spec.md). This is the
review the constitution requires before any new data field is accepted. It covers what version 0.11.0 adds:
a per-website list of excluded addresses, a count of dropped events, and a browser opt-out switch.

## Decisions

| Data                                     | Decision  | Purpose                                                   | Retention                                            | Access boundary                                         | Re-identification risk                                                                                                                                                                                 |
| ---------------------------------------- | --------- | --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Excluded address list**                | Approved  | Recognise the operator's own traffic                      | Until the operator removes it or deletes the website | Admin and website-owner keys; analysts see only a count | Low to medium. IP addresses are personal data in some regimes, but these are the operator's own addresses, entered by the operator. Never in logs, audit entries, error messages or analyst responses. |
| **Dropped-event counter**                | Approved  | Show that exclusion works and is not hiding real visitors | 32 days                                              | Roles and scopes as other reports                       | None. A count per website and day: no address, no identifier.                                                                                                                                          |
| **Client address in flight**             | Approved  | Compare with the list                                     | Not retained: compared in memory and discarded       | Worker memory                                           | None beyond what the daily visitor digest already reads (the same header, never stored).                                                                                                               |
| **Browser opt-out flag**                 | Approved  | Let a person leave their own browser out                  | Until the person clears it                           | The person's own browser                                | None. The constant `1`; set only when the person opens a link asking for it; never set for visitors.                                                                                                   |
| Excluding by user agent, country or path | Not added | None needed                                               | n/a                                                  | n/a                                                     | n/a                                                                                                                                                                                                    |
| Counting browser opt-outs                | Rejected  | Would need a request from the opted-out browser           | n/a                                                  | n/a                                                     | Would defeat the purpose: an opted-out browser sends nothing.                                                                                                                                          |

## Rules that hold

1. An excluded batch is dropped after the sender has proved it may write to the website, and before any
   quota, raw storage, or aggregate is touched. A forged or unauthorized request learns nothing about the list
   and cannot change the counter.
2. The list is replaced as a whole and validated strictly (IPv4, IPv6, CIDR, at most 25). Any invalid entry
   refuses the whole change, and the error names the entry's position, never its text.
3. The list is not retroactive: events already stored stay stored.
4. The SDK switch writes only the constant `1`, only when the URL asks for it, and the SDK stays silent while it
   is set. It reads no other part of the address.
5. The switch can be set by anyone who gets a person to open a link on the site. It then only stops that browser
   from being counted; it exposes nothing and `?vizoalica_ignore=0` reverses it. This is inherent in a switch
   that needs no list, and the documentation says so.
6. Addresses shared by many people exclude all of them. The documentation says so and the dropped count is
   visible.

Anything added later needs its own entry here first.
