import { EventEmitter } from 'events'
import { WrapOptions } from 'retry'
import * as pg from 'pg'
import pgFormat from 'pg-format'
import retry from 'promise-retry'

export type DsnOrClientConfig = string | pg.ClientConfig

export type PgSubscriberConfig = {
  channels?: string[]
  pgConnectionConfig: DsnOrClientConfig
  dbConnectRetryOptions?: WrapOptions
}

export class PgSubscriber extends EventEmitter {
  public channels: string[]
  public dbConnectRetryOptions: WrapOptions | undefined
  public pgConnectionConfig: DsnOrClientConfig
  public _db: pg.Client | null = null
  public isOpen: boolean = false
  constructor (config: PgSubscriberConfig) {
    super()
    this.channels = config.channels || []
    if (config.dbConnectRetryOptions) {
      this.dbConnectRetryOptions = config.dbConnectRetryOptions
    }
    this.pgConnectionConfig =
      config.pgConnectionConfig || process.env.DATABASE_URL!
    this.setMaxListeners(0)

    this._processNotification = this._processNotification.bind(this)
  }

  async addChannel (channel: string, callback?: (...args: any[]) => any) {
    if (this.channels.indexOf(channel) === -1) {
      this.channels.push(channel)
      const db = await this.db()
      await db.query(`listen "${channel}"`)
    }
    if (callback) this.on(channel, callback)
  }

  async db () {
    if (this._db) return this._db
    const db = await retry(async rt => {
      const db = new pg.Client(this.pgConnectionConfig)
      try {
        await db.connect()
        this.isOpen = true
      } catch (err) {
        return rt(err)
      }
      return db
    }, this.dbConnectRetryOptions)
    this._db = db
    db.on('notification', this._processNotification)
    await Promise.all(
      this.channels.map(channel => db.query(`listen "${channel}"`))
    )
    return db as pg.Client
  }

  _processNotification (msg: any) {
    let payload = msg.payload
    try {
      payload = JSON.parse(payload)
    } catch (err) {
      // pass. allow non JSON messages
    }
    this.emit(msg.channel, payload)
  }

  async removeChannel (channel: string, callback?: (...args: any[]) => void) {
    const pos = this.channels.indexOf(channel)
    if (pos === -1) return
    if (callback) this.removeListener(channel, callback)
    else this.removeAllListeners(channel)
    if (this.listeners(channel).length) return
    this.channels.splice(pos, 1)
    const db = await this.db()
    await db.query(`unlisten "${channel}"`)
  }

  async publish (channel: string, data: any) {
    const db = await this.db()
    await db.query(
      `notify "${channel}", ${pgFormat.literal(JSON.stringify(data))}`
    )
  }

  async close () {
    if (!this._db) return
    const db = await this.db()
    this.isOpen = false
    await db.end()
    this.removeAllListeners()
    this.channels = []
  }
}
