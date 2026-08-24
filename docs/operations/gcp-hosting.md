# GCP Hosting Plan

**Goal**: Make Vizoalica cheap and simple to host on Google Cloud Platform while preserving a path to higher-volume ingestion later.

**Last reviewed**: 2026-08-16

## Recommendation

Start with **one Cloud Run service** for the Vizoalica backend.

For v0.1.0, this is the best default because:

- Cloud Run runs containers directly, so the app can stay framework-agnostic.
- Cloud Run can scale to zero, which keeps idle cost very low.
- It supports high concurrency per instance, which fits small ingestion requests.
- It avoids managing VMs, Kubernetes, load balancers, or databases on day one.
- It leaves room to add Pub/Sub, Cloud Storage, Firestore, or BigQuery later without changing the browser SDK embed contract.

Default hosting shape:

```text
Website
  └─ vizoalica.js browser SDK
      └─ HTTPS POST /v1/events:batch

Cloud Run service: vizoalica-ingest
  ├─ validates token/source/origin/schema/privacy/quotas
  ├─ rejects bad traffic before expensive work
  └─ writes accepted events to selected storage adapter
```

## Cheapest useful version

Use this for development, demos, tiny production sites, and early adopters.

```text
Cloud Run
  ├─ min instances: 0
  ├─ max instances: low hard cap, for example 1-3
  ├─ concurrency: high enough for small JSON ingestion requests
  ├─ CPU: request-based/default billing
  ├─ memory: smallest setting that passes load tests
  └─ direct Cloud Run URL or direct custom domain mapping

Storage
  └─ start with a simple adapter; for real persistence prefer Cloud Storage batch files or Firestore depending on query needs
```

### Why this is cheap

- Cloud Run can scale down to zero, so an idle service does not keep a VM running.
- Cloud Run has a monthly free tier for vCPU-seconds and memory GiB-seconds in eligible regions.
- Avoiding a load balancer avoids extra always-on load-balancing cost.
- Avoiding Cloud SQL avoids a database instance that runs 24/7.
- Hard max instances limit worst-case cost during abuse or misconfiguration.

### Suggested Cloud Run settings

Initial settings:

```text
region: us-central1 or another low-cost region near users
min instances: 0
max instances: 1 for demos, 3-10 for small production
concurrency: 80-250, tune with load tests
timeout: 5-10 seconds for ingestion requests
memory: 256-512 MiB initially
CPU: 1 vCPU initially
unauthenticated: allowed for /v1/events:batch, protected by Vizoalica ingest tokens
```

Cost-control settings:

```text
VIZOALICA_MAX_REQUEST_BYTES=131072
VIZOALICA_MAX_EVENTS_PER_BATCH=25
VIZOALICA_TOKEN_TTL_SECONDS=300
VIZOALICA_MAX_EVENTS_PER_TOKEN=25
VIZOALICA_DEMO_MODE=false
```

The important rule: **reject before storing or forwarding**. Token validation, origin/source checks, schema checks, payload limits, privacy guard, and quotas should run before any expensive operation.

## Deployment sketch

Build and deploy the ingestion service container:

```bash
corepack pnpm install
corepack pnpm --filter @vizoalica/ingest-api build

gcloud run deploy vizoalica-ingest \
  --source apps/ingest-api \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --concurrency 200 \
  --timeout 10s \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars VIZOALICA_DEMO_MODE=false,VIZOALICA_MAX_REQUEST_BYTES=131072 \
  --set-secrets VIZOALICA_TOKEN_SECRET=vizoalica-token-secret:latest
```

Then embed the SDK with the Cloud Run URL:

```html
<script
  async
  src="https://YOUR_ASSET_HOST/vizoalica.js"
  data-endpoint="https://vizoalica-ingest-HASH-REGION.a.run.app/v1/events:batch"
  data-source="public_source_key"
  data-project="project_id"
  data-token-url="/vizoalica/ingest-token"
  data-consent="analytics-granted"
></script>
```

The customer's website backend should serve `/vizoalica/ingest-token` and mint a short-lived token. The signing secret should live in Secret Manager or the customer's own secret store, never in browser code.

