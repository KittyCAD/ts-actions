import { globby } from 'globby'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as filestack from 'filestack-js'
import { readFile } from 'node:fs/promises'

async function run() {
  try {
    const token = core.getInput('token')
    const filestackKey = 'AAEy5aY8TKG4J5K84Rn8iz' 
    const client = filestack.init(filestackKey)
    const paths = await globby('**/*diff.png')
    const uploadPromises = paths.map(async path => {
        const file = await readFile(path)
        const response = await client.upload(file)
        return `![${path}](${response.url})`
    })
    const mdLines = await Promise.all(uploadPromises)

    const commentBody = [
        '### Snapshot Diffs\n',
        ...mdLines,
    ].join('\n')
    console.log(commentBody)
    const octokit = github.getOctokit(token)

    await octokit.rest.issues.createComment({
        issue_number: github.context.payload.pull_request.number,
        repo: github.context.repo.repo,
        owner: github.context.repo.owner,
        body: commentBody
      });

  } catch (error) {}
}

run()
