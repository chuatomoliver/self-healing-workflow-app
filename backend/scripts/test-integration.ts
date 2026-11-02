import { spawn } from 'node:child_process'
import { startTestMysql } from './mysql-test-instance.ts'

const database = await startTestMysql()
try {
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'tests/database.test.ts', 'tests/webhook-database.test.ts', 'tests/execution-database.test.ts'], {
    env: { ...process.env, TEST_DATABASE_URL: database.databaseUrl }, stdio: 'inherit', windowsHide: true,
  })
  process.exitCode = await new Promise<number>((accept, reject) => { child.once('error', reject); child.once('exit', (code) => accept(code ?? 1)) })
} finally { await database.stop() }
