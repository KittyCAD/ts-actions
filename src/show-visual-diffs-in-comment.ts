import * as core from '@actions/core'
import * as github from '@actions/github'
import {Storage} from '@google-cloud/storage'
import {globby} from 'globby'
import {inspect} from 'util'

const bucketName = 'visual-regression-image-bucket'

async function run(): Promise<void> {
  try {
    const gCredentials = JSON.parse(core.getInput('gcloud-credentials-json'))

    const storage = new Storage({
      credentials: gCredentials,
      projectId: gCredentials.project_id
    })

    let paths = await globby('**/*diff.png')
    paths = paths.filter(path => !path.includes('retry'))
    const uploadPromises = paths.map(async path => {
      const fileName = path.split('/').pop() || ''
      const summaryPath = fileName?.replace('diff.png', '').split('-').join(' ')
      const [gcloudResponse] = await storage.bucket(bucketName).upload(path, {
        contentType: 'image/png',
        destination: `${github.context.repo.repo}-${fileName}-sha-${github.context.sha}`
      })
      core.debug(
        `upload gcloud response for ${path}: ${inspect(gcloudResponse)}`
      )

      return `
<details>
  <summary>${summaryPath}</summary>
      ${path}
</details>

![${path}](${gcloudResponse.metadata.mediaLink})`
    })
    const mdLines = await Promise.all(uploadPromises)

    const commentBody = [
      '### Ch-ch-ch-ch-changes',
      '<details>',
      '<summary>',
      '',
      '#### Turn and face the strange (click to see diffs)',
      '',
      '</summary>',
      '---',
      'If these changes are intentional, leave a comment with `--update-snapshots` to commit new reference snapshots\n',
      ...mdLines,
      '</details>'
    ].join('\n')
    // important note: This action does not handle the `--update-snapshots` comment

    core.setOutput('body', commentBody)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
