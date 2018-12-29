'use strict'
const {describe, it} = require('mocha')
const {expect} = require('chai')
const chai = require('chai')
chai.use(require('chai-as-promised'))

const Nursery = require('../..')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('Nursery.CancelTask', function() {
  it('cancels a single task without failing the task', async () => {
    const value = await Nursery(() => {
      throw new Nursery.CancelTask(42)
    })

    expect(value).to.equal(42)
  })

  it('cancels a single task without failing the task (promises)', async () => {
    const value = await Nursery(() => Promise.reject(new Nursery.CancelTask(42)))

    expect(value).to.equal(42)
  })

  it('cancels a multi-task without failing the task (promises)', async () => {
    const [res1, res2] = await Nursery([
      () => Promise.reject(new Nursery.CancelTask(42)),
      () => Promise.resolve(43),
    ])

    expect(res1).to.equal(42)
    expect(res2).to.equal(43)
  })

  it('cancels a nurse-task without failing the task', async () => {
    for await (const {nurse} of Nursery()) {
      nurse(() => Promise.reject(new Nursery.CancelTask(42)))
    }
  })

  it('cancels a nurse-task without failing the task', async () => {
    let finalValue
    for await (const {nurse} of Nursery()) {
      nurse(() => delay(10).then(_ => Promise.reject(new Nursery.CancelTask(42)))).then(
        x => (finalValue = x),
      )
    }
    expect(finalValue).to.equal(42)
  })

  it('cannot cancel body of for-await', async () => {
    expect(
      (async () => {
        for await (const _ of Nursery()) {
          throw new Nursery.CancelTask(42)
        }
      })(),
    ).to.be.rejectedWith('Nursery task cancelled')
  })
})
