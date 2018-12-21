'use strict'
const {describe, it} = require('mocha')
const {expect} = require('chai')
const chai = require('chai')

chai.use(require('chai-as-promised'))

const Nursery = require('../..')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('retries', () => {
  describe('retry count', () => {
    it('should retry and succeed', async () => {
      let firstCount = 0
      let runTimes = 0

      for await (const {nurse} of Nursery({retries: 2})) {
        ++runTimes
        nurse(() =>
          delay(10).then(() => {
            firstCount += 1
            if (firstCount <= 2) throw new Error('should be retried')
          }),
        )
      }
      expect(firstCount).to.equal(3)
      expect(runTimes).to.equal(3)
    })

    it('a throw inside the body should not be retried', async () => {
      let firstCount = 0
      let runTimes = 0

      await expect(
        (async function() {
          for await (const {nurse} of Nursery({retries: 2})) {
            ++runTimes
            nurse(() => delay(10))
            firstCount += 1
            if (firstCount <= 2) throw new Error('should not be retried')
          }
        })(),
      ).to.eventually.be.rejectedWith('should not be retried')

      expect(firstCount).to.equal(1)
      expect(runTimes).to.equal(1)
    })

    it('should retry and fail', async () => {
      let firstCount = 0
      let runTimes = 0

      await expect(
        (async () => {
          for await (const {nurse} of Nursery({retries: 4})) {
            ++runTimes
            nurse(() =>
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

  describe('onRetry', function() {
    it('onRetry should be called for each retry', async () => {
      let calledOnRetry = 0
      let runTimes = 0

      for await (const {nurse} of Nursery({
        retries: 4,
        onRetry: () => delay(1).then(_ => ++calledOnRetry),
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
            onRetry: () => delay(1).then(_ => Promise.reject(new Error('!!!'))),
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
            onRetry: () => delay(1).then(_ => Promise.reject(new Error('!!!'))),
          },
        ),
      ).to.eventually.be.rejectedWith('!!!')

      expect(runTimes).to.equal(1)
    })

    it('throwing an error onRetry with for await will stop the retries', async () => {
      let runTimes = 0

      await expect(
        (async function() {
          for await (const {nurse} of Nursery({
            retries: 4,
            onRetry: () => delay(1).then(_ => Promise.reject('!!!')),
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
})
