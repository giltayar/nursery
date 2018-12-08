class TimeoutError extends Error {
  constructor(ms, name) {
    super(`Timeout of ${ms}ms occured for task ${name ? name : '<unknown-task>'}`)
    this.ms = ms
    this.name = name
    this.code = 'ERR_NURSERY_TIMEOUT_ERR'
  }
}

const timeoutTask = (ms, {name = undefined} = {}) => ({signal}) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) resolve()

    const timer = setTimeout(() => {
      reject(new TimeoutError(ms, name))
    }, ms)

    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

module.exports = {TimeoutError, timeoutTask}
