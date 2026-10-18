# Contract: exclusion settings, counter, and ingestion response

## Website create/update

`POST /v1/admin/projects/:p/sources` and `PATCH /v1/admin/projects/:p/sources/:s` accept
`"excludedAddresses": string[]` (replaces the list; `[]` clears it). Any invalid entry, more than 25 entries, a
non-array or a non-string yields `400 invalid` and changes nothing. The audit entry stays `update_source` and
carries no addresses.

Website objects (list, get, create, update) include `excludedAddressCount` for every role and
`excludedAddresses` for admin and owner principals only.

## Excluded hits

`GET /v1/admin/projects/:p/sources/:s/excluded-hits` (role and scope as the website's status) returns

```json
{ "total": 12, "days": [{ "day": "2026-10-16", "count": 7 }], "windowDays": 30 }
```

`days` lists only days with hits, newest first, at most 30. A Worker older than 0.11.0 answers 404.
A database without migration 0006 answers a request that carries a list, and the excluded-hits report, with
`503 database_update_needed`. `GET .../status` additionally returns `excludedAddressCount` and `excludedHits30d`.

## Ingestion

When an authorized batch comes from an excluded address:

```text
HTTP/1.1 202
{"decision":"excluded","accepted_count":0,"rejected_count":0,"reason_codes":["excluded_address"]}
```

Nothing is stored; the counter increases by the batch's event count. Failures of authentication, origin, token,
size and schema keep their existing responses and take precedence.

## SDK opt-out

| URL parameter (query only)      | Effect                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| `vizoalica_ignore=1` or `true`  | store `localStorage["vizoalica.ignore"]="1"`; send nothing          |
| `vizoalica_ignore=0` or `false` | remove the key; run normally                                        |
| anything else / absent          | no change; if the key is `1`, send nothing                          |
