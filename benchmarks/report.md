# Performance Benchmark Report

**Generated:** undefined

## Summary

| Metric | Passed | Failed |
|--------|--------|--------|
| Total Benchmarks | 12 | 2 |

## Latency Regressions (>10% slower)

| Test | Baseline (ms) | Actual (ms) | Regression (%) |
|------|---------------|-------------|----------------|
| API GET /api/posts | 9 | 10 | 11.1% |
| API GET /api/posts/:id | 4.5 | 5 | 11.1% |
| Markdown parsing (1KB) | 18 | 20 | 11.1% |
| Markdown parsing (10KB) | 45 | 50 | 11.1% |
| SQL query (indexed) | 2.7 | 3 | 11.1% |
| SQL query (full scan) | 13.5 | 15 | 11.1% |

## Throughput Regressions (>15% lower)

| Test | Baseline (rps) | Actual (rps) | Regression (%) |
|------|----------------|--------------|----------------|
| Concurrent GET requests (50) | 1200 | 960 | 20% |
| Concurrent GET requests (100) | 800 | 480 | 40% |

## Recommendations

### latency

Found 6 issues:

- Review slow API endpoints and add caching
- Consider query optimization for SQL operations
- Profile markdown parsing with different content sizes

### throughput

Found 2 issues:

- Review connection pooling settings
- Consider implementing rate limiting
- Profile concurrent request handling

---

**Thresholds:** Latency >10%, Memory >20%, Throughput >15%
