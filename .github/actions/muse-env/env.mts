import { appendFileSync, chmodSync, lstatSync, mkdtempSync, realpathSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'

const prefix = 'metaflow-muse-'

function runnerDirectory(env: NodeJS.ProcessEnv): string {
  if (env.GITHUB_ACTIONS !== 'true' || !env.RUNNER_TEMP || !isAbsolute(env.RUNNER_TEMP)) {
    throw new Error('Run the Muse environment handoff inside GitHub Actions.')
  }
  return realpathSync(env.RUNNER_TEMP)
}

export function prepareMuseEnv(env: NodeJS.ProcessEnv = process.env): string {
  const temp = runnerDirectory(env)
  const key = env.MODEL_API_KEY?.trim()
  if (!key || /[\x00-\x1f\x7f]/.test(key)) throw new Error('Set the MODEL_API_KEY GitHub secret to a non-empty, single-line API key.')
  if (!env.GITHUB_OUTPUT || !isAbsolute(env.GITHUB_OUTPUT)) throw new Error('The GitHub Actions output file is unavailable.')
  // Round-trip Node's own dotenv parser so punctuation never changes the key.
  const contents = ["'", '`', '"'].map((quote) => `MODEL_API_KEY=${quote}${key}${quote}\n`).find((candidate) => {
    const parsed = parseEnv(candidate)
    return Object.keys(parsed).length === 1 && parsed.MODEL_API_KEY === key
  })
  if (!contents) throw new Error('MODEL_API_KEY cannot be safely represented in a Node environment file.')
  const directory = mkdtempSync(join(temp, prefix))
  const file = join(directory, '.env')
  try {
    chmodSync(directory, 0o700)
    writeFileSync(file, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    // Only the non-secret path is exposed as an action output.
    if (/[\r\n]/.test(file)) throw new Error('Invalid runner temporary path.')
    appendFileSync(env.GITHUB_OUTPUT, `\nenv-file=${file}\n`, 'utf8')
    return file
  } catch {
    rmSync(file, { force: true })
    rmdirSync(directory)
    throw new Error('Could not prepare the private Muse environment file.')
  }
}

export function cleanupMuseEnv(env: NodeJS.ProcessEnv = process.env) {
  const temp = runnerDirectory(env)
  const file = resolve(env.MUSE_ENV_FILE || '.')
  const directory = dirname(file)
  if (basename(file) !== '.env' || dirname(directory) !== temp || !basename(directory).startsWith(prefix)) {
    throw new Error('Refusing to remove a file outside the Muse handoff directory.')
  }
  if (!lstatSync(directory, { throwIfNoEntry: false })) return
  if (lstatSync(directory).isSymbolicLink()) throw new Error('Refusing to follow a linked handoff directory.')
  rmSync(file, { force: true })
  rmdirSync(directory)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'prepare') prepareMuseEnv()
    else if (process.argv[2] === 'cleanup') cleanupMuseEnv()
    else throw new Error('Use prepare or cleanup for the Muse environment handoff.')
  } catch {
    // Filesystem and dotenv errors must never reflect a credential into logs.
    console.error(process.argv[2] === 'prepare'
      ? 'Muse handoff failed. Check that MODEL_API_KEY is set to a single-line GitHub secret and runner temporary storage is available.'
      : 'Muse handoff cleanup failed. Check the temporary file path and permissions.')
    process.exitCode = 1
  }
}
