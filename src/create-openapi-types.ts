import * as core from '@actions/core'
import * as github from '@actions/github'
import fsp from 'node:fs/promises'
import {inspect} from 'util'
import openapiTS from "openapi-typescript";

async function run(): Promise<void> {
// async function run() {
  const repo = core.getInput('repo') || github.context.repo.repo
  const path = core.getInput('spec-path')
  const outputPath = core.getInput('def-path')
  const token = core.getInput('github-token')

  // const repo = process.env.REPO || 'api-deux'
  // const path = process.env.SPEC_PATH || 'openapi/api.json'
  // const outputPath = process.env.DEF_PATH || 'openapi-types.ts'
  // const token = process.env.GITHUB_TOKEN

  try {
    const octokit = github.getOctokit(token || '')

    const response = await octokit.rest.repos.getContent({
      owner: 'KittyCAD',
      repo,
      path,
      ref: 'main'
    })
    const specRaw = Buffer.from(
      (response?.data as any)?.content,
      // (response?.data)?.content,
      'base64'
    ).toString('utf8')

    const spec = JSON.parse(specRaw)
    const output = await openapiTS(spec);

    await fsp.writeFile(outputPath, output)
  } catch (e) {
    core.debug(`error: ${inspect(e)}`)
    throw e
  }
}

run()
