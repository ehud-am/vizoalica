# Contract: SDK campaign collection

- Read once, when the client is created, from `location.search` (never the fragment).
- Names matched case-insensitively: `utm_source`, `utm_medium`, `utm_campaign`. First occurrence wins.
- Values pass `cleanCampaignValue` (see data-model.md). Nothing else from the query is read or sent.
- The cleaned object is attached to the **first** page view event the client builds, whether it comes from
  `autoPageView` or a manual `page()`. Later page views (navigation, manual) carry no `campaign`.
- No cookie, storage, extra request or timer. If parsing fails, the page view is sent without `campaign`.
- With no valid value the `campaign` property is omitted.
