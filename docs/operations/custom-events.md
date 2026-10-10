# Custom events

A custom event is something you choose to count, such as a signup, a download, or a plan choice.
The website sends it with one line; the console's **Events** page and the AI assistant's
`get_custom_events` tool report it.

## Send an event

With the script tag, call `track` on the client it exposes:

```html
<script>
  window.vizoalica?.track('signup', {
    properties: { plan: 'pro', annual: true }
  });
</script>
```

With the module, call it on the client that `init` returns:

```ts
client.track('signup', { properties: { plan: 'pro', annual: true } });
```

Rules for the name and properties:

- The **name** is lowercase letters, digits, and underscores, starting with a letter, 2 to 64
  characters long: `signup`, `file_download`. Anything else is rejected.
- **Properties** are optional: up to 25, with text, number, true/false, or null values. Names that look
  sensitive (`email`, `password`, `token`, and so on) are rejected; see
  [privacy defaults](privacy.md).
- The page the event was sent from is added automatically, as a page key (`/orders/:id`, not
  `/orders/8841`).

## Read the report

**Console:** Analytics → **Events**. For the project or website and range chosen in the bar under the
header, it shows:

- events over time for the current selection;
- each event with its count, distinct visitors, and the number of pages it was sent from;
- the top pages of the selected event;
- when one event is selected, the most common values of each of its properties.

Choose an event or a page to narrow the report. The selection is kept in the address, so you can
bookmark it or send it to another console user. Nothing on the page changes a setting.

**AI assistant:** ask "how many signups this week, and on which pages?". The `get_custom_events` tool
takes the same environment, project, website, and range arguments as `get_actions`, plus `event` (an
exact name) and `page` (an exact page key). Property values are returned only when one `event` is named.
See [Ask your AI assistant](ai.md).

## What is counted

- **Visitors** are counted the same way as for page views and actions, with a daily keyed digest, so
  nothing is stored in the browser.
- **Property values** are grouped only for text and true/false values. They are redacted like action
  names (email addresses, long digit runs, and token-like words are replaced) and cut to 64 characters.
  At most 10 properties per event are grouped. Numbers are collected with the event but not grouped,
  because each distinct number would add a row.
- **Only events received after the backend update are reported.** Earlier events were stored but were
  never counted per minute. When the chosen range starts before that, the page says so.
- **Events without a page** come from a website running an SDK older than 0.10. They are counted in the
  totals and listed under "sent without a page".

## Update the backend

Event reports need the current backend and one additive database migration
(`0004_custom_event_reports.sql`). Update with `vizoalica deploy <name> --update`; see
[database and Worker versions](schema-versions.md). A website that loads the SDK from its own backend
(the default) gets the matching SDK automatically. If you bundle `@vizoalica/browser-sdk` yourself,
update the backend first: an older backend rejects events that carry a page.
