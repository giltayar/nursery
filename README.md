# nursery

Package implementing concurrency primitive inspired by the blog post
[Notes on structured concurrency, or: Go statement considered harmful](https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/)

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

## Installing

```sh
npm install nursery-rhymes
```

This package requires Node v8 and above, and has only one dependency: `abort-controller` which is used as a polyfill
for the standard `AbortController` class used to signal cancellation in the `fetch` API.

## Using the package

The package enables you to group a number of running async tasks into one, and to ensure that they all
finish together. Let's see an example:

### Running Multiple Tasks Together

```js
const Nursery = require('nursery-rhymes')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

;(async function() {
  await Nursery([
    delay(20).then(() => console.log('second')),
    delay(10).then(() => console.log('first'))
  ])
  }
})()
// ==> first
// ==> second
```

How is this different from the following using `Promise.all`?

```js
;(async function() {
  await Promise.all([
    delay(20).then(() => console.log('second')),
    delay(10).then(() => console.log('first')),
  ])
})()
// ==> first
// ==> second
```

It isn't! Same. But!

### Handling Task Faillures

But `Promise.all` is dumb. It doesn't include the following guarantee:

> A Nursery waits for all tasks to terminate, **even if one of the tasks fails**.

Let's look at this example:

```js
;(async function() {
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
```

In the above example, due to the failure of the first task, the Promise.all exits immediately, without waiting
for the delay task to end. Thus, the catch happens first and output `after Promise.all failed!`, and then
**sometime in the future, wihout us having any control about it**, the other task ends.

What happened if the other task failed? Can we do anything about it? Nope. It silently fails. We lost control over it.

And this is bad. Why this is bad intuitively makes sense, but the blog post
[Notes on structured concurrency, or: Go statement considered harmful](https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/)
makes a pretty good case on why this is so.

Let's contrast this with the same implementation of the code, using nurseries:

```js
;(async function() {
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
```

This code works as we "expect" it too. The nursery (the `for await` loop) does not finish until all nursery-run
promises finish, even if one of the tasks fail. We still get the error, but all the tasks end their run.

Note: what happens if _more_ than one task fails? Look it up in the API, this is handled well. TL;DR: the exception
thrown includes a field that has all the other errors in an array.

Let's look at another way of writing this in Nursery:

```js
;(async function() {
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
```

The syntax is strange. There's a `for await` loop, and a body that runs two tasks using `nursery.run`.
Don't worry, the `for await` loop executes only once
(we'll see later that it can execute more if we want, for retries).
The tasks run concurrently, but the `for await` loop (along with `Nursery` magic), ensures that the code
wait till both tasks have run.

Note: tasks in `Nursery` are either promises of already running tasks,
or functions that returns promises that the nursey executes to get the promise. For example, the above
code can be written, but instead of passing promises directly, we pass async functions:

```js
;(async function() {
  try {
    for await (const nursery of Nursery()) {
      nursery(() => Promise.reject(new Error('failed!')))
      nursery(() => delay(10).then(() => console.log('first')))
    }
  } catch (err) {
    console.log('after Nursery', err.message)
  }
})()
// ==> first
// ==> after Nursery failed!
```

### Cancelling a Task

But what if I want to cancel a task if another task fails? I still want to wait till that cancellation is done,
but I want to cancel it. Let's take a "real" task, which uses the [Star Wars API](https://swapi.co/) to get the
height of Luke Skywalker:

```js
const fetch = require('node-fetch')

async function fetchSkywalkerHeight(fetchOptions) {
  const response = await fetch('https://swapi.co/api/people/1/', fetchOptions)

  const skywalkerInfo = await response.json()
  return skywalkerInfo.height
}

;(async function() {
  console.log(await fetchSkywalkerHeight())
})()
// ==> 172
```

Note: we'll use the `fetchOptions` later, when cancelling this task.

Now let's use this task in a nursery with another failed task:

```js
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
```

The nursery waits for the `fetchSkywalker` task to terminate, and thus it outputs `172` before failing. How
can we abort that fetch? We send the `fetch` an abort signal (this is part of the Fetch API):

```js
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
```

In this snippet, the "172" was never output, because the `fetchSkywalkerHeight` was cancelled. How? The nursery
always creates an `AbortController` (with it's accompanying `AbortSignal`) when initializing,
and when one of the tasks fails, it calls `AbortController.abort()` to signal to the other tasks to abort.

The `AbortController` and it's accompanying `AbortSignal` are stored in the nursery as
`abortController` and `signal` respectively. We pass the `signal` to the Fetch API to tell it when to abort. This
is how the `fetch` knows how to abort the task once of the other tasks fail.

> I chose `AbortController` as the cancellation API as there is currently no other standard API that enables
> task cancellation. If JavaScript in the future standardizes on another standard, I'll add this one too.

You can use the `AbortSignal` to enable your own cancellation mechanism. Let's see an example:

```js
;(async function() {
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
````

When an abort happens, the `nursery.signal` is `true`, enabling us to check the flag and abort whenever we want to.
We can also use `nursery.signal.onabort` to register an abort handler if we want to.

> For more information on `AbortController`,
> see [this](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).
> For more information on the Fetch API use of `AbortController`,
> see [this](https://developer.mozilla.org/en-US/docs/Web/API/AbortController#Examples).

### Retrying

TBD

## API

```js
const Nursery = require('nursery-rhymes')
```

The only export is `Nursery`, a function that if called with a set of "tasks", returns a promise, thus:

```js
await Nursery([...listOfPromisesOrFunctionsReturningPromises]))
```

> A task is either a `Promise` (e.g. `Promise.resolve(42)` or `funcReturningPromise()`) or
> a function returning a `Promise` (e.g. `() => Promise.resolve(42)` or `funcReturningPromise`).
> A function returning a `Promise` is sometimes referred to as an **async** function.

If no tasks are passed, calling `Nursery` returns a
[generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators) of nurseries,
destined to be used in a
[`for await` loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of), thus:

```js
for await (const nursery of Nursery()) {
  // body using the `nursery`
}
```

Unless there are retries (see below on how to ask for retries), the body of the loop will run only 1 time.

## Nursery function

* `Nursery([taskList: Array<Promise|Function>], [options: object])`

This function call returns a `Promise` if called with tasks,
or returns an **async** generator of `nursery` objects (of type `Nursery`) if not.
This generator is commonly used in `for await` loops.

* `taskList`: optional array of tasks. A task is either a `Promise` or a function returning a `Promise`.
* `options`: [optional] object with the following properties:
  * `retries`: the number of retries to run the loop body in case of failures. Default: 0

* Returns:
  * If no `taskLists`: an **async** generator commonly used in `for await` loops.
    Example (definition of `delay` can be found above):

    ```js
    for await (const nursery of Nursery()) {
      nursery(delay(10).then(() => console.log('done')))
      nursery(delay(20).then(() => console.log('done')))
    }
    ```
    In this example, the `for await` loop will wait until the two delays are done.

  * If `taskList`: a Promise that is almost exactly what `Promise.all` returns. Example:

    ```js
    await Nursery([
      nursery(delay(10).then(() => console.log('done')))
      nursery(delay(20).then(() => console.log('done')))
    }])
    ```
    In this example, the Nursery call will wait until the two delays are done.

Example with retries:

```js
let rejectionCount = 0

