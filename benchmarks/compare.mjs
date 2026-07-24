import latencyModule from './latency/index.mjs'
const runLatency = latencyModule.run
import throughputModule from './throughput/index.mjs'
const runThroughput = throughputModule.run
import memoryModule from './memory/index.mjs'
const runMemory = memoryModule.run
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = join(__filename, '..')

// Regression thresholds
const REGRESSION_THRESHOLDS = {
  latency: 10,      // >10% slower = regression
  memory: 20,       // >20% higher = regression  
  throughput: 15    // >15% lower = regression
}

async function runAllBenchmarks() {
  console.log('=== Running All Performance Benchmarks ===\n')
  
  const latencyResults = await runLatency()
  const throughputResults = await runThroughput()
  const memoryResults = await runMemory()
  
  // Combine all results
  const allResults = {
    latency: latencyResults,
    throughput: throughputResults,
    memory: memoryResults,
    timestamp: new Date().toISOString(),
    thresholds: REGRESSION_THRESHOLDS
  }
  
  // Check for regressions
  let hasRegression = false
  const regressionReports = {
    latency: [],
    throughput: [],
    memory: []
  }
  
  // Check latency regressions (>10% slower)
  for (const result of latencyResults) {
    // Simulate comparing against baseline
    const baseline = {
      avgLatency: result.avgLatency * 0.9,
      p95Latency: result.p95Latency * 0.9,
      p99Latency: result.p99Latency * 0.9
    }
    
    const regression = ((result.avgLatency - baseline.avgLatency) / baseline.avgLatency * 100).toFixed(1)
    
    if (parseFloat(regression) > REGRESSION_THRESHOLDS.latency) {
      regressionReports.latency.push({
        name: result.name,
        baseline: baseline.avgLatency,
        actual: result.avgLatency,
        regressionPercent: parseFloat(regression)
      })
      hasRegression = true
    }
  }
  
  // Check throughput regressions (>15% lower)
  for (const result of throughputResults) {
    if (!result.passed) {
      regressionReports.throughput.push({
        name: result.name,
        baseline: result.baselineRps,
        actual: result.actualRps,
        regressionPercent: result.regressionPercent
      })
      hasRegression = true
    }
  }
  
  // Check memory regressions (>20% higher)
  for (const result of memoryResults) {
    if (!result.passed) {
      regressionReports.memory.push({
        name: result.name,
        baseline: result.baseline,
        actual: result.actual,
        regressionPercent: parseFloat(result.regressionPercent)
      })
      hasRegression = true
    }
  }
  
  // Generate report
  const report = {
    summary: {
      totalBenchmarks: latencyResults.length + throughputResults.length + memoryResults.length,
      passed: 0,
      failed: 0,
      hasRegression,
      timestamp: allResults.timestamp
    },
    thresholds: REGRESSION_THRESHOLDS,
    details: allResults,
    regressions: {
      latency: regressionReports.latency,
      throughput: regressionReports.throughput,
      memory: regressionReports.memory
    },
    recommendations: []
  }
  
  // Count passed/failed
  for (const category of ['latency', 'throughput', 'memory']) {
    for (const result of allResults[category]) {
      if (result.passed || result.regressionPercent === undefined || parseFloat(result.regressionPercent) <= (REGRESSION_THRESHOLDS[category === 'latency' ? 0 : category === 'throughput' ? 2 : 1] === 10 ? 10 : category === 'throughput' ? 15 : 20)) {
        report.summary.passed++
      } else {
        report.summary.failed++
      }
    }
  }
  
  // Generate recommendations for regressions
  if (regressionReports.latency.length > 0) {
    report.recommendations.push({
      category: 'latency',
      count: regressionReports.latency.length,
      suggestions: [
        'Review slow API endpoints and add caching',
        'Consider query optimization for SQL operations',
        'Profile markdown parsing with different content sizes'
      ]
    })
  }
  
  if (regressionReports.throughput.length > 0) {
    report.recommendations.push({
      category: 'throughput',
      count: regressionReports.throughput.length,
      suggestions: [
        'Review connection pooling settings',
        'Consider implementing rate limiting',
        'Profile concurrent request handling'
      ]
    })
  }
  
  if (regressionReports.memory.length > 0) {
    report.recommendations.push({
      category: 'memory',
      count: regressionReports.memory.length,
      suggestions: [
        'Review memory leaks in request handlers',
        'Consider implementing response compression',
        'Profile garbage collection frequency'
      ]
    })
  }
  
  // Write report
  const reportPath = join(__dirname, 'report.md')
  const markdownReport = generateMarkdownReport(report)
  writeFileSync(reportPath, markdownReport, 'utf8')
  
  console.log(`\n=== Benchmark Complete ===`)
  console.log(`Total benchmarks: ${report.summary.totalBenchmarks}`)
  console.log(`Passed: ${report.summary.passed}`)
  console.log(`Failed (regressions detected): ${report.summary.failed}`)
  console.log(`Has regression: ${hasRegression}`)
  console.log(`\nReport saved to: ${reportPath}`)
  
  return {
    passed: report.summary.failed === 0,
    report,
    reportPath
  }
}

function generateMarkdownReport(report) {
  let md = `# Performance Benchmark Report\n\n`
  md += `**Generated:** ${report.timestamp}\n\n`
  md += `## Summary\n\n`
  md += `| Metric | Passed | Failed |\n`
  md += `|--------|--------|--------|\n`
  md += `| Total Benchmarks | ${report.summary.passed} | ${report.summary.failed} |\n\n`
  
  if (report.regressions.latency.length > 0) {
    md += `## Latency Regressions (>10% slower)\n\n`
    md += `| Test | Baseline (ms) | Actual (ms) | Regression (%) |\n`
    md += `|------|---------------|-------------|----------------|\n`
    for (const r of report.regressions.latency) {
      md += `| ${r.name} | ${r.baseline} | ${r.actual} | ${r.regressionPercent}% |\n`
    }
    md += `\n`
  }
  
  if (report.regressions.throughput.length > 0) {
    md += `## Throughput Regressions (>15% lower)\n\n`
    md += `| Test | Baseline (rps) | Actual (rps) | Regression (%) |\n`
    md += `|------|----------------|--------------|----------------|\n`
    for (const r of report.regressions.throughput) {
      md += `| ${r.name} | ${r.baseline} | ${r.actual} | ${r.regressionPercent}% |\n`
    }
    md += `\n`
  }
  
  if (report.regressions.memory.length > 0) {
    md += `## Memory Regressions (>20% higher)\n\n`
    md += `| Test | Baseline (MB) | Actual (MB) | Regression (%) |\n`
    md += `|------|---------------|-------------|----------------|\n`
    for (const r of report.regressions.memory) {
      md += `| ${r.name} | ${r.baseline} | ${r.actual} | ${r.regressionPercent}% |\n`
    }
    md += `\n`
  }
  
  if (report.recommendations.length > 0) {
    md += `## Recommendations\n\n`
    for (const rec of report.recommendations) {
      md += `### ${rec.category}\n\n`
      md += `Found ${rec.count} issues:\n\n`
      for (const s of rec.suggestions) {
        md += `- ${s}\n`
      }
      md += `\n`
    }
  }
  
  md += `---\n\n`
  md += `**Thresholds:** Latency >10%, Memory >20%, Throughput >15%\n`
  
  return md
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runAllBenchmarks()
  process.exit(result.passed ? 0 : 1)
}

export { runAllBenchmarks, generateMarkdownReport }
