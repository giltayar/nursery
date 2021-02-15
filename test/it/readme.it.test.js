'use strict'
const util = require('util')
const {describe = global.describe, it = global.it} = require('mocha')
const {expect} = require('chai')

const flatten = (arr) => [].concat(...arr)

describe('Code from Readme', function () {
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
          ['first', 'after Nursery failed!'],
          ['first', 'after Nursery failed!'],
          ['172'],
          ['172', 'after Nursery failed!'],
          ['after Nursery failed!'],
          ['aborted', 'after Nursery failed!'],
          ['Timed out!'],
          ['done', 'done'],
          ['[ 4, 2 ]'],
          ['4'],
          ["[ 'run1', 'run2', 'done' ]"],
          ['done', 'done'],
          ['done', 'done'],
          ['aborted', 'after Nursery failed!'],
          ['aborted'],
          ['first error', 'second error'],
          ['executing task', 'executing task', '1', '2'],
          ['1', '2', '3', '4'],
          ['Timeout of 5ms occured for task fetchSkywalkerHeight'],
          ['42', '43'],
        ]),
      )
    } finally {
      console.log = originalConsoleLog
    }
  })
})
