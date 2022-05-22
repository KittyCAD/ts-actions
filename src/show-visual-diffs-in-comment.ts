import * as core from '@actions/core'
import * as filestack from 'filestack-js'
import {Storage} from '@google-cloud/storage'
import {globby} from 'globby'
import {inspect} from 'util'
import {readFile} from 'node:fs/promises'

// The ID of your GCS bucket
// const bucketName = 'your-unique-bucket-name'

// The path to your file to upload
// const filePath = 'path/to/your/file'

// // The new ID for your GCS file
// const destFileName = 'your-new-file-name'

// Imports the Google Cloud client library

// Creates a client

// async function uploadFile(bucketName: string, filePath: string): Promise<void> {
//   const storage = new Storage({credentials: credentialsJson})
//   const response = await storage.bucket(bucketName).upload(filePath)

//   console.log(`${filePath} uploaded to ${bucketName}`)
//   console.log(`gcloud response: ${response}`)
// }

async function run(): Promise<void> {
  try {
    const filestackKey = core.getInput('filestack-key')
    const bucketName = core.getInput('bucket-key')
    const credentialsJson = JSON.parse(core.getInput('gcloud-credentials-json'))

    const client = filestack.init(filestackKey)
    let paths = await globby('**/*diff.png')
    paths = paths.filter(path => !path.includes('retry'))
    const uploadPromises = paths.map(async path => {
      const file = await readFile(path)
      const response = await client.upload(file)
      core.debug(`upload response for ${path}: ${inspect(response)}`)
      let summaryPath = path.split('/').pop() || ''
      summaryPath = summaryPath?.replace('diff.png', '').split('-').join(' ')

      // await uploadFile(bucketName, path)
      const storage = new Storage({credentials: credentialsJson})
      const gcloudResponse = await storage.bucket(bucketName).upload(path)
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
      'leave a comment with `--update-snapshots` to accept the changes\n',
      ...mdLines
    ].join('\n')

    core.setOutput('body', commentBody)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
