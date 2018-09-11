# pg-subscribe

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)



subscribe to postgres events via [postgresql notify/listen](http://www.postgresql.org/docs/10/static/sql-notify.html)

this is a fork of [pg-pub-sub](https://github.com/voxpelli/node-pg-pubsub) to address some open issues, provide 1st class typescript support, and improve the api.

## install

```sh
npm install pg-subscribe --save
```

## usage


### basic

```js
var subscriber = new PgSubscriber('postgres://username@localhost/database')
await subscriber.addChannel('channelName', function onNotify (channelPayload) {
  // Process the payload – if it was JSON that JSON has been parsed into an object for you
})
await subscriber.publish('channelName', { hello: "world" })
```

the above sends `NOTIFY channelName, '{"hello":"world"}'` to PostgreSQL, which will trigger the above listener with the parsed JSON in `channelPayload`.

### advanced

```js
var subscriber = new PgSubscriber('postgres://username@localhost/database')
await subscriber.addChannel('channelName')
// subscriber is a full EventEmitter object that sends events on channel names
subscriber.once('channelName', function (channelPayload) {
  // do great work!
})
```

## api

see the typing published typings!
