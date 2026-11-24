import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, request } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const script = fileURLToPath(new URL('./serve.mjs', import.meta.url))

async function fixture(t) {
  const temp = await realpath(tmpdir())
  const root = await mkdtemp(join(temp, 'emg-server-'))
  const children = new Set()
  t.after(async () => {
    // Stop processes using this directory as their cwd before removing it on Windows.
    await Promise.all([...children].map(async child => {
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill()
        await exited
      }
    }))
    assert.equal(dirname(root), temp)
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  })
  await mkdir(join(root, 'dist', 'assets'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'emg-training-demo', version: '0.1.1' }))
  await writeFile(join(root, 'dist', 'index.html'), '<!doctype html><title>EMG Garden</title>')
  await writeFile(join(root, 'dist', 'assets', 'app.js'), 'console.log("EMG")')
  await writeFile(join(root, 'dist', 'assets', 'app.css'), 'body{color:green}')
  await writeFile(join(root, 'dist', 'README.md'), '# EMG Garden guide')
  await writeFile(join(root, 'secret.txt'), 'private')
  await symlink(join(root, 'secret.txt'), join(root, 'dist', 'escape.txt'))
  return { root, launch: port => run(root, port, children) }
}

async function freePort() {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  return port
}

function run(root, port, children) {
  const child = spawn(process.execPath, [script], { cwd: root, env: { ...process.env, PORT: String(port) } })
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  children.add(child)
  return { child, output: () => output }
}

