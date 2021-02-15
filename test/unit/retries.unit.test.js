'use strict'
const {describe, it} = require('mocha')
const {expect} = require('chai')
const chai = require('chai')

chai.use(require('chai-as-promised'))

const Nursery = require('../..')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('retries', () => {
  describe('retry count', () => {
    it('should retry and succeed', async () => {
      let taskCount = 0
      let runTimes = 0

      for await (const {nurse} of Nursery({retries: 2})) {
        ++runTimes
        nurse(() =>
          delay(10).then(() => {
            taskCount += 1
            if (taskCount <= 2) throw new Error('should be retried')
          }),
        )
      }
      expect(taskCount).to.equal(3)
      expect(runTimes).to.equal(3)
    })

    it('a throw inside the body should not be retried', async () => {
      let taskCount = 0
      let runTimes = 0

      await expect(
        (async function () {
          for await (const {nurse} of Nursery({retries: 2})) {
            ++runTimes
            nurse(() => delay(10))
            taskCount += 1
            if (taskCount <= 2) throw new Error('should not be retried')
          }
        })(),
      ).to.eventually.be.rejectedWith('should not be retried')

      expect(taskCount).to.equal(1)
      expect(runTimes).to.equal(1)
    })

    it('should retry and fail', async () => {
      let taskCount = 0
      let runTimes = 0

      await expect(
        (async () => {
          for await (const {nurse} of Nursery({retries: 4})) {
            ++runTimes
            nurse(() =>
              delay(10).then(() => {
                taskCount += 1
                throw new Error('should finally be error')
              }),
            )
          }
        })(),
      ).to.eventually.rejectedWith('should finally be error')

      expect(taskCount).to.equal(5)
      expect(runTimes).to.equal(5)
    })
  })

  describe('onRetry', function () {
    it('onRetry should be called for each retry', async () => {
      let calledOnRetry = 0
      let runTimes = 0

      for await (const {nurse} of Nursery({
        retries: 4,
        onRetry: () => delay(1).then((_) => ++calledOnRetry),
      })) {
        ++runTimes
        if (runTimes === 5) return
        nurse(Promise.reject(new Error('error!')))
      }

      expect(runTimes).to.equal(5)
      expect(calledOnRetry).to.equal(4)
    })

    it('throwing an error onRetry will stop the retries', async () => {
      let runTimes = 0

      await expect(
        Nursery(
          ({nurse}) => {
            ++runTimes
            if (runTimes === 5) return
            nurse(Promise.reject(new Error('error!')))
          },
          {
            retries: 4,
            onRetry: () => delay(1).then((_) => Promise.reject(new Error('!!!'))),
          },
        ),
      ).to.eventually.be.rejectedWith('!!!')

      expect(runTimes).to.equal(1)
    })

    it('throwing an error onRetry with task list will stop the retries', async () => {
      let runTimes = 0

      await expect(
        Nursery(
          [
            ({nurse}) => {
              ++runTimes
              if (runTimes === 5) return
              nurse(Promise.reject(new Error('error!')))
            },
          ],
          {
            retries: 4,
            onRetry: () => delay(1).then((_) => Promise.reject(new Error('!!!'))),
          },
        ),
      ).to.eventually.be.rejectedWith('!!!')

      expect(runTimes).to.equal(1)
    })

    it('throwing an error onRetry with for await will stop the retries', async () => {
      let runTimes = 0

      await expect(
        (async function () {
          for await (const {nurse} of Nursery({
            retries: 4,
            onRetry: () => delay(1).then((_) => Promise.reject('!!!')),
          })) {
            ++runTimes
            if (runTimes === 5) return
            nurse(Promise.reject(new Error('error!')))
          }
        })(),
      ).to.eventually.be.rejectedWith('!!!')

      expect(runTimes).to.equal(1)
    })
  })

  describe('Nursery.*TimeRetry', () => {
    it('should do constant time', async () => {
      let taskCount = 0

      const start = Date.now()
      for await (const {nurse} of Nursery({
        retries: 3,
        onRetry: Nursery.constantTimeRetry({delta: 200}),
      })) {
        nurse(() => {
          taskCount += 1
          if (taskCount <= 3) throw new Error('should be retried')
        })
      }
      const time = Date.now() - start

      expect(time).to.be.approximately(200 * 3, 50)
    })

    it('should do linear time', async () => {
      let taskCount = 0

      const start = Date.now()
      for await (const {nurse} of Nursery({
        retries: 3,
        onRetry: Nursery.linearTimeRetry({start: 200, delta: 30}),
      })) {
        nurse(() => {
          taskCount += 1
          if (taskCount <= 3) throw new Error('should be retried')
        })
      }
      const time = Date.now() - start

      expect(time).to.be.approximately(200 + 230 + 260, 50)
    })

    it('should do linear time with max', async () => {
      let taskCount = 0

      const start = Date.now()
      for await (const {nurse} of Nursery({
        retries: 3,
        onRetry: Nursery.linearTimeRetry({start: 200, delta: 30, max: 200}),
      })) {
        nurse(() => {
          taskCount += 1
          if (taskCount <= 3) throw new Error('should be retried')
        })
      }
      const time = Date.now() - start

      expect(time).to.be.approximately(200 * 3, 50)
    })

    it('should do exponential time', async () => {
      let taskCount = 0

      const start = Date.now()
      for await (const {nurse} of Nursery({
        retries: 3,
        onRetry: Nursery.exponentialTimeRetry({start: 100, factor: 2}),
      })) {
        nurse(() => {
          taskCount += 1
          if (taskCount <= 3) throw new Error('should be retried')
        })
      }
      const time = Date.now() - start

      expect(time).to.be.approximately(100 + 200 + 400, 50)
    })

    it('should do exponential time with max', async () => {
      let taskCount = 0

      const start = Date.now()
      for await (const {nurse} of Nursery({
        retries: 3,
        onRetry: Nursery.exponentialTimeRetry({start: 100, factor: 2, max: 200}),
      })) {
        nurse(() => {
          taskCount += 1
          if (taskCount <= 3) throw new Error('should be retried')
        })
      }
      const time = Date.now() - start

      expect(time).to.be.approximately(100 + 200 + 200, 50)
    })
  })
})
