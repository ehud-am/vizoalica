# Dashboard Contract

The dashboard page and summary endpoint require the administrator bearer credential and have no
browser CORS support.

The summary request accepts only a project ID, a source ID that belongs to it, and one period:
`today`, `7d`, or `30d`. It returns the inclusive date range, unique-user total, and page-view
