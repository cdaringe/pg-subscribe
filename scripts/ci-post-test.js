require('perish')
const isDev = !!(process.env.NODE_ENV || '').match(/dev/)
const execa = require('execa')
const path = require('path')
const projectRoot = path.join(__dirname, '..')

if (process.env.CIRCLE_BRANCH !== 'master') {
  console.warn('not on master, skipping publish cycle')
  process.exit(0)
}

const SPAWN_OPTS = {
  env: process.env,
  cwd: projectRoot
}

void (async function postTest () {
  // eslint-disable-line
  console.log('executing semantic-release')
  try {
    const args = ['semantic-release', isDev ? '-d' : ''].filter(Boolean)
    var proc = await execa('npx', args, SPAWN_OPTS)
    if (proc.stdout) console.log(proc.stdout)
  } catch (err) {
    // @TODO debrittle-ify, as feasible.
    if (!err.stderr) throw err
    // let ENOCHANGES occur
    if (err.stderr && !err.stderr.toString().match(/ENOCHANGE/)) {
      console.error(err.stderr.toString())
      throw err
    }
  }
})()
