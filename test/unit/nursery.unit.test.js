'use strict'
const {describe = global.describe, it = global.it} = require('mocha')
const chai = require('chai')
const {expect} = chai
const throat = require('throat')

chai.use(require('chai-as-promised'))

const Nursery = require('../..')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('nursery', function() {
  describe('single task', () => {
    it('should throw error if bare value', async () => {
      expect(() => Nursery(4)).to.throw(/bare values/)
    })

    it('should return a value as sent by promise', async () => {
      expect(await Nursery(Promise.resolve(4))).to.equal(4)
    })

    it('should throw reject on a rejected promise', async () => {
      expect(
        await Nursery(Promise.reject(new Error('ouch')).then(v => v, err => err.message)),
      ).to.equal('ouch')
    })

    it('should return a value as sent by promise task', async () => {
      expect(await Nursery(() => Promise.resolve(4))).to.equal(4)
    })

    it('should return a value as sent by value taks', async () => {
      expect(await Nursery(() => 4)).to.equal(4)
    })

    it('should throw reject on a rejected promise task', async () => {
      expect(
        await Nursery(() => {
          throw new Error('ouch')
        }).then(v => v, err => err.message),
      ).to.equal('ouch')
    })
    it('should throw reject on a thrown error task', async () => {
      expect(
        await Nursery(() => Promise.reject(new Error('ouch')).then(v => v, err => err.message)),
      ).to.equal('ouch')
    })

    it('should support run with a sub nurse', async () => {
      expect(
        await Nursery(nurse => {
          nurse(() => 4)
        }),
      ).to.eql([4, undefined])
    })

    it('should support multiple runs with a sub nurse', async () => {
      expect(
        await Nursery(nurse => {
          nurse(() => 4)
          nurse(() => Promise.resolve(2))

          return 7
        }),
      ).to.eql([4, 2, 7])
    })

    it('should support a supervisor', async () => {
      expect(
        await Nursery(nurse => {
          nurse.supervisor(Nursery.timeoutTask(10))
          nurse(() => delay(20).then(_ => 4))

          return 7
        }).then(v => v, err => err.message),
      ).to.contain('Timeout')

      expect(
        await Nursery(nurse => {
          nurse.supervisor(Nursery.timeoutTask(20))
          nurse(() => delay(10).then(_ => 4))

          return 7
        }).then(v => v, err => err.message),
      ).to.eql([undefined, 4, 7])
    })

    it('should support returning an array', async () => {
      expect(await Nursery(() => [4, 5])).to.eql([4, 5])
    })
  })

  describe('run', () => {
    it('should wait for spawned promises', async () => {
      let firstDone = false
      let secondDone = false
      let runTimes = 0

      for await (const nursery of Nursery()) {
        ++runTimes
        nursery.run(() => delay(10).then(() => (firstDone = true)))
        nursery.run(() => delay(20).then(() => (secondDone = true)))
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
        nursery.run(() => delay(10).then(() => (firstDone = true)))
        nursery.run(() => delay(20).then(() => (secondDone = true)))

        // the `if` is to that static analyzers dont bothers me with unreachable code
        if (Math.floor(Math.PI) === 3) break

        nursery.run(() => delay(10).then(() => (thirdDone = true)))
      }

      expect(firstDone).to.be.true
      expect(secondDone).to.be.true
      expect(thirdDone).to.be.false
    })

    it('should support function call syntax', async () => {
      let firstDone = false

      for await (const n of Nursery()) n(() => delay(10).then(() => (firstDone = true)))

      expect(firstDone).to.be.true
    })

    it('should support receiving a promise', async () => {
      let firstDone = false

      for await (const n of Nursery()) n(delay(10).then(() => (firstDone = true)))

      expect(firstDone).to.be.true
    })

    it('should return the promise it ran', async () => {
      let firstDone = false

      for await (const n of Nursery()) {
        await n(delay(10).then(() => (firstDone = true)))
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
            nursery(delay(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })(),
      ).to.eventually.be.rejectedWith('rejected!')
    })

    it('should wait for other tasks before throwing exception', async () => {
      let firstDone = false
      await expect(
        (async () => {
          for await (const nursery of Nursery()) {
            nursery(delay(20).then(_ => (firstDone = true)))
            nursery(delay(10).then(() => Promise.reject(new Error('rejected!'))))
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
            nursery(delay(30).then(_ => Promise.reject(new Error('rejected again'))))
            nursery(delay(20).then(_ => (firstDone = true)))
            nursery(delay(10).then(() => Promise.reject(new Error('rejected!'))))
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
            nursery(delay(30).then(_ => Promise.reject(new Error('rejected again'))))
            nursery(delay(20).then(_ => (firstDone = true)))
            nursery(delay(10).then(() => Promise.reject(new Error('rejected!'))))
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
            nursery(delay(30).then(_ => Promise.reject(new Error('rejected again'))))
            nursery(delay(20).then(_ => (firstDone = true)))
            nursery(delay(10).then(() => Promise.reject(new Error('rejected!'))))
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

    it('should handle the case of multi-error when the first error is not an object', async () => {
      await expect(
        await Nursery([Promise.reject('halle'), Promise.reject('lujah')]).then(
          _ => ({}),
          err => err,
        ),
      ).to.be.a('string')
    })
  })

  describe('aborting', () => {
    it('should abort other tasks when one rejects', async () => {
      let firstDone = false
      let secondDone = true
      await expect(
        (async () => {
          for await (const nursery of Nursery()) {
            nursery(
              delay(20).then(_ =>
                nursery.signal.aborted ? (firstDone = false) : (firstDone = true),
              ),
            )
            nursery(delay(30).then(_ => (secondDone = true)))
            nursery(delay(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })(),
      ).to.eventually.be.rejectedWith('rejected!')

      expect(firstDone).to.be.false
      expect(secondDone).to.be.true
    })

    it('should handle the case where abortController is used manually', async () => {
      expect(
        await Nursery([
          ({abortController}) => {
            abortController.abort()
            return 'regular'
          },
          ({signal}) => delay(10).then(_ => (signal.aborted ? 'aborted' : 'not aborted')),
        ]),
      ).to.eql(['regular', 'aborted'])
    })
  })

  describe('tasks that are called with parameters', () => {})

  describe('retries', () => {
    it('should retry and succeed', async () => {
      let firstCount = 0
      let runTimes = 0

      for await (const nurse of Nursery({retries: 2})) {
        ++runTimes
        nurse.run(() =>
          delay(10).then(() => {
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
              delay(10).then(() => {
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
          delay(30).then(_ => Promise.reject(new Error('rejected again'))),
          delay(20).then(_ => (firstDone = true)),
          delay(10).then(() => Promise.reject(new Error('rejected!'))),
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

  describe('execution', () => {
    it('should enable execution via throat function (or any other)', async () => {
      const results = []

      // `throat(1)` ensures sequential execution
      for await (const nursery of Nursery({execution: throat(1)})) {
        nursery(() => delay(20).then(_ => results.push(1)))
        nursery(() => delay(10).then(_ => results.push(2)))
        nursery(() => delay(5).then(_ => results.push(3)))
        nursery(() => delay(30).then(_ => results.push(4)))
      }

      expect(results).to.eql([1, 2, 3, 4])
    })
  })

  describe('supervisor', () => {
    it('should not timeout if not enough time passed', async () => {
      let result
      for await (const nursery of Nursery()) {
        nursery.supervisor(Nursery.timeoutTask(100, {name: 'lalala'}))
        nursery(delay(10).then(_ => (result = 42)))
      }

      expect(result).to.equal(42)
    })

    it('should timeout if enough time passed', async () => {
      let alreadyAborted

      try {
        for await (const nursery of Nursery()) {
          nursery.supervisor(Nursery.timeoutTask(10, {name: 'lalala'}))

          nursery(({signal}) => delay(20).then(_ => (alreadyAborted = signal.aborted)))
        }
        expect.fail('should have thrown an exception')
      } catch (err) {
        expect(err).to.be.instanceOf(Nursery.TimeoutError)
        expect(err.name).to.equal('lalala')
        expect(err.code).to.equal('ERR_NURSERY_TIMEOUT_ERR')
        expect(err.ms).to.equal(10)
        expect(alreadyAborted).to.be.true
      }
    })
  })
})
