'use strict'
const Nursery = require('../..')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function main() {
  await (async function() {
    for await (const nursery of Nursery()) {
      nursery(delay(20).then(() => console.log('second')))
      nursery(delay(10).then(() => console.log('first')))
    }
  })()
  // ==> first
  // ==> second

  await (async function() {
    await Promise.all([
      delay(20).then(() => console.log('second')),
      delay(10).then(() => console.log('first')),
    ])
  })()
  // ==> first
  // ==> second

  await (async function() {
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

  await (async function() {
    try {
      for await (const nursery of Nursery()) {
        nursery(Promise.reject(new Error('failed!')))
        nursery(delay(10).then(() => console.log('first')))
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> first
  // ==> after Nursery failed!

  const fetch = require('node-fetch')

  async function fetchSkywalkerHeight(fetchOptions) {
    const response = await fetch('https://swapi.co/api/people/1/', fetchOptions)

    const skywalkerInfo = await response.json()
    return skywalkerInfo.height
  }

  await (async function() {
    console.log(await fetchSkywalkerHeight())
  })()
  // ==> 172

  await (async function() {
    try {
      for await (const nursery of Nursery()) {
        nursery(Promise.reject(new Error('failed!')))
        nursery(fetchSkywalkerHeight().then(height => console.log(height)))
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> 172
  // ==> after Nursery failed!

  await (async function() {
    try {
      for await (const nursery of Nursery()) {
        nursery(Promise.reject(new Error('failed!')))
        nursery(fetchSkywalkerHeight({signal: nursery.signal}).then(height => console.log(height)))
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> after Nursery failed!

  await (async function() {
    try {
      for await (const nursery of Nursery()) {
        nursery(Promise.reject(new Error('failed!')))
        nursery(
          delay(10).then(_ =>
            !nursery.signal.aborted ? console.log('not aborted') : console.log('aborted'),
          ),
        )
      }
    } catch (err) {
      console.log('after Nursery', err.message)
    }
  })()
  // ==> aborted
  // ==> after Nursery failed!
}

module.exports = main().catch(console.log)
