import * as core from '@actions/core'
import * as filestack from 'filestack-js'
import {Storage} from '@google-cloud/storage'
import {globby} from 'globby'
import {inspect} from 'util'
import {readFile} from 'node:fs/promises'

const bucketName = 'visual-regression-image-bucket'

async function run(): Promise<void> {
  try {
    const filestackKey = core.getInput('filestack-key')
    const gCredentials = JSON.parse(core.getInput('gcloud-credentials-json'))

    const client = filestack.init(filestackKey)
    const upload = new Storage({
      credentials: gCredentials,
      projectId: gCredentials.project_id
    }).bucket(bucketName).upload

    let paths = await globby('**/*diff.png')
    paths = paths.filter(path => !path.includes('retry'))
    const uploadPromises = paths.map(async path => {
      const file = await readFile(path)
      const response = await client.upload(file)
      core.debug(`upload response for ${path}: ${inspect(response)}`)
      let summaryPath = path.split('/').pop() || ''
      summaryPath = summaryPath?.replace('diff.png', '').split('-').join(' ')

      const gcloudResponse = await upload(path)
      core.debug(
        `upload gcloud response for ${path}: ${inspect(gcloudResponse)}`
      )

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
      '#### Turn and face the strange',
      '---',
      'If these changes are intentional, leave a comment with `--update-snapshots` to commit new reference snapshots\n',
      ...mdLines
    ].join('\n')
    // important note: this action does not handle the `--update-snapshots` comment

    core.setOutput('body', commentBody)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
