import { PgSubscriber } from '..'
import ava, { TestInterface } from 'ava'
import { container, DbContext } from './fixture/db'

const LOW_RETRY = {
  factor: 1,
  retries: 5
}

const test = ava as TestInterface<DbContext & { subscriber: PgSubscriber }>

test.beforeEach(async t => {
  await container.setup(t.context)
  t.context.subscriber = new PgSubscriber({
    pgConnectionConfig: {
      database: t.context.dbConfig.database,
      user: t.context.dbConfig.username,
      password: t.context.dbConfig.password,
      port: t.context.dbConfig.port
    }
  })
})

test.afterEach(async t => {
  const { subscriber } = t.context
  await subscriber.close()
  await container.teardown(t.context)
})

test('init - bad user', async t => {
  const invalidUserSubscriber = new PgSubscriber({
    pgConnectionConfig: {
      user: 'bad_username',
      password: t.context.dbConfig.password,
      port: t.context.dbConfig.port
    },
    dbConnectRetryOptions: LOW_RETRY
  })
  try {
    await invalidUserSubscriber.db()
    t.fail('should not connect')
  } catch (err) {
    t.truthy(err, 'fails to connect with bad user')
  }
})

test('accepts dsn', async t => {
  const { username: user, password, port } = t.context.dbConfig
  const dsnSubscriber = new PgSubscriber({
    pgConnectionConfig: `postgresql://${user}:${password}@localhost:${port}/${user}`
  })
  try {
    const db = await dsnSubscriber.db()
    await db.end()
    t.pass('connect via dsn')
  } catch (err) {
    t.fail('unable to connect')
    throw err
  }
})

test('receive notification - json', async t => {
  const { subscriber } = t.context
  await new Promise(async (resolve, reject) => {
    await subscriber.addChannel('foobar', function (channelPayload) {
      t.deepEqual(
        channelPayload,
        { abc: 123 },
        'notifcation JSON received and parsed'
      )
      resolve()
    })
    setImmediate(async () => {
      const db = await subscriber.db()
      await db.query('NOTIFY foobar, \'{"abc":123}\'')
    })
    setTimeout(reject, 10000)
  })
})

test('receive notification - string', async t => {
  const { subscriber } = t.context
  await new Promise(async (resolve, reject) => {
    await subscriber.addChannel('foobar', function (channelPayload) {
      t.deepEqual(channelPayload, 'barfoo', 'notifcation string received')
      resolve()
    })
    setImmediate(async () => {
      const db = await subscriber.db()
      await db.query("NOTIFY foobar, 'barfoo'")
    })
    setTimeout(reject, 10000)
  })
})

test('receive notification on multiple channels', async t => {
  const { subscriber } = t.context
  let count = 0
  await new Promise(async (resolve, reject) => {
    const maybeComplete = () => {
      ++count
      if (count === 2) resolve()
    }
    await subscriber.addChannel('foo', function (channelPayload) {
      t.deepEqual(
        channelPayload,
        { abc: 123 },
        'recieved foo on correct channel'
      )
      maybeComplete()
    })
    await subscriber.addChannel('bar', function (channelPayload) {
      t.deepEqual(
        channelPayload,
        { xyz: 789 },
        'recieved bar on correct channel'
      )
      maybeComplete()
    })
    setImmediate(async () => {
      const db = await subscriber.db()
      db.query('NOTIFY def, \'{"ghi":456÷}\'')
      db.query('NOTIFY foo, \'{"abc":123}\'')
      db.query('NOTIFY bar, \'{"xyz":789}\'')
    })
    setTimeout(reject, 10000)
  })
})

test('non-alphanumeric channel names', async t => {
  const { subscriber } = t.context
  const channel = '97a38cd1-d332-4240-93e4-1ff436a7da2a'
  const expected = { 'non-alpha': true }
  await new Promise(async (resolve, reject) => {
    await subscriber.addChannel(channel, function (channelPayload) {
      t.deepEqual(
        channelPayload,
        expected,
        'recieved data on non-alpha channel'
      )
      resolve()
    })
    setImmediate(async () => {
      const db = await subscriber.db()
      await db.query(`NOTIFY "${channel}", \'${JSON.stringify(expected)}\'`)
    })
    setTimeout(reject, 15000)
  })
})

test('should stop listening when channel is removed', async t => {
  const { subscriber } = t.context
  await new Promise(async (resolve, reject) => {
    await subscriber.addChannel('foo', function () {
      throw new Error(
        'This channel should have been removed and should not receive any items'
      )
    })
    await subscriber.addChannel('foo', function () {
      throw new Error(
        'This channel should have been removed and should not receive any items'
      )
    })
    await subscriber.addChannel('bar', function () {
      t.pass()
      resolve()
    })
    await subscriber.removeChannel('foo')

    setImmediate(async function () {
      const db = await subscriber.db()
      await db.query('NOTIFY foo, \'{"abc":123}\'')
      await db.query('NOTIFY bar, \'{"xyz":789}\'')
    })
  })
})

test('should allow mutliple listeners for the same channel', async t => {
  const { subscriber } = t.context
  let count = 0
  await new Promise(async (resolve, reject) => {
    await subscriber.addChannel('foo', function () {
      ++count
    })
    await subscriber.addChannel('foo', function () {
      t.is(count, 1, 'event handlers fire in order')
      resolve()
    })
    setImmediate(async function () {
      const db = await subscriber.db()
      await db.query("NOTIFY foo, 'bar'")
    })
  })
})

test('should be able to remove specific listener', async t => {
  const { subscriber } = t.context
  const channel = 'foo'
  await new Promise(async (resolve, reject) => {
    const listener = function () {
      reject(
        new Error(
          'This channel should have been removed and should not receive any items'
        )
      )
    }
    await subscriber.addChannel(channel, listener)
    await subscriber.addChannel(channel, () => {
      t.pass()
      resolve()
    })
    await subscriber.removeChannel(channel, listener)
    setImmediate(async function () {
      const db = await subscriber.db()
      await db.query(`NOTIFY ${channel}, 'bar'`)
    })
  })
})

test('should support EventEmitter methods for listening', async t => {
  const { subscriber } = t.context
  await new Promise(async (resolve, reject) => {
    await subscriber.addChannel('foobar')
    subscriber.on('foobar', () => {
      t.pass()
      resolve()
    })
    setImmediate(async function () {
      const db = await subscriber.db()
      await db.query("NOTIFY foobar, 'bar'")
    })
  })
})

test('should support recovery after reconnect', async t => {
  const { subscriber } = t.context
  await new Promise(async (resolve, reject) => {
    await subscriber.close()
    await subscriber.addChannel('foobar', function () {
      resolve()
    })
    await subscriber.addChannel('foobar', () => {
      t.pass()
      resolve()
    })
    setImmediate(async function () {
      const db = await subscriber.db()
      await db.query("NOTIFY foobar, 'bar'")
    })
  })
})

test('robust against SQL injection', async t => {
  const { subscriber } = t.context
  const expected = { abc: '\'"; AND DO SOMETHING BAD' }
  const channel = 'baz'
  await new Promise(async resolve => {
    await subscriber.addChannel(channel, function (channelPayload) {
      t.deepEqual(channelPayload, expected)
      resolve()
    })
    await subscriber.publish(channel, expected)
  })
})

test('should gracefully handle too large payloads', async t => {
  const { subscriber } = t.context
  const data = new Array(1e6)
  data.fill('a')
  try {
    await subscriber.publish('any_channel_really', data)
    t.fail('huge data should have broken pg client')
  } catch (err) {
    t.truthy(!!err.message.match(/too long/i))
  }
})
