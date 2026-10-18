---
title: 'Exclude your own visits'
description: 'Keep your own and your team’s visits out of the numbers, by IP address or range or with a switch in a browser, without storing the addresses or any identifier.'
---

# Exclude your own visits

By default Vizoalica counts everyone who opens your website, including you. There are two ways to leave your
own visits out. You can use either or both.

|                          | Excluded addresses                      | Browser switch                                |
| ------------------------ | --------------------------------------- | --------------------------------------------- |
| Good for                 | An office or home with a fixed address  | A person on a changing connection, or a phone |
| Set up in                | The console, on the website's Edit page | By opening your site once with a link         |
| Counted for transparency | Yes, per day                            | No (nothing is sent)                          |
| Needs a backend update   | Yes                                     | No                                            |

## Exclude addresses

1. Find the public address you visit from. Searching "what is my IP" shows it. Use the address of the
   network the visits come from, not a private one such as `192.168.1.5`.
2. In the console, open the website → **Edit** → **Exclude your own visits**, and enter one IP address or range
   per line, up to 25:

   ```text
   203.0.113.7
   198.51.100.0/24
   2001:db8::/48
   ```

   A range is written as an address, a slash, and the number of bits that stay fixed (`/24` is 256 addresses).
   Both IPv4 and IPv6 work.

3. Save. The next visit from those addresses is dropped. There is nothing to deploy on your site.

What happens to a visit from an excluded address:

- It is dropped when it arrives and **never stored**: it is not in the reports, not in the raw event archive, and
  it does not use your quota.
- Only the **number** of dropped events is kept, per website and day, for 32 days. No address or identifier is
  stored with it. The website's page shows the last 30 days under **Your own visits**.
- Visits that arrived **before** you added the address stay in your numbers. Exclusion is not retroactive.
- Only visits the website would have accepted count: a request with a bad token or from a forbidden origin is
  refused exactly as before.

Things to know:

- **Shared addresses.** Everyone behind an address is excluded, including visitors. A university, a company
  network, or a mobile carrier can share one address between thousands of people. Check the dropped count, and
  prefer the browser switch where the address is shared.
- **Ranges that are too wide.** `0.0.0.0/0` matches every IPv4 address and would drop all of your traffic. The
  dropped count on the website's page makes a mistake like this visible; remove the entry to stop it.
- **Testing.** A visit from an excluded address shows nothing in the reports. To check that tracking works, visit
  from an address that is not on the list.
- Addresses are read from the connection as Cloudflare sees it (`CF-Connecting-IP`) and are only compared in
  memory.
- The list is configuration. The admin and website owners can read and change it; an analyst key sees only how
  many entries there are. Addresses are not written to logs or the audit trail.

## Browser switch

Open any page of your website with `?vizoalica_ignore=1` added to its address:

```text
https://example.com/?vizoalica_ignore=1
```

From then on, that browser sends nothing for that website, not even the page that carried the switch. To turn it
back on, open `https://example.com/?vizoalica_ignore=0`.

- The switch stores one value (`1`) in that browser's local storage, on your own device, because you asked for
  it. Visitors never get it. This is the only thing the SDK ever writes to a browser, and only here.
- It applies to one browser and one website address. Do it once in each browser you use, and for each of the
  website's addresses (for example both `example.com` and `www.example.com`).
- Clearing the site's data for that website in the browser removes the switch.
- Because nothing is sent, these visits **cannot be counted**. The dropped count covers excluded addresses only.
- It needs SDK version 0.11 or later on the page. A website that loads the SDK from its own backend (the default)
  gets it when the backend is updated; if you bundle `@vizoalica/browser-sdk` yourself, update your bundle.

## Ask your AI assistant

`get_website_status` says how many addresses a website excludes and how many events that dropped in the last 30
days. It never returns the addresses. See [Ask your AI assistant](ai.md).

## Update the backend

Address exclusion needs the current backend and one additive database migration
(`0006_internal_traffic_exclusion.sql`). Update with `vizoalica deploy <name> --update`; see
[database and Worker versions](schema-versions.md). A backend older than 0.11 ignores the list; the console tells you so when you save it,
and shows that dropped events cannot be counted yet. See the
[internal traffic privacy review](../privacy/internal-traffic-review.md).
