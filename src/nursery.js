'use strict'
const AbortController = require('abort-controller')

function Nursery() {
  let babyPromises = []
  const abortController = new AbortController()
  const signal = abortController.signal
  let loopI = 0

  Object.assign(run, {abortController, signal, run})

  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          ++loopI
          if (loopI === 1) {
            return Promise.resolve({value: run})
          } else if (loopI === 2) {
            return Promise.all(babyPromises).then(() => Promise.resolve({done: true}))
          }
        },
        return() {
          return Promise.all(babyPromises)
        },
        throw() {
          return abortController.abort()
        },
      }
    },
  }

  function run(asyncFunc) {
    const promise = Promise.resolve().then(() =>
      asyncFunc.then ? asyncFunc : asyncFunc({abortController, signal}),
    )

    babyPromises = babyPromises.concat(promise)

    return promise
  }
}

module.exports = Nursery
