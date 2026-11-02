import { spawn } from 'node:child_process'
import { startTestMysql } from './mysql-test-instance.ts'

const database = await startTestMysql()
try {
  const child = spawn(process.execPath, ['--test', 'tests/database.test.ts'], {
    env: { ...process.env, TEST_DATABASE_URL: database.databaseUrl }, stdio: 'inherit', windowsHide: true,
  })
  process.exitCode = await new Promise<number>((accept, reject) => { child.once('error', reject); child.once('exit', (code) => accept(code ?? 1)) })
} finally { await database.stop() }