for await (const nursery of Nursery({retries: 1})) {
  nursery(() => rejectionCount++ ===  0 ? Promise.reject(new Error()) : Promise.resolve(1))
  nursery(delay(20).then(() => console.log('done')))
}
```

In the above example, `done` will be output twice because in the first run, the first task fails, and thus the whole
body retries.

### nursery object

The object generated by the Nursery generator above. In the following example, `nursery` is a nursery object:

```js
for await (const nursery of Nursery()) {
  nursery.run(delay(10).then(() => console.log('done')))
  nursery.run(delay(20).then(() => console.log('done')))
}
```

A nursery object is a function. When called it will run the task given to it.

* `nursery(task: Promise | function)`:
  If the task is a `Promise`, it will wait for promise resolution or cancelation. If it is a `function`,
  it will call the function, and wait on the `Promise` returned by it.
  If the function is synchronous and does not return a promise,
  it will transform the sync value (or exception) into a promise automatically.

  If the task is a function, it will be called, and passed itself (the nursery object).

  The `Nursery` generator (or `Nursery` function call) ensures that **all** tasks that
  ran in the body of the `for await` loop
  (or were given to the `Nursery` function)
  terminate by waiting for them.

  The function call returns the `Promise` (either the one given to it, or the one returned by the function). You _can_, but
  don't have to `await` on the task (because the Nursery generator will wait for it when it is closed by the `for await` loop).

The nursery function also has these additional properties:

* `run(task: Promise | function)`: exactly the same as calling the nursery object directly.
* `signal`: an `AbortSignal` (see [here](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)) to enable
  the tasks running in the nursery to detect when the nursery is aborted. In the example below, the second task
  detects that the nursery was aborted using `AbortSignal.aborted` in `nursery.signal.aborted ? ... : ...`:

  ```js
  for await (const nursery of Nursery()) {
    nursery(Promise.reject(new Error('failed!')))
    nursery(
      delay(10).then(_ =>
        !nursery.signal.aborted ? console.log('not aborted') : console.log('aborted'),
      ),
    )
  }
  // ==> aborted
  // ==> after Nursery failed
  ```

* `abortController`: the `AbortController` (see [here](https://developer.mozilla.org/en-US/docs/Web/API/AbortController))
  that can be used to abort the nursery, using `nusery.abortController.abort()`. This will abort the nursery without
  the need to fail a task. Example:

```js
for await (const nursery of Nursery()) {
  nursery(delay(10).then(() => nursery.abortController.abort()))
  nursery(
    delay(10).then(_ =>
      !nursery.signal.aborted ? console.log('not aborted') : console.log('aborted'),
    ),
  )
}
// ==> aborted
```

## Closing the Nursery Generator

The nursery will close itself after at least 1 generation of a nursery object
(see "retries" below for when it is more).

Closing a generator will do the following:

* Wait for all Promises to be either resolved or rejected.
* If all promises are resolved, then all is good.
* If only one promise is rejected, it will throw/reject that promise (after waiting as described above).
* If more than one promise is rejected, it will throw/reject the first promise that was rejected, but will append
  all other errors to it as a property of that error, in the field designated by the `Symbol` key `Nursery.moreErrors`.
  Example:

```js
try {
  for await (const nursery of Nursery()) {
    nursery(Promise.reject(new Error('first error')))
    nursery(delay(10).then(_ => Promise.reject(new Error('second error'))))
  }
} catch (err) {
  console.log(err.message)
  console.log(err[Nursery.moreErrors][0].message)
}
// ==> first error
// ==> second error
```

## Contributing

* Contributions are welcome! PRs are welcome!
* To build the code, use `npm run build` (currently runs nothing).
* To test the code, use `npm test`, which will both run the tests under the `test` folder, and run eslint
* This code uses [prettier](https://github.com/prettier/prettier) and `npm test` verifies that.
