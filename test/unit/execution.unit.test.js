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
        await Nursery(({nurse}) => {
          nurse(() => 4)
        }),
      ).to.eql([4, undefined])
    })

    it('should support multiple runs with a sub nurse', async () => {
      expect(
        await Nursery(({nurse}) => {
          nurse(() => 4)
          nurse(() => Promise.resolve(2))

          return 7
        }),
      ).to.eql([4, 2, 7])
    })

    it('should support a supervisor', async () => {
      expect(
        await Nursery(({nurse, supervisor}) => {
          supervisor(Nursery.timeoutTask(10))
          nurse(() => delay(20).then(_ => 4))

          return 7
        }).then(v => v, err => err.message),
      ).to.contain('Timeout')

      expect(
        await Nursery(({nurse, supervisor}) => {
          supervisor(Nursery.timeoutTask(20))
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

      for await (const {nurse} of Nursery()) {
        ++runTimes
        nurse(() => delay(10).then(() => (firstDone = true)))
        nurse(() => delay(20).then(() => (secondDone = true)))
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

      for await (const {nurse} of Nursery()) {
        nurse(() => delay(10).then(() => (firstDone = true)))
        nurse(() => delay(20).then(() => (secondDone = true)))

        // the `if` is to that static analyzers dont bothers me with unreachable code
        if (Math.floor(Math.PI) === 3) break

        nurse(() => delay(10).then(() => (thirdDone = true)))
      }

      expect(firstDone).to.be.true
      expect(secondDone).to.be.true
      expect(thirdDone).to.be.false
    })

    it('should support receiving a promise', async () => {
      let firstDone = false

      for await (const {nurse} of Nursery()) nurse(delay(10).then(() => (firstDone = true)))

      expect(firstDone).to.be.true
    })

    it('should return the promise it ran', async () => {
      let firstDone = false

      for await (const {nurse} of Nursery()) {
        await nurse(delay(10).then(() => (firstDone = true)))
        expect(firstDone).to.be.true
      }
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

      await expect(
        Nursery(
          [
            () => {
              taskRunCount += 1
              return Promise.reject(new Error('error!'))
            },
          ],
          {retries: 4},
        ),
      ).to.eventually.be.rejectedWith('error!')

      expect(taskRunCount).to.equal(5)
    })
  })

  describe('execution', () => {
    it('should enable execution via throat function (or any other)', async () => {
      const results = []

      // `throat(1)` ensures sequential execution
      for await (const {nurse} of Nursery({execution: throat(1)})) {
        nurse(() => delay(20).then(_ => results.push(1)))
        nurse(() => delay(10).then(_ => results.push(2)))
        nurse(() => delay(5).then(_ => results.push(3)))
        nurse(() => delay(30).then(_ => results.push(4)))
      }

      expect(results).to.eql([1, 2, 3, 4])
    })
  })

  describe('supervisor', () => {
    it('should not timeout if not enough time passed', async () => {
      let result
      for await (const {nurse, supervisor} of Nursery()) {
        supervisor(Nursery.timeoutTask(100, {name: 'lalala'}))
        nurse(delay(10).then(_ => (result = 42)))
      }

      expect(result).to.equal(42)
    })

    it('should timeout if enough time passed', async () => {
      let alreadyAborted

      try {
        for await (const {nurse, supervisor} of Nursery()) {
          supervisor(Nursery.timeoutTask(10, {name: 'lalala'}))

          nurse(({signal}) => delay(20).then(_ => (alreadyAborted = signal.aborted)))
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

  describe('fail after close', async () => {
    it('should throw an exception if used after close', async () => {
      let nurse
      let taskAfterCloseRan = false
      for await ({nurse} of Nursery()) {
        nurse(() => delay(10))
      }

      expect(() =>
        nurse(() => {
          taskAfterCloseRan = true
          return delay(10)
        }),
      ).to.throw('cannot use a nurse after nursery is closed')

      expect(taskAfterCloseRan).to.be.false
    })

    it('should throw an exception if used after close, even with retries', async () => {
      let nurse
      let taskAfterCloseRan = false
      let i = 0
      for await ({nurse} of Nursery({retries: 2})) {
        i += 1
        if (i === 1) nurse(() => Promise.reject(new Error()))
        nurse(() => delay(10))
      }

      expect(i).to.equal(2)
      expect(() =>
        nurse(() => {
          taskAfterCloseRan = true
          return delay(10)
        }),
      ).to.throw('cannot use a nurse after nursery is closed')

      expect(taskAfterCloseRan).to.be.false
    })

    it('should not be able to use a nurse, even with task Nurseries', async () => {
      let globalNurse
      let taskAfterCloseRan = false
      await Nursery(({nurse}) => {
        globalNurse = nurse
        nurse(() => delay(10))
      })

      expect(() =>
        globalNurse(() => {
          taskAfterCloseRan = true
          return delay(10)
        }),
      ).to.throw('cannot use a nurse after nursery is closed')

      expect(taskAfterCloseRan).to.be.false
    })

    it('should not be able to use a nurse, even with task list Nurseries', async () => {
      let globalNurse
      let taskAfterCloseRan = false
      await Nursery([
        ({nurse}) => {
          globalNurse = nurse
          nurse(() => delay(10))
        },
      ])

      expect(() =>
        globalNurse(() => {
          taskAfterCloseRan = true
          return delay(10)
        }),
      ).to.throw('cannot use a nurse after nursery is closed')

      expect(taskAfterCloseRan).to.be.false
    })

    it('should throw an exception if supervisor attempts to use nurse after closed', async () => {
      let taskAfterCloseRan = false

      await Nursery(({nurse, supervisor}) => {
        supervisor(async ({signal}) => {
          signal.addEventListener('abort', () => {
            expect(() => {
              nurse(() => {
                taskAfterCloseRan = true
                return delay(10)
              })
            }).to.throw('cannot use a nurse after nursery is closed')
          })
        })
      })

      expect(taskAfterCloseRan).to.be.false
    })
  })
})
