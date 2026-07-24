/**
 * Main benchmark runner
 * 
 * Runs all benchmarks and generates a report.
 * Usage: npm run bench
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
      regressionPct: 10, // >10% slower is regression
    },
    throughput: {
      minProjectsPerSecond: 20,
      minReadsPerSecond: 25,
      minWritesPerSecond: 20,
      regressionPct: 15, // >15% lower is regression
    },
    memory: {
      maxRssMb: {
        scan1000Rows: 100,
        read10000Pages: 50,
        concurrentOps: 75,
      },
      regressionPct: 20, // >20% higher is regression
    },
  },
}

async function main() {
  console.log('KnowledgeBook Performance Benchmarks\n')
  console.log('Thresholds:')
  console.log('  Latency: >10% slower = regression')
  console.log('  Throughput: >15% lower = regression')
  console.log('  Memory: >20% higher = regression\n')

  const results = await runBenchmarks(config)

  console.log('\n=== BENCHMARK RESULTS ===\n')
  
  // Latency results
  console.log('Latency (ms):')
  for (const [name, time] of Object.entries(results.latency)) {
    const status = time > config.thresholds.latency.maxTimeMs[name.replace(/([A-Z])/g, ' $1').trim().toLowerCase().replace(/ /g, '')] ? '✗ REGRESSION' : '✓ OK'
    console.log(`  ${name}: ${time.toFixed(2)}ms ${status}`)
  }

  // Throughput results
  console.log('\nThroughput (ops/sec):')
  for (const [name, ops] of Object.entries(results.throughput)) {
    const threshold = config.thresholds.throughput[`min${name.charAt(0).toUpperCase() + name.slice(1)}`] || 20
    const status = ops < threshold ? '✗ REGRESSION' : '✓ OK'
    console.log(`  ${name}: ${ops.toFixed(2)} ${status}`)
  }

  // Memory results
  console.log('\nMemory (MB RSS):')
  for (const [name, rss] of Object.entries(results.memory)) {
    const status = rss > (config.thresholds.memory.maxRssMb[name.replace(/([A-Z])/g, ' $1').trim().toLowerCase().replace(/ /g, '')] || 50) ? '✗ REGRESSION' : '✓ OK'
    console.log(`  ${name}: ${rss.toFixed(2)} ${status}`)
  }

  console.log('\n=== SUMMARY ===')
  const totalTests = Object.keys(results.latency).length + Object.keys(results.throughput).length + Object.keys(results.memory).length
  const passing = totalTests - results.regressions.length
  console.log(`Total tests: ${totalTests}`)
  console.log(`Passing: ${passing}`)
  console.log(`Regressions: ${results.regressions.length}`)
  
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
