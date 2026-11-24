import { randomUUID } from 'node:crypto'
import { mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const playtestPath = '/api/playtest-checkpoint'
const maxBytes = 1024 * 1024
const logId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/

async function ownDirectory(parent, name) {
  const path = join(parent, name)
  try { await mkdir(path, { mode: 0o700 }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  if (await realpath(path) !== path) throw new Error('Playtest folder must be local to this project')
  return path
}

export async function handlePlaytest(req, res, workspace, port) {
  const send = (status, message) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(message)
  }
  if (req.method !== 'POST') return send(405, 'Use POST')
  const host = req.headers.host
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) || req.headers.origin !== `http://${host}`) {
    return send(403, 'Use the local EMG Garden page')
  }
  if (req.headers['content-type'] !== 'application/json') return send(415, 'Expected application/json')
  if (Number(req.headers['content-length']) > maxBytes) return send(413, 'Checkpoint too large')

  const chunks = []
  let bytes = 0
  try {
    for await (const chunk of req) {
      bytes += chunk.length
      if (bytes > maxBytes) {
        res.setHeader('Connection', 'close')
        return send(413, 'Checkpoint too large')
      }
      chunks.push(chunk)
    }
  } catch {
    if (!res.destroyed) send(400, 'Incomplete checkpoint')
    return
  }
  const body = Buffer.concat(chunks).toString('utf8')
  let batch
  try { batch = JSON.parse(body) }
  catch { return send(400, 'Invalid checkpoint JSON') }
  if (batch?.schema !== 'emg-garden-playtest/1' || batch.source !== 'serial' ||
      typeof batch.id !== 'string' || !logId.test(batch.id) ||
      !Number.isInteger(batch.sequence) || batch.sequence < 0 || batch.sequence >= 1_000_000 ||
      !Array.isArray(batch.samples) || batch.samples.length > 4000 ||
      !Array.isArray(batch.windows) || batch.windows.length > 160 ||
      !Array.isArray(batch.events) || batch.events.length > 160 ||
      !(batch.samples.length || batch.windows.length || batch.events.length)) {
    return send(400, 'Invalid playtest checkpoint')
  }

  let temporary
  try {
    const recordings = await ownDirectory(await realpath(workspace), 'recordings')
    const playtests = await ownDirectory(recordings, 'playtests')
    const folder = await ownDirectory(playtests, batch.id)
    const file = join(folder, String(batch.sequence).padStart(6, '0') + '.json')
    temporary = join(folder, '.' + randomUUID() + '.tmp')
    await writeFile(temporary, body, { flag: 'wx', mode: 0o600 })
    await rename(temporary, file)
    send(204, '')
  } catch {
    send(503, 'Could not save the local checkpoint')
  } finally {
    if (temporary) await unlink(temporary).catch(() => {})
  }
}