## Storage choices

Vizoalica should support multiple storage adapters because the cheapest option depends on traffic and query expectations.

### Option A: Cloud Storage Parquet chunks — cheapest analytics-ready path

Best for:

- very low cost;
- raw event retention in analytics-ready columnar files;
- low-cost batch or external-table analysis;
- teams that do not need immediate dashboard queries.

Shape:

```text
Cloud Run → bounded in-memory buffer → Cloud Storage Parquet chunks → DuckDB/BigQuery/external-table analysis
```

Pros:

- Very cheap storage.
- Simple operational model.
- Good for open-source self-hosting and backups.
- Parquet can be queried later with DuckDB, Spark, or BigQuery external/load workflows without changing the browser SDK.

Cons:

- Not ideal for immediate dashboard queries.
- Many tiny objects can create operation overhead; batches should be grouped by project/date/time window.

Suggested object layout:

```text
gs://vizoalica-events/project_id={project_id}/dt=YYYY-MM-DD/hour=HH/{source_id}-{timestamp}-{uuid}.parquet
```

### Option B: Firestore — simplest queryable small-site path

Best for:

- simple persistence;
- low-volume sites;
- avoiding database operations;
- small admin/debug views.

Shape:

```text
Cloud Run → Firestore
```

Pros:

- Serverless and simple.
- Has free daily quotas.
- No database instance to manage.

Cons:

- Per-event document writes can exceed free quota quickly for analytics workloads.
- Query model is not ideal for larger analytical scans.

Recommendation: useful for early demos and tiny sites, but not the preferred high-volume analytics store.

### Option C: Pub/Sub buffer + Cloud Storage worker — cheap scalable ingestion

Best for:

- burst handling;
- separating public ingestion from storage writes;
- preserving low Cloud Run latency;
- better durability than per-instance buffering.

Shape:

```text
Cloud Run ingest → Pub/Sub topic → Cloud Run worker → Cloud Storage batch files
```

Pros:

- Pub/Sub provides a managed buffer.
- First 10 GiB/month of basic message throughput is free per billing account.
- Worker can batch writes to reduce Cloud Storage object churn.

Cons:

- More moving parts than the one-service version.
- Requires a second Cloud Run worker and Pub/Sub topic/subscription.

Recommendation: first scale-up path once direct writes become awkward.

### Option D: BigQuery — best analytics path, but add guardrails

Best for:

- SQL analytics;
- dashboards;
- product reporting;
- future AI-assisted analysis over structured events.

Shape:

```text
Cloud Run ingest → Pub/Sub or batch files → BigQuery partitioned tables
```

Pros:

- Excellent for analytics queries.
- BigQuery has free monthly query allowance and Storage Write API free ingestion allowance.
- Partitioning and clustering can keep query cost predictable.

Cons:

- Bad queries can scan lots of data and create surprise costs.
- Direct streaming is more expensive than batch loading from Cloud Storage.
- Requires schema/table lifecycle management.

Recommendation: add BigQuery as an optional analytics adapter, not the mandatory v0.1.0 storage path.

## Recommended phases

### Phase GCP-1: Minimal Cloud Run deployment

Deliver:

- Dockerfile or Cloud Run source deployment.
- One Cloud Run service.
- Secret Manager token secret.
- Direct Cloud Run URL.
- Min instances 0.
- Max instances cap.
- In-memory or simple persistence adapter for smoke testing.

Use for:

- demos;
- integration testing;
- validating token and ingestion behavior.

### Phase GCP-2: Cheap persistence

Deliver one of:

- Cloud Storage Parquet chunk adapter; or
- Firestore adapter for tiny installs.

Recommended default: **Cloud Storage Parquet chunk adapter**, because it is cheap, analytics-ready, and avoids per-event writes as volume grows.

### DuckDB MVP analysis layer

For the first analysis stage, run DuckDB as an embedded CLI/job against the Parquet chunk layout. This avoids a managed warehouse for small and medium self-hosted installs. Schedule it to produce hourly/daily summary JSON or small derived tables for dashboards. Move to BigQuery, ClickHouse, or another warehouse only when concurrency, governance, or query volume justifies the extra operating cost.

