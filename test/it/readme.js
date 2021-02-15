'use strict'
const Nursery = require('../..')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function main() {
  await (async function () {
    await Nursery([
      delay(20).then(() => console.log('second')),
      delay(10).then(() => console.log('first')),
    ])
  })()
  // ==> first
  // ==> second

  await (async function () {
    await Promise.all([
      delay(20).then(() => console.log('second')),
      delay(10).then(() => console.log('first')),
    ])
  })()
  // ==> first
  // ==> second

  await (async function () {
    try {
      await Promise.all([
        Promise.reject(new Error('failed!')),
        delay(10).then(() => console.log('first')),
      ])
    } catch (err) {
      console.log('after Promise.all', err.message)
    }
  })()
  // ==> after Promise.all failed!
  // ==> first

  await delay(20) // this await is to wait for the rogue task. Should not be in the readme

  await (async function () {
    try {
      await Nursery([
        Promise.reject(new Error('failed!')),
        delay(10).then(() => console.log('first')),
      ])
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> first
  // ==> after Nursery failed!

  await (async function () {
    try {
      for await (const {nurse} of Nursery()) {
        nurse(Promise.reject(new Error('failed!')))
        nurse(delay(10).then(() => console.log('first')))
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> first
  // ==> after Nursery failed!

  await (async function () {
    try {
      for await (const {nurse} of Nursery()) {
        nurse(() => Promise.reject(new Error('failed!')))
        nurse(() => delay(10).then(() => console.log('first')))
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()

  const fetch = require('node-fetch')

  async function fetchSkywalkerHeight(fetchOptions) {
    const response = await fetch('https://swapi.dev/api/people/1/', fetchOptions)

    const skywalkerInfo = await response.json()
    return skywalkerInfo.height
  }

  await (async function () {
    console.log(await fetchSkywalkerHeight())
  })()
  // ==> 172

  await (async function () {
    try {
      for await (const {nurse} of Nursery()) {
        nurse(Promise.reject(new Error('failed!')))
        nurse(fetchSkywalkerHeight().then((height) => console.log(height)))
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> 172
  // ==> after Nursery failed!

  await (async function () {
    try {
      for await (const {nurse, signal} of Nursery()) {
        nurse(Promise.reject(new Error('failed!')))
        nurse(fetchSkywalkerHeight({signal}).then((height) => console.log(height)))
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> after Nursery failed!

  await (async function () {
    try {
      for await (const {nurse, signal} of Nursery()) {
        nurse(Promise.reject(new Error('failed!')))
        nurse(
          delay(10).then((_) =>
            !signal.aborted ? console.log('not aborted') : console.log('aborted'),
          ),
        )
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> aborted
  // ==> after Nursery failed!

  await (async function () {
    try {
      for await (const {nurse, supervisor, signal} of Nursery()) {
        supervisor(Nursery.timeoutTask(5))
        nurse(fetchSkywalkerHeight({signal}).then((height) => console.log(height)))
      }
    } catch (err) {
      if (err instanceof Nursery.TimeoutError) {
        console.log('Timed out!')
      }
    }
  })()
  // ==> Timed out!

  for await (const {nurse} of Nursery()) {
    nurse(delay(10).then(() => console.log('done')))
    nurse(delay(20).then(() => console.log('done')))
  }
  // ==> done
  // ==> done

  console.log(await Nursery([delay(10).then(() => 4), delay(20).then(() => 2)]))
  // ==> [4, 2]

  console.log(await Nursery(delay(10).then(() => 4)))
  // ==> 4

  console.log(
    await Nursery(({nurse}) => {
      nurse(delay(20).then((_) => 'run1'))
      nurse(delay(10).then((_) => 'run2'))
      return 'done'
    }),
  )
  // ==> [ 'run1', 'run2', 'done' ]

  for await (const {nurse} of Nursery()) {
    nurse(delay(10).then(() => console.log('done')))
    nurse(delay(20).then(() => console.log('done')))
  }
  // ==> done
  // ==> done

  let rejectionCount = 0

  for await (const {nurse} of Nursery({retries: 1})) {
    nurse(() => (rejectionCount++ === 0 ? Promise.reject(new Error()) : Promise.resolve(1)))
    nurse(delay(20).then(() => console.log('done')))
  }
  // ==> done
  // ==> done

  try {
    for await (const {nurse, signal} of Nursery()) {
      nurse(Promise.reject(new Error('failed!')))
      nurse(
        delay(10).then((_) =>
          !signal.aborted ? console.log('not aborted') : console.log('aborted'),
        ),
      )
    }
  } catch (err) {
    console.log('after Nursery', err.message)
  }
  // ==> aborted
  // ==> after Nursery failed

  for await (const {nurse, signal, abortController} of Nursery()) {
    nurse(delay(10).then(() => abortController.abort()))
    nurse(
      delay(10).then((_) =>
        !signal.aborted ? console.log('not aborted') : console.log('aborted'),
      ),
    )
  }
  // ==> aborted

  try {
    for await (const {nurse} of Nursery()) {
      nurse(Promise.reject(new Error('first error')))
      nurse(delay(10).then((_) => Promise.reject(new Error('second error'))))
    }
  } catch (err) {
    console.log(err.message)
    console.log(err[Nursery.moreErrors][0].message)
  }
  // ==> first error
  // ==> second error

  function log(f) {
    console.log('executing task')

    return f()
  }

  for await (const {nurse} of Nursery({execution: log})) {
    nurse(() => delay(10).then((_) => console.log(1)))
    nurse(() => delay(20).then((_) => console.log(2)))
  }
  // ==> executing task
  // ==> executing task
  // ==> 1
  // ==> 2

  const throat = require('throat')

  // `throat(1)` ensures sequential execution
  for await (const {nurse} of Nursery({execution: throat(1)})) {
    nurse(() => delay(20).then((_) => console.log(1)))
    nurse(() => delay(10).then((_) => console.log(2)))
    nurse(() => delay(5).then((_) => console.log(3)))
    nurse(() => delay(30).then((_) => console.log(4)))
  }

  // => 1
  // => 2
  // => 3
  // => 4

  try {
    const [, skyWalkerHeight] = await Nursery(({nurse, supervisor, signal}) => {
      supervisor(Nursery.timeoutTask(5, {name: 'fetchSkywalkerHeight'}))

      nurse(fetchSkywalkerHeight({signal}))
    })

    console.log(skyWalkerHeight)
  } catch (err) {
    if (err.code === 'ERR_NURSERY_TIMEOUT_ERR') {
      console.log(err.message)
    }
  }
  // ==> Timeout of 5ms occured for task fetchSkywalkerHeight

  const [res1, res2] = await Nursery([
    () => {
      // ...
      throw new Nursery.CancelTask(42)
    },
    () => Promise.resolve(43),
  ])
  console.log(res1)
  console.log(res2)

  // ==> 42
  // ==> 43
}

module.exports = main().catch(console.log)
