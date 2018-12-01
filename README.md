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
  for await (const nursery of Nursery()) {
    nursery(delay(20).then(() => console.log('second')))
    nursery(delay(10).then(() => console.log('first')))
  }
})()
// ==> first
// ==> second
```

The syntax is strange. There's a `for await` loop, and a body that runs two tasks using `nursery.run`.
Don't worry, the `for await` loop will execute only once
(we'll see later that it can execute more if we want, for retries).
The tasks will run concurrently, but the `for await` loop (along with `Nursery` magic, will ensure that the code
will wait till both tasks have run.

Note: tasks in `Nursery` are either promises of already running tasks,
or functions that returns promises that the nursey will execute to get the promsie.

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

> A Nursery will wait for all tasks to terminate, **even if one of the tasks fails**.

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
for the delay task to end. Thus, the catch will happen first and output `after Promise.all failed!`, and then
**sometime in the future, wihout us having any control about it**, the other task will end.

What happened if the other task failed? Can we do anything about it? Nope. It silently fails. We lost control over it.

And this is bad. Why this is bad intuitively makes sense, but the blog post
[Notes on structured concurrency, or: Go statement considered harmful](https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/)
makes a pretty good case on why this is so.

Let's contrast this with the same implementation of the code, using nurseries:

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

This code works as we "expect" it too. The nursery (the `for await` loop) will not finish until all nursery-run
promises finish, even if one of the tasks fail. We will still get the error, but all the tasks will end their run.

Note: what happens if more than one task fails? Look it up in the API, this is handled well.

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

The nursery will wait for the `fetchSkywalker` task to terminate, and thus it will output `172` before failing. How
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
and when one of the tasks fail, it will call `AbortController.abort()` to signal to the other tasks to abort.

The `AbortController` and it's accompanying `AbortSignal` are stored in the nursery as
`abortController` and `signal` respectively. We pass the `signal` to the Fetch API to tell it when to abort. This
is how the `fetch` knows how to abort the task once of the other tasks fail.

> I chose `AbortController` as the cancellation API as there is currently no other standard API that enables
> task cancellation. If JavaScript in the future standardizes on another standard, I will add this one too.

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

When an abort happens, the `nursery.signal` will be `true`, enabling us to check the flag and abort whenever we want to.
We can also use `nursery.signal.onabort` to register an abort handler if we want to.

> For more information on `AbortController`,
> see [this](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).
> For more information on the Fetch API use of `AbortController`,
> see [this](https://developer.mozilla.org/en-US/docs/Web/API/AbortController#Examples).

### Retrying

TBD

## API

TBD

## Contributing

* Contributions are welcome! PRs are welcome!
* To build the code, use `npm run build` (currently runs nothing).
* To test the code, use `npm test`, which will both run the tests under the `test` folder, and run eslint
* This code uses [prettier](https://github.com/prettier/prettier) and `npm test` verifies that.
