'use strict'
const AbortController = require('abort-controller')
const {TimeoutError, timeoutTask} = require('./timeout-task')

function Nursery(tasksOrOptions = {retries: 0}, options = undefined) {
  const taskArg =
    (tasksOrOptions && typeof tasksOrOptions === 'function') || tasksOrOptions.then
      ? tasksOrOptions
      : undefined
  const tasksArg = tasksOrOptions && Array.isArray(tasksOrOptions) ? tasksOrOptions : undefined
  const optionsArg = (tasksOrOptions && !(taskArg || tasksArg) ? tasksOrOptions : options) || {}
  const {retries = 0, execution = f => f()} = optionsArg

  let babyPromises = []
  let babyTaskOptions = []
  let abortController = optionsArg.abortController || new AbortController()
  let signal = abortController.signal
  Object.assign(nurse, {abortController, signal, run: nurse, supervisor})

  let retriesMutable = retries

  if (taskArg) {
    return (async () => {
      for (let i = 0; i < retries + 1; ++i) {
        nurse(taskArg)
        const [err, v] = await finalize().then(v => [undefined, v], err => [err])

        if (!err) {
          return v[0]
        }
        if (i === retries) throw err
      }
    })()
  } else if (tasksArg) {
    return (async () => {
      const nurseryOptions = {...optionsArg, abortController, signal, retries: 0}
      for (let i = 0; i < retries + 1; ++i) {
        tasksArg.map(task => Nursery(task, {...nurseryOptions})).forEach(promise => nurse(promise))

        const [err, v] = await finalize().then(v => [undefined, v], err => [err])

        if (!err) {
          return v
        }
        if (i === retries) throw err
      }
    })()
  } else {
    return {
      [Symbol.asyncIterator]() {
        return {
          loopI: 0,
          next() {
            ++this.loopI
            if (this.loopI === 1) {
              return Promise.resolve({value: nurse})
            } else if (this.loopI >= 2 && retriesMutable > 0) {
              return finalizeGenerator().catch(err =>
                retriesMutable-- === 0 ? Promise.reject(err) : Promise.resolve({value: nurse}),
              )
            } else if (this.loopI >= 2 && retriesMutable === 0) {
              return finalizeGenerator()
            }
          },
          return() {
            return finalizeGenerator()
          },
        }
      },
    }
  }

  function run(asyncFunc, {waitForIt}) {
    const promise = Promise.resolve()
      .then(() => (asyncFunc.then ? asyncFunc : execution(() => asyncFunc(nurse))))
      .then(
        v => {
          return v
        },
        err => {
          return Promise.reject(err)
        },
      )

    babyPromises.push(promise)
    babyTaskOptions.push({waitForIt})

    return promise
  }

  function nurse(asyncFunc) {
    return run(asyncFunc, {waitForIt: true})
  }

  function supervisor(asyncFunc) {
    return run(asyncFunc, {waitForIt: false})
  }

  async function waitForAllPromisesEvenIfOneThrows(promises, {forceWaiting = false} = {}) {
    const mutableWaitPromises = [
      ...promises.map((p, i) =>
        babyTaskOptions[i].waitForIt || forceWaiting ? p : Promise.resolve(undefined),
      ),
    ]
    const mutableDontWaitPromises = forceWaiting
      ? []
      : [
          ...promises.map((p, i) =>
            babyTaskOptions[i].waitForIt
              ? new Promise(resolve => {
                  if (signal.aborted) resolve()
                  signal.addEventListener('abort', _ => resolve())
                })
              : p,
          ),
        ]
    const babyResults = Array()
    const promisesToBeDoneCount =
      promises.length - (forceWaiting ? 0 : babyTaskOptions.filter(o => !o.waitForIt).length)
    let promisesDoneCount = 0
    let firstRejectedPromise
    let firstRejectedError

    while (promisesDoneCount < promisesToBeDoneCount) {
      try {
        const result = await Promise.race(
          storeResults(mutableDontWaitPromises, 'dont-wait').concat(
            Promise.all(storeResults(mutableWaitPromises, 'wait')),
          ),
        )
        if (result[3] === 'dont-wait') {
          const [, , i] = result
          mutableDontWaitPromises.splice(i, 1)
        } else {
          promisesDoneCount += mutableWaitPromises.length
        }
      } catch (errOrErrArray) {
        if (!Array.isArray(errOrErrArray)) throw errOrErrArray

        const [err, , i, type] = errOrErrArray

        promisesDoneCount += type === 'wait' ? 1 : 0

        if (!firstRejectedPromise) {
          firstRejectedPromise =
            type === 'wait' ? mutableWaitPromises[i] : mutableDontWaitPromises[i]
          firstRejectedError = err
          if (typeof firstRejectedError === 'object') {
            firstRejectedError[Nursery.moreErrors] = []
          }
          abortController.abort()
        } else {
          if (typeof firstRejectedError === 'object') {
            firstRejectedError[Nursery.moreErrors].push(err)
          }
        }

        if (type === 'wait') {
          mutableWaitPromises.splice(i, 1)
        } else {
          mutableDontWaitPromises.splice(i, 1)
        }
      }
    }

    if (mutableDontWaitPromises.length > 0) {
      // abort non-waitForIt tasks, and then wait for them!
      abortController.abort()

      await waitForAllPromisesEvenIfOneThrows(mutableDontWaitPromises, {forceWaiting: true})
    }
    if (firstRejectedPromise) {
      return firstRejectedPromise
    } else {
      return babyResults
    }

    function storeResults(promiseArray, type) {
      return promiseArray.map((p, i) =>
        p.then(
          v => {
            if (babyResults[i] === undefined) {
              babyResults[i] = v
            }
            return [undefined, v, i, type]
          },
          err => {
            babyResults[i] = undefined
            return Promise.reject([err, undefined, i, type])
          },
        ),
      )
    }
  }

  async function finalize() {
    return waitForAllPromisesEvenIfOneThrows(babyPromises).finally(() => {
      babyPromises = []
      babyTaskOptions = []

      abortController = new AbortController()
      signal = abortController.signal
      Object.assign(nurse, {abortController, signal, run: nurse})
    })
  }

  async function finalizeGenerator() {
    return finalize().then(() => Promise.resolve({done: true}))
  }
}

Nursery.moreErrors = Symbol('Nursery.moreErrors')

Nursery.TimeoutError = TimeoutError
Nursery.timeoutTask = timeoutTask

module.exports = Nursery
