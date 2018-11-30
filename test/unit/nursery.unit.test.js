'use strict'
const {promisify: p} = require('util')
const {describe, it} = require('mocha')
const {expect} = require('chai')

const Nursery = require('../..')

describe('nursery', function() {
  it('should wait for spawned promises', async () => {
    let firstDone = false
    let secondDone = false
    let runTimes = 0

    for await (const nursery of Nursery()) {
      ++runTimes
      nursery.run(() => p(setTimeout)(10).then(() => (firstDone = true)))
      nursery.run(() => p(setTimeout)(20).then(() => (secondDone = true)))
    }

    expect(firstDone).to.be.true
    expect(secondDone).to.be.true
    expect(runTimes).to.equal(1)
  })

  it('should finish even if no running tasks', async () => {
    let firstDone = false

    for await (const _ of Nursery()) {
      firstDone = true
    }

    expect(firstDone).to.be.true
  })

  it('should wait for spawned promises even on break', async () => {
    let firstDone = false
    let secondDone = false
    let thirdDone = false

    for await (const nursery of Nursery()) {
      nursery.run(() => p(setTimeout)(10).then(() => (firstDone = true)))
      nursery.run(() => p(setTimeout)(20).then(() => (secondDone = true)))
      if (Math.floor(Math.PI) === 3) break // the `if` is to that static analyzers dont bothers me with unreachable code

      nursery.run(() => p(setTimeout)(10).then(() => (thirdDone = true)))

      expect(firstDone).to.be.true
      expect(secondDone).to.be.true
      expect(thirdDone).to.be.true
    }
  })
})
