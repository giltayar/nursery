'use strict'
const {describe, it} = require('mocha')
const {expect} = require('chai')
const chai = require('chai')

chai.use(require('chai-as-promised'))

const Nursery = require('../..')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('retries', () => {
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
