'use strict'
const util = require('util')
const {describe, it} = require('mocha')
const {expect} = require('chai')

const flatten = arr => [].concat(...arr)

describe('Code from Readme', function() {
  it('should all work', async () => {
    const logs = []
    const originalConsoleLog = console.log
    console.log = (...args) => logs.push(util.format(...args).trim())
    try {
      await require('./readme.js')

      expect(logs).to.eql(
        flatten([
          ['first', 'second'],
          ['first', 'second'],
          ['after Promise.all failed!', 'first'],
          ['first', 'after Nursery failed!'],
          ['172'],
          ['172', 'after Nursery failed!'],
          ['after Nursery failed!'],
          ['aborted', 'after Nursery failed!'],
          ['done', 'done'],
          ['done', 'done'],
          ['aborted', 'after Nursery failed!'],
          ['aborted'],
          ['first error', 'second error']
        ]),
      )
    } finally {
      console.log = originalConsoleLog
    }
  })
})
