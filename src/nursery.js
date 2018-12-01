'use strict'
const AbortController = require('abort-controller')

function Nursery(optionsOrTasks = {retries: 0}, options = undefined) {
  const optionsArg = !optionsOrTasks || !Array.isArray(optionsOrTasks) ? optionsOrTasks : options
  const tasksArg = optionsOrTasks && Array.isArray(optionsOrTasks) ? optionsOrTasks : undefined

  let babyPromises = []
  const abortController = new AbortController()
  const signal = abortController.signal

  const {retries} = {retries: 0, ...optionsArg}
  let retriesMutable = retries

  Object.assign(run, {abortController, signal, run})

  if (tasksArg) {
    return (async () => {
      for (let i = 0; i < retries + 1; ++i) {
        tasksArg.forEach(run)

        const [err, v] = await waitForAllPromisesEvenIfOneThrows(babyPromises).then(
          v => [undefined, v],
          err => [err],
        )

        if (!err) {
          return v
        }
        if (i === retries) throw err
      }
    })()
  }

  return {
    [Symbol.asyncIterator]() {
      return {
        loopI: 0,
        next() {
          ++this.loopI
          if (this.loopI === 1) {
            return Promise.resolve({value: run})
          } else if (this.loopI >= 2 && retriesMutable > 0) {
            return finalizeGenerator().catch(err =>
              retriesMutable-- === 0 ? Promise.reject(err) : Promise.resolve({value: run}),
            )
          } else if (this.loopI >= 2 && retriesMutable === 0) {
            return finalizeGenerator()
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

    babyPromises.push(promise)

    return promise
  }

  async function waitForAllPromisesEvenIfOneThrows(promises) {
    const mutablePromises = [...promises]
    const babyResults = Array()
    const promisesToBeDoneCount = promises.length
    let promisesDoneCount = 0
    let firstRejectedPromise
    let firstRejectedError

    while (promisesDoneCount < promisesToBeDoneCount) {
      try {
        await Promise.all(
          mutablePromises.map((p, i) =>
            p.then(
              v => {
                babyResults[i] = v
                return [undefined, v, i]
              },
              err => {
                babyResults[i] = undefined
                return Promise.reject([err, undefined, i])
              },
            ),
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

    return babyResults
  }

  async function finalize() {
    return waitForAllPromisesEvenIfOneThrows(babyPromises).finally(() => {
      babyPromises = []
    })
  }

  async function finalizeGenerator() {
    return finalize().then(() => Promise.resolve({done: true}))
  }
}

Nursery.moreErrors = Symbol('Nursery.moreErrors')

module.exports = Nursery