async function ready(process) {
  const deadline = Date.now() + 5000
  while (!process.output().includes('EMG Garden is ready at')) {
    assert.equal(process.child.exitCode, null, process.output())
    assert.ok(Date.now() < deadline, process.output())
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

function http(port, path = '/', method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, res => {
      let body = ''
      res.on('data', data => { body += data })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('serves built HTML and assets with MIME, HEAD and identity', async t => {
  const { launch } = await fixture(t)
  const port = await freePort()
  await ready(launch(port))
  const page = await http(port)
  assert.equal(page.status, 200)
  assert.match(page.headers['content-type'], /text\/html/)
  assert.match(page.body, /EMG Garden/)
  for (const [path, mime] of [['/assets/app.js?cache=1', /javascript/], ['/assets/app.css', /text\/css/]]) {
    const asset = await http(port, path)
    assert.equal(asset.status, 200)
    assert.match(asset.headers['content-type'], mime)
  }
  const head = await http(port, '/', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body, '')
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength(page.body))
  const identity = JSON.parse((await http(port, '/app-info.json')).body)
  assert.equal(identity.name, 'emg-training-demo')
  assert.equal(identity.version, '0.1.1')
  assert.match(identity.build, /^[a-f0-9]{64}$/)
  assert.equal((await http(port, '/app-info.json', 'HEAD')).body, '')
})

test('rejects missing files, unsafe paths, symlink escapes and unsupported methods', async t => {
  const { launch } = await fixture(t)
  const port = await freePort()
  await ready(launch(port))
  assert.equal((await http(port, '/missing')).status, 404)
  assert.equal((await http(port, '/assets/')).status, 404)
  assert.equal((await http(port, '/secret.txt')).status, 404)
  for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/%2e%2e/index.html', '/%5csecret.txt', '/%00', '/%zz', '//outside', '/escape.txt']) {
    assert.equal((await http(port, path)).status, 400, path)
  }
  const post = await http(port, '/', 'POST')
  assert.equal(post.status, 405)
  assert.equal(post.headers.allow, 'GET, HEAD')
})


test('saves serial playtest checkpoints only for the local page', async t => {
  const { root, launch } = await fixture(t)
  const port = await freePort()
  await ready(launch(port))
  const origin = 'http://127.0.0.1:' + port
  const path = '/api/playtest-checkpoint'
  const id = '11111111-1111-4111-8111-111111111111'
  const checkpoint = { schema:'emg-garden-playtest/1', id, sequence:0,
    source:'serial', samples:[[0,512,null]], windows:[], events:[] }
  function post(body, requestOrigin = origin) {
    return fetch(origin + path, { method:'POST', headers:{
      Origin:requestOrigin, 'Content-Type':'application/json',
    }, body:JSON.stringify(body) })
  }

  assert.equal((await post(checkpoint, 'https://example.com')).status, 403)
  assert.equal((await post({...checkpoint, id:'../secret.txt'})).status, 400)
  assert.equal((await post({...checkpoint, source:'replay'})).status, 400)
  assert.equal((await post({...checkpoint, samples:Array.from({length:4001},()=>[0,512,null])})).status, 400)
  assert.equal((await post(checkpoint)).status, 204)
  assert.equal((await post(checkpoint)).status, 204)
  assert.equal((await post({...checkpoint, sequence:1, samples:[[1,513,null]]})).status, 204)
  const folder = join(root, 'recordings', 'playtests', id)
  assert.deepEqual(JSON.parse(await readFile(join(folder, '000000.json'), 'utf8')), checkpoint)
  assert.deepEqual(await readdir(folder), ['000000.json', '000001.json'])
  assert.equal((await http(port, '/recordings/playtests/' + id + '/000000.json')).status, 404)
})

test('serves the linked Markdown guide as readable plain text', async t => {
  const { launch } = await fixture(t)
  const port = await freePort()
  await ready(launch(port))
  const guide = await http(port, '/README.md')
  assert.equal(guide.status, 200)
  assert.equal(guide.headers['content-type'], 'text/plain; charset=utf-8')
  assert.equal(guide.body, '# EMG Garden guide')
})

test('recognizes an existing instance only when application, version and build all match', async t => {
  const { root, launch } = await fixture(t)
  const port = await freePort()
  await ready(launch(port))
  const duplicate = launch(port)
  assert.equal((await once(duplicate.child, 'exit'))[0], 0, duplicate.output())
  assert.match(duplicate.output(), /same build/)
  for (const field of ['name', 'version', 'build']) {
    const expected = JSON.parse((await http(port, '/app-info.json')).body)
    const occupied = createServer((req, res) => res.end(JSON.stringify({ ...expected, [field]: 'different' })))
    occupied.listen(0, '127.0.0.1')
    await once(occupied, 'listening')
    try {
      const mismatch = launch(occupied.address().port)
      assert.equal((await once(mismatch.child, 'exit'))[0], 1, field)
      assert.match(mismatch.output(), /different application or build/)
    } finally {
      await new Promise(resolve => occupied.close(resolve))
    }
  }
  await writeFile(join(root, 'dist', 'index.html'), '<!doctype html><title>New build</title>')
  const changedBuild = launch(port)
  assert.equal((await once(changedBuild.child, 'exit'))[0], 1)
  assert.match(changedBuild.output(), /different application or build/)
})

test('rejects an occupied port that provides no valid application identity', async t => {
  const { launch } = await fixture(t)
  for (const mode of ['html', 'unresponsive']) {
    const occupied = createServer((req, res) => {
      if (mode === 'html') res.end('<html>another application</html>')
    })
    occupied.listen(0, '127.0.0.1')
    await once(occupied, 'listening')
    try {
      const other = launch(occupied.address().port)
      assert.equal((await once(other.child, 'exit'))[0], 1)
      assert.match(other.output(), /different application or build/)
    } finally {
      occupied.closeAllConnections()
      await new Promise(resolve => occupied.close(resolve))
    }
  }
})

test('fails clearly for invalid ports and absent production builds', async t => {
  const { root, launch } = await fixture(t)
  const invalid = launch('not-a-port')
  assert.equal((await once(invalid.child, 'exit'))[0], 1)
  assert.match(invalid.output(), /PORT/)
  await rm(join(root, 'dist'), { recursive: true })
  const missing = launch(await freePort())
  assert.equal((await once(missing.child, 'exit'))[0], 1)
  assert.match(missing.output(), /npm run build/)
})
