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

        // the `if` is to that static analyzers dont bothers me with unreachable code
        if (Math.floor(Math.PI) === 3) break

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

    it('should wait for other (rejected) tasks before throwing exception even if there is a break', async () => {
      let firstDone = false
      await expect(
        (async () => {
          for await (const nursery of Nursery()) {
            nursery(p(setTimeout)(30).then(_ => Promise.reject(new Error('rejected again'))))
            nursery(p(setTimeout)(20).then(_ => (firstDone = true)))
            nursery(p(setTimeout)(10).then(() => Promise.reject(new Error('rejected!'))))
            break
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

    it('should handle the case of multi-error when the first error is not an object')
  })

  describe('aborting', () => {
    it('should abort other tasks when one rejects', async () => {
      let firstDone = false
      let secondDone = true
      await expect(
        (async () => {
          for await (const nursery of Nursery()) {
            nursery(
              p(setTimeout)(20).then(_ =>
                nursery.signal.aborted ? (firstDone = false) : (firstDone = true),
              ),
            )
            nursery(p(setTimeout)(30).then(_ => (secondDone = true)))
            nursery(p(setTimeout)(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })(),
      ).to.eventually.be.rejectedWith('rejected!')

      expect(firstDone).to.be.false
      expect(secondDone).to.be.true
    })

    it('should handle the case where abortController is used manually')
  })

  describe('tasks that are called with parameters', () => {})

  describe('retries', () => {
    it('should retry and succeed', async () => {
      let firstCount = 0
      let runTimes = 0

      for await (const nursery of Nursery({retries: 2})) {
        ++runTimes
        nursery.run(() =>
          p(setTimeout)(10).then(() => {
            firstCount += 1
            if (firstCount <= 2) throw new Error('should be retried')
          }),
        )
      }

      expect(firstCount).to.equal(3)
      expect(runTimes).to.equal(3)
    })

    it('should retry and fail', async () => {
      let firstCount = 0
      let runTimes = 0

      await expect(
        (async () => {
          for await (const nursery of Nursery({retries: 4})) {
            ++runTimes
            nursery.run(() =>
              p(setTimeout)(10).then(() => {
                firstCount += 1
                throw new Error('should finally be error')
              }),
            )
          }
        })(),
      ).to.eventually.rejectedWith('should finally be error')

      expect(firstCount).to.equal(5)
      expect(runTimes).to.equal(5)
    })
  })

  describe('Nursery with task list', () => {
    it('should be like Promise.all if no rejections', async () => {
      expect(await Nursery([Promise.resolve(4), Promise.resolve(2)])).to.eql([4, 2])
    })

    it('should be like Promise.all if rejections, except it waits for everything like Nursery', async () => {
      let firstDone = false

      expect(
        await Nursery([
          p(setTimeout)(30).then(_ => Promise.reject(new Error('rejected again'))),
          p(setTimeout)(20).then(_ => (firstDone = true)),
          p(setTimeout)(10).then(() => Promise.reject(new Error('rejected!'))),
        ]).then(v => v, err => err),
      ).to.satisfy(
        err =>
          err.message === 'rejected!' &&
          err[Nursery.moreErrors].length === 1 &&
          err[Nursery.moreErrors][0].message === 'rejected again',
      )

      expect(firstDone).to.be.true
    })

    it('should support retries', async () => {
      let taskRunCount = 0

      expect(
        await Nursery(
          [
            () => {
              taskRunCount += 1
              return Promise.reject(new Error('error!'))
            },
          ],
          {retries: 4},
        ).catch(err => err.message),
      ).to.equal('error!')
      expect(taskRunCount).to.equal(5)
    })
  })
})
