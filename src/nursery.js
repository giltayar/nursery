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
            return waitForAllPromisesEvenIfOneThrows(babyPromises).then(() =>
              Promise.resolve({done: true}),
            )
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

  async function waitForAllPromisesEvenIfOneThrows(promises) {
    const mutablePromises = [...promises]
    const promisesToBeDoneCount = promises.length
    let promisesDoneCount = 0
    let firstRejectedPromise
    let firstRejectedError

    while (promisesDoneCount < promisesToBeDoneCount) {
      try {
        await Promise.all(
          mutablePromises.map((p, i) =>
            p.then(v => [undefined, v, i], err => Promise.reject([err, undefined, i])),
          ),
        )
        promisesDoneCount += mutablePromises.length
      } catch (errOrErrArray) {
        promisesDoneCount += 1
        if (!Array.isArray(errOrErrArray)) throw errOrErrArray

        const [err, , i] = errOrErrArray

        if (!firstRejectedPromise) {
          firstRejectedPromise = mutablePromises[i]
          firstRejectedError = err
          firstRejectedError[Nursery.moreErrors] = []
          abortController.abort()
        } else {
          firstRejectedError[Nursery.moreErrors].push(err)
        }

        mutablePromises.splice(i, 1)
      }
    }
    if (firstRejectedPromise) return firstRejectedPromise
  }

  function run(asyncFunc) {
    const promise = Promise.resolve().then(() =>
      asyncFunc.then ? asyncFunc : asyncFunc({abortController, signal}),
    )

    babyPromises = babyPromises.concat(promise)

    return promise
  }
}

Nursery.moreErrors = Symbol('Nursery.moreErrors')

module.exports = Nursery
