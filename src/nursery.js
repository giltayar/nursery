'use strict'
const AbortController = require('abort-controller')

function Nursery({retries = 0} = {}) {
  let babyPromises = []
  const abortController = new AbortController()
  const signal = abortController.signal

  Object.assign(run, {abortController, signal, run})

  return {
    [Symbol.asyncIterator]() {
      return {
        loopI: 0,
        next() {
          ++this.loopI
          if (this.loopI === 1) {
            return Promise.resolve({value: run})
          } else if (this.loopI >= 2 && retries > 0) {
            return finalize().catch(err =>
              retries-- === 0 ? Promise.reject(err) : Promise.resolve({value: run}),
            )
          } else if (this.loopI >= 2 && retries === 0) {
            return finalize()
          }
        },
        return() {
          return finalize()
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

  async function finalize() {
    return waitForAllPromisesEvenIfOneThrows(babyPromises)
      .then(() => Promise.resolve({done: true}))
      .finally(() => (babyPromises = []))
  }
}

Nursery.moreErrors = Symbol('Nursery.moreErrors')

module.exports = Nursery
