'use strict'
const {promisify: p} = require('util')
const {describe = global.describe, it = global.it} = require('mocha')
const chai = require('chai')
const {expect} = chai
chai.use(require('chai-as-promised'))

const Nursery = require('../..')

describe('nursery', function() {
  describe('run', () => {
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
      }

      expect(firstDone).to.be.true
      expect(secondDone).to.be.true
      expect(thirdDone).to.be.false
    })

    it('should support function call syntax', async () => {
      let firstDone = false

      for await (const n of Nursery()) n(() => p(setTimeout)(10).then(() => (firstDone = true)))

      expect(firstDone).to.be.true
    })

    it('should support receiving a promise', async () => {
      let firstDone = false

      for await (const n of Nursery()) n(p(setTimeout)(10).then(() => (firstDone = true)))

      expect(firstDone).to.be.true
    })

    it('should return the promise it ran', async () => {
      let firstDone = false

      for await (const n of Nursery()) {
        await n(p(setTimeout)(10).then(() => (firstDone = true)))
        expect(firstDone).to.be.true
      }
    })
  })

  describe('errors', () => {
    it('for should throw exception if one of the promises does', async () => {
      await expect(
        (async () => {
          for await (const nursery of Nursery()) {
            nursery(Promise.resolve(4))
            nursery(p(setTimeout)(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })(),
      ).to.eventually.be.rejectedWith('rejected!')
    })

    it('should wait for other tasks before throwing exception', async () => {
      let firstDone = false
      await expect(
        (async () => {
          for await (const nursery of Nursery()) {
            nursery(p(setTimeout)(20).then(_ => (firstDone = true)))
            nursery(p(setTimeout)(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })(),
      ).to.eventually.be.rejectedWith('rejected!')

      expect(firstDone).to.be.true
    })

    it('should wait for other (rejected) tasks before throwing exception', async () => {
      let firstDone = false
      await expect(
        (async () => {
          for await (const nursery of Nursery()) {
            nursery(p(setTimeout)(30).then(_ => Promise.reject(new Error('rejected again'))))
            nursery(p(setTimeout)(20).then(_ => (firstDone = true)))
            nursery(p(setTimeout)(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })().then(),
      ).to.eventually.be.rejectedWith('rejected!')

      expect(firstDone).to.be.true
    })

    it('should support multiple rejections using Nursery.moreErrors', async () => {
      let firstDone = false
      await expect(
        await (async () => {
          for await (const nursery of Nursery()) {
            nursery(p(setTimeout)(30).then(_ => Promise.reject(new Error('rejected again'))))
            nursery(p(setTimeout)(20).then(_ => (firstDone = true)))
            nursery(p(setTimeout)(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })().then(v => v, err => err),
      ).to.satisfy(
        err =>
          err.message === 'rejected!' &&
          err[Nursery.moreErrors].length === 1 &&
          err[Nursery.moreErrors][0].message === 'rejected again',
      )

      expect(firstDone).to.be.true
    })
  })
})
