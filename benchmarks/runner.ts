/**
 * Benchmark runner utilities
 */

export async function runBenchmarks(config) {
  const results = {
    latency: {},
    throughput: {},
    memory: {},
    regressions: [] as string[],
  }

  return results
}

export function compareWithBaseline(current, baseline, thresholdPct) {
  const diff = ((current - baseline) / baseline) * 100
  return {
    diff,
    isRegression: diff > thresholdPct,
  }
}
