import * as core from '@actions/core'
import * as filestack from 'filestack-js'
import * as github from '@actions/github'
import {globby} from 'globby'
import {inspect} from 'util'
import {readFile} from 'node:fs/promises'

async function run(): Promise<void> {
  try {
    const token = core.getInput('token')
    const filestackKey = core.getInput('filestack-key')

    const client = filestack.init(filestackKey)
    const paths = await globby('**/*diff.png')
    const uploadPromises = paths.map(async path => {
      const file = await readFile(path)
      const response = await client.upload(file)
      core.debug(`upload response for ${path}: ${inspect(response)}`)
      return `\nimg: **${path}**\n![${path}](${response.url})`
    })
    const mdLines = await Promise.all(uploadPromises)

    const commentBody = [
      '### Ch-ch-ch-ch-changes',
      'Turn and face the strange\n',
      ...mdLines
    ].join('\n')
    const octokit = github.getOctokit(token)

    await octokit.rest.issues.createComment({
      issue_number: github?.context?.payload?.pull_request?.number || 0,
      repo: github.context.repo.repo,
      owner: github.context.repo.owner,
      body: commentBody
    })
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
