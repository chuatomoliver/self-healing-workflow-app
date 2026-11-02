import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import mysql from 'mysql2/promise'

const delay = (milliseconds: number) => new Promise<void>((accept) => setTimeout(accept, milliseconds))
async function initialize(command: string, args: string[]) {
  const child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
  const timer = setTimeout(() => child.kill(), 60000)
  try {
    await new Promise<void>((accept, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => code === 0 ? accept() : reject(new Error('MySQL test initialization failed.')))
    })
  } finally { clearTimeout(timer) }
}

export async function startTestMysql() {
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const bin = process.env.MYSQL_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin' : '/usr/sbin')
  const executable = join(bin, `mysqld${suffix}`)
  await access(executable).catch(() => { throw new Error('Set MYSQL_BIN to a MySQL 8 server binary directory to run isolated integration tests.') })
  const directory = await mkdtemp(join(tmpdir(), 'metaflow-mysql-'))
  const data = join(directory, 'data')
  const bootstrap = join(directory, 'bootstrap.sql')
  const password = randomBytes(24).toString('hex')
  const server = createServer()
  await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test database port.')
  const port = address.port
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()))
  const options = { host: '127.0.0.1', port, user: 'root', password, database: 'metaflow_test', connectTimeout: 1000 }
  let mysqlProcess: ReturnType<typeof spawn> | undefined
  let exited = true
  let exitPromise: Promise<void> | undefined
  async function stop() {
    if (mysqlProcess && !exited) {
      let connection: mysql.Connection | undefined
      try {
        connection = await mysql.createConnection(options)
        await connection.query('SHUTDOWN')
      } catch { /* A failed startup may not accept connections. Stop only our child. */ }
      finally { connection?.destroy() }
      await Promise.race([exitPromise, delay(5000)])
      if (!exited) {
        mysqlProcess.kill()
        await Promise.race([exitPromise, delay(5000)])
      }
      if (!exited) throw new Error('The disposable MySQL server is still running; cleanup refused.')
    }
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('metaflow-mysql-')) throw new Error('Unexpected test directory; cleanup refused.')
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
  try {
    await mkdir(data)
    const common = ['--no-defaults', `--datadir=${data}`, `--log-error=${join(directory, 'mysql.log')}`]
    await initialize(executable, [...common, '--initialize-insecure'])
    // Generated bootstrap credentials are never passed on the command line or logged.
    // The file is outside the web root and removed as soon as startup completes.
    await writeFile(bootstrap, `ALTER USER 'root'@'localhost' IDENTIFIED BY '${password}';\nCREATE DATABASE metaflow_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`, { mode: 0o600 })
    mysqlProcess = spawn(executable, [...common, `--port=${port}`, '--bind-address=127.0.0.1', '--mysqlx=OFF', '--skip-log-bin', `--socket=${join(directory, 'mysql.sock')}`, `--pid-file=${join(directory, 'mysql.pid')}`, '--default-time-zone=+08:00', `--init-file=${bootstrap}`], { stdio: 'ignore', windowsHide: true })
    exited = false
    exitPromise = new Promise<void>((accept) => {
      mysqlProcess!.once('error', () => { exited = true; accept() })
      mysqlProcess!.once('exit', () => { exited = true; accept() })
    })
    const deadline = Date.now() + 45000
    while (!exited && Date.now() < deadline) {
      let connection: mysql.Connection | undefined
      try {
        connection = await mysql.createConnection(options)
        await connection.ping()
        await connection.end()
        await rm(bootstrap)
        return { databaseUrl: `mysql://root:${password}@127.0.0.1:${port}/metaflow_test`, stop }
      } catch { connection?.destroy(); await delay(200) }
    }
    throw new Error('MySQL test startup did not complete.')
  } catch {
    await stop()
    throw new Error('Could not initialize the disposable MySQL database. Check MYSQL_BIN and MySQL 8 server permissions.')
  }
}