### Phase GCP-3: Buffered scale path

Deliver:

- Pub/Sub topic for accepted event batches.
- Cloud Run worker subscriber.
- Batched Cloud Storage writes.
- Dead-letter topic for failed writes.

Use when:

- ingestion bursts exceed direct storage comfort;
- we need more durable buffering;
- accepted events should not be lost if a storage backend slows down.

### Phase GCP-4: Query and dashboards

Deliver:

- BigQuery partitioned tables.
- Batch load from Cloud Storage or Storage Write API.
- Query guardrails: partition filters, default date windows, budget alerts.

Use when:

- product dashboards are introduced;
- users need SQL exploration;
- AI-assisted summaries need structured historical data.

## Cost guardrails

1. **Cloud Run max instances must be set**. This caps worst-case compute spend.
2. **Cloud Run min instances should default to 0**. Users can raise it only if cold starts matter.
3. **Reject bad traffic early** before Pub/Sub, storage, BigQuery, or logs.
4. **Keep request timeout short** for ingestion, around 5-10 seconds.
5. **Avoid external HTTPS load balancer by default**. Use direct Cloud Run URL or Cloud Run custom domain first.
6. **Avoid Cloud SQL by default**. It is simple conceptually but not cheapest because instances run continuously.
7. **Batch storage writes** when using Cloud Storage or BigQuery.
8. **Partition analytics tables by event date** before enabling dashboards.
9. **Set budgets and alerts** in every GCP project.
10. **Expose per-project quotas** in Vizoalica so abuse is stopped at the application layer.

## What not to use first

Avoid these for the default cheap/simple deployment:

- **GKE/Kubernetes**: too operationally heavy for v0.1.0.
- **Always-on Compute Engine VM**: simple, but idle cost is worse than Cloud Run for low traffic.
- **Cloud SQL as required storage**: familiar, but a 24/7 managed database conflicts with the cheapest default.
- **External Application Load Balancer**: powerful, but not needed for first deployments and can add cost/complexity.
- **BigQuery as mandatory hot path**: great later, but query governance and ingestion design should come after the ingestion foundation is stable.

## Open decisions for Vizoalica

1. Should the first persistent GCP adapter be Cloud Storage batch files or Firestore?
2. Should the hosted SDK file `vizoalica.js` be served from the same Cloud Run service, a Cloud Storage bucket, or a CDN?
3. Should v0.1.0 include Terraform, `gcloud` shell scripts, or both?
4. Should the default deployment create a Cloud Run custom domain mapping, or leave that as a manual step?

## Current recommendation

For the simplest and cheapest default:

```text
Cloud Run ingest service
+ Secret Manager token secret
+ Cloud Storage / bucket-compatible Parquet chunks
+ max instances cap
+ min instances 0
+ no load balancer
+ no Cloud SQL
+ optional BigQuery later
```

This keeps the first deployment understandable, cheap at idle, safe under abuse, and expandable when Vizoalica adds dashboards and AI-assisted analytics.

## References

- Cloud Run pricing and free tier: https://cloud.google.com/run/pricing
- Cloud Run product overview, including scale-to-zero: https://cloud.google.com/run
- Cloud Run autoscaling behavior: https://docs.cloud.google.com/run/docs/about-instance-autoscaling
- Cloud Run request timeout: https://docs.cloud.google.com/run/docs/configuring/request-timeout
- Google Cloud Free Tier overview: https://docs.cloud.google.com/free/docs/free-cloud-features
- Cloud Storage pricing/free usage limits: https://cloud.google.com/storage/pricing
- Firestore pricing/free quota: https://cloud.google.com/firestore/pricing
- Pub/Sub pricing/free throughput: https://cloud.google.com/pubsub/pricing
- BigQuery pricing and Storage Write API costs/free allowance: https://cloud.google.com/bigquery/pricing
- Cloud SQL pricing: https://cloud.google.com/sql/pricing
