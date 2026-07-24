# Performance Benchmarks

This directory contains performance benchmarks for the KnowledgeBook application.

## Benchmark Categories

- **Latency**: API response times for common operations
- **Throughput**: Requests per second under concurrent load
- **Resource Usage**: Memory and CPU consumption

## Running Benchmarks

```bash
npm run bench
```

## Thresholds

- Latency regression: >10% slower
- Memory regression: >20% higher
- Throughput regression: >15% lower

## Structure

- `latency/` - Latency benchmarks
- `throughput/` - Throughput benchmarks
- `memory/` - Memory usage benchmarks
