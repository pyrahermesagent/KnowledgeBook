/**
 * Main benchmark runner
 */

import { runBenchmarks } from './runner.mjs'

const config = {
  thresholds: {
    latency: {
      maxTimeMs: {
        projectCreate: 500,
        projectGet: 50,
        pageCreate: 200,
        pageGet: 30,
        search: 100,
        listProjects: 100,
        listPages: 75,
      },
      regressionPct: 10,
    },
  },
}

async function main() {
  console.log('KnowledgeBook Performance Benchmarks\n')
  const results = await runBenchmarks(config)
  console.log('\n=== SUMMARY ===')
  console.log(`Total regressions: ${results.regressions.length}`)
  
  if (results.regressions.length > 0) {
    console.log('\nRegressions detected:')
    for (const reg of results.regressions) {
      console.log(`  - ${reg}`)
    }
    process.exit(1)
  }

  console.log('\nAll benchmarks passed!')
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
