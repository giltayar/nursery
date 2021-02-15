'use strict'
const AbortController = require('abort-controller')
const {TimeoutError, timeoutTask} = require('./timeout-task')

function Nursery(tasksOrOptions = {}, options = undefined) {
  const taskArg =
    (tasksOrOptions && typeof tasksOrOptions === 'function') || tasksOrOptions.then
      ? tasksOrOptions
      : undefined
  const tasksArg = tasksOrOptions && Array.isArray(tasksOrOptions) ? tasksOrOptions : undefined
  if (!taskArg && !tasksArg && tasksOrOptions && typeof tasksOrOptions !== 'object')
    throw new Error('Nursery does not support tasks that are bare values')
  const optionsArg =
    (tasksOrOptions && !(taskArg || tasksArg) && typeof tasksOrOptions === 'object'
      ? tasksOrOptions
      : options) || {}
  const {retries = 0, execution = (f) => f(), onRetry = undefined} = optionsArg
  let closed = false

  let babyPromises = []
  let babyTaskOptions = []
  let abortController = optionsArg.abortController || new AbortController()

  let signal = abortController.signal

  const argToSendToTasks = {nurse, supervisor, abortController, signal}

  let retriesMutable = retries

  if (taskArg) {
    return (async () => {
      for (let i = 0; i < retries + 1; ++i) {
        closed = false
        nurse(taskArg)
        const [err, v] = await finalize().then(
          (v) => [undefined, v],
          (err) => [err],
        )

        if (!err) {
          return v.length === 1 ? v[0] : v
        }
        if (i === retries) throw err

        await executeOnRetry(i, err)
      }
    })()
  } else if (tasksArg) {
    return (async () => {
      const nurseryOptions = {...optionsArg, abortController, signal, retries: 0}
      for (let i = 0; i < retries + 1; ++i) {
        closed = false
        tasksArg
          .map((task) => Nursery(task, {...nurseryOptions}))
          .forEach((promise) => nurse(promise))

        const [err, v] = await finalize().then(
          (v) => [undefined, v],
          (err) => [err],
        )

        if (!err) {
          return v
        }
        if (i === retries) throw err

        await executeOnRetry(i, err)
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
              return Promise.resolve({value: argToSendToTasks})
            } else if (this.loopI >= 2 && retriesMutable > 0) {
              return finalizeGenerator().catch((err) =>
                retriesMutable-- === 0
                  ? Promise.reject(err)
                  : executeOnRetry(this.loopI - 2, err).then(() =>
                      Promise.resolve({value: argToSendToTasks}),
                    ),
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

  function run(task, {waitForIt}) {
    if (closed) {
      throw new Error('cannot use a nurse after nursery is closed')
    }
    let promise
    try {
      promise = Promise.resolve(task.then ? task : execution(() => task(argToSendToTasks)))
    } catch (err) {
      if (Nursery.CancelTask.isCancelledTaskError(err)) {
        promise = Promise.resolve(err.value)
      } else {
        promise = Promise.reject(err)
      }
    }

    const finalPromise = promise.catch((err) => {
      if (Nursery.CancelTask.isCancelledTaskError(err)) {
        return err.value
      } else {
        return Promise.reject(err)
      }
    })

    babyPromises.push(finalPromise)
    babyTaskOptions.push({waitForIt})

    return finalPromise
  }

  function nurse(task) {
    return run(task, {waitForIt: true})
  }

  function supervisor(task) {
    return run(task, {waitForIt: false})
  }

  async function executeOnRetry(i, err) {
    if (onRetry) {
      await onRetry({attempt: i + 1, remaining: retries - (i + 1), err})
    }
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
              ? new Promise((resolve) => {
                  if (signal.aborted) resolve()
                  signal.addEventListener('abort', (_) => resolve())
                })
              : p,
          ),
        ]
    const babyResults = Array()
    const promisesToBeDoneCount =
      promises.length - (forceWaiting ? 0 : babyTaskOptions.filter((o) => !o.waitForIt).length)
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
        // unknown error from the Nursery code (shouldn't happen)
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

    closed = true
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
          (v) => {
            if (babyResults[i] === undefined) {
              babyResults[i] = v
            }
            return [undefined, v, i, type]
          },
          (err) => {
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
    return finalize().then(
      () => Promise.resolve({done: true}),
      (err) => {
        closed = false
        return Promise.reject(err)
      },
    )
  }
}

Nursery.moreErrors = Symbol('Nursery.moreErrors')

Nursery.CancelTask = class extends Error {
  constructor(value, message = 'Nursery task cancelled') {
    super(message)
    this.code = 'ERR_NURSERY_TASK_CANCELLED'
    this.value = value
  }

  static isCancelledTaskError(err) {
    return typeof err === 'object' && err.code === 'ERR_NURSERY_TASK_CANCELLED'
  }
}

Nursery.TimeoutError = TimeoutError
Nursery.timeoutTask = timeoutTask

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

Nursery.constantTimeRetry = ({delta}) => () => delay(delta)

Nursery.linearTimeRetry = ({start, delta = start, max = Infinity}) => ({attempt}) =>
  delay(Math.min(start + delta * (attempt - 1), max))

Nursery.exponentialTimeRetry = ({start, factor = 1.5, max = Infinity}) => ({attempt}) =>
  delay(Math.min(start * factor ** (attempt - 1), max))

module.exports = Nursery
