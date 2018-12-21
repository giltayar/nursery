'use strict'
const {describe, it} = require('mocha')
const {expect} = require('chai')
const chai = require('chai')
chai.use(require('chai-as-promised'))

const Nursery = require('../..')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('error handling', () => {
  describe('errors', () => {
    it('for should throw exception if one of the promises does', async () => {
      await expect(
        (async () => {
          for await (const {nurse} of Nursery()) {
            nurse(Promise.resolve(4))
            nurse(delay(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })(),
      ).to.eventually.be.rejectedWith('rejected!')
    })

    it('should wait for other tasks before throwing exception', async () => {
      let firstDone = false
      await expect(
        (async () => {
          for await (const {nurse} of Nursery()) {
            nurse(delay(20).then(_ => (firstDone = true)))
            nurse(delay(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })(),
      ).to.eventually.be.rejectedWith('rejected!')

      expect(firstDone).to.be.true
    })

    it('should wait for other (rejected) tasks before throwing exception', async () => {
      let firstDone = false
      await expect(
        (async () => {
          for await (const {nurse} of Nursery()) {
            nurse(delay(30).then(_ => Promise.reject(new Error('rejected again'))))
            nurse(delay(20).then(_ => (firstDone = true)))
            nurse(delay(10).then(() => Promise.reject(new Error('rejected!'))))
          }
        })().then(),
      ).to.eventually.be.rejectedWith('rejected!')

      expect(firstDone).to.be.true
    })

    it('should wait for other (rejected) tasks before throwing exception even if there is a break', async () => {
      let firstDone = false
      await expect(
        (async () => {
          for await (const {nurse} of Nursery()) {
            nurse(delay(30).then(_ => Promise.reject(new Error('rejected again'))))
            nurse(delay(20).then(_ => (firstDone = true)))
            nurse(delay(10).then(() => Promise.reject(new Error('rejected!'))))
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
          for await (const {nurse} of Nursery()) {
            nurse(delay(30).then(_ => Promise.reject(new Error('rejected again'))))
            nurse(delay(20).then(_ => (firstDone = true)))
            nurse(delay(10).then(() => Promise.reject(new Error('rejected!'))))
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
          for await (const {nurse, signal} of Nursery()) {
            nurse(delay(20).then(_ => (signal.aborted ? (firstDone = false) : (firstDone = true))))
            nurse(delay(30).then(_ => (secondDone = true)))
            nurse(delay(10).then(() => Promise.reject(new Error('rejected!'))))
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
})
