import * as core from '@actions/core'
import * as filestack from 'filestack-js'
import {globby} from 'globby'
import {inspect} from 'util'
import {readFile} from 'node:fs/promises'

async function run(): Promise<void> {
  try {
    const filestackKey = core.getInput('filestack-key')

    const client = filestack.init(filestackKey)
    let paths = await globby('**/*diff.png')
    paths = paths.filter(path => !path.includes('retry'))
    const uploadPromises = paths.map(async path => {
      const file = await readFile(path)
      const response = await client.upload(file)
      core.debug(`upload response for ${path}: ${inspect(response)}`)
      let summaryPath = path.split('/').pop() || ''
      summaryPath = summaryPath?.replace('diff.png', '').split('-').join(' ')
      return `
<details>
  <summary>${summaryPath}</summary>
      ${path}
</details>

![${path}](${response.url})`
    })
    const mdLines = await Promise.all(uploadPromises)

    const commentBody = [
      '### Ch-ch-ch-ch-changes',
      'Turn and face the strange\n',
      ...mdLines
    ].join('\n')

    core.setOutput('body', commentBody)

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
