import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'
import { handlePlaytest, playtestPath } from './playtest-store.mjs'

const host = '127.0.0.1'
const port = Number(process.env.PORT ?? 5174)
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.')
  let root, identity
  try {
    root = await realpath(join(process.cwd(), 'dist'))
    const pkg = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'))
    const index = await readFile(join(root, 'index.html'))
    identity = { name: pkg.name, version: pkg.version, build: createHash('sha256').update(index).digest('hex') }
  } catch {
    throw new Error('Production files are unavailable. Run npm run build first.')
  }
  const url = `http://${host}:${port}/`
  const server = createServer(async (req, res) => {
    function send(status, body, type = 'text/plain; charset=utf-8') {
      res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(req.method === 'HEAD' ? undefined : body)
    }
    if (req.url === playtestPath) return handlePlaytest(req, res, process.cwd(), port)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      return send(405, 'Method not allowed')
    }
    let path
    try {
      path = decodeURIComponent(req.url.split('?')[0])
      if (!path.startsWith('/') || path.startsWith('//') || /[\\\0]/.test(path) || path.split('/').some(part => part === '.' || part === '..')) {
        return send(400, 'Invalid path')
      }
    } catch {
      return send(400, 'Invalid path')
    }
    if (path === '/app-info.json') return send(200, JSON.stringify(identity), mime['.json'])
    try {
      const file = await realpath(join(root, path === '/' ? 'index.html' : path))
      if (!file.startsWith(root + sep)) return send(400, 'Invalid path')
      if (!(await stat(file)).isFile()) return send(404, 'Not found')
      return send(200, await readFile(file), mime[extname(file)] ?? 'application/octet-stream')
    } catch (error) {
      return send(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'Not found' : 'Unable to read file')
    }
  })
  server.on('error', async error => {
    if (error.code === 'EADDRINUSE') {
      try {
        const response = await fetch(`${url}app-info.json`, { signal: AbortSignal.timeout(1500), redirect: 'error' })
        const existing = response.ok ? await response.json() : null
        if (existing && ['name', 'version', 'build'].every(key => existing[key] === identity[key])) {
          console.log(`EMG Garden same build is already running at ${url}`)
          return
        }
      } catch { /* A busy port must prove its identity before reuse. */ }
      console.error(`Port ${port} is occupied by a different application or build. Close it yourself or choose another PORT.`)
    } else {
      console.error(`Unable to start EMG Garden: ${error.message}`)
    }
    process.exitCode = 1
  })
  server.listen(port, host, () => console.log(`EMG Garden is ready at ${url} Keep this terminal open.`))
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
