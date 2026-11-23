import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const args = process.argv.slice(2)
try {
  const [csvFile, jsonFile, flag, selector] = args
  const match = selector?.match(/^([1-9]\d*):([1-9]\d*)$/)
  const selection = match && { round: Number(match[1]), trial: Number(match[2]) }
  if (args.length !== 2 &&
      (args.length !== 4 || flag !== '--trial' || !selection ||
       !Number.isSafeInteger(selection.round) || !Number.isSafeInteger(selection.trial))) {
    throw new Error('Usage: npm run audit:recording -- recording-raw.csv recording-session.json [--trial ROUND:TRIAL]')
  }
  const [csvStat, jsonStat] = await Promise.all([stat(csvFile), stat(jsonFile)])
  if (csvStat.size > 240_000_000 || jsonStat.size > 20_000_000) throw new Error('Recording exceeds the supported size.')

  const root = fileURLToPath(new URL('..', import.meta.url))
  const bundle = await build({
    root, configFile: false, logLevel: 'silent',
    build: { ssr: 'src/recordingAudit.ts', target: 'node22', write: false, minify: false },
  })
  const entry = bundle.output.find(item => item.type === 'chunk' && item.isEntry)
  if (!entry) throw new Error('Could not load the local recording verifier.')
  const { auditRecording } = await import(`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`)
  const [csv, json] = await Promise.all([readFile(csvFile, 'utf8'), readFile(jsonFile, 'utf8')])
  const result = auditRecording(csv, json, selection || undefined)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
