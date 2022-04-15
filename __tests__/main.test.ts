import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {expect, test} from '@jest/globals'

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  expect(1).toBe(1)
  // process.env['INPUT_TOKEN'] = process.env.token || 'github PAT'
  // process.env['INPUT_ISSUE-NUMBER'] = '1'
  // process.env['INPUT_REPOSITORY'] = 'docs'
  // const np = process.execPath
  // const ip = path.join(__dirname, '..', 'lib', 'main.js')
  // const options: cp.ExecFileSyncOptions = {
  //   env: process.env
  // }
  // console.log(cp.execFileSync(np, [ip], options).toString())
})
