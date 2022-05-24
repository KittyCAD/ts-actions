import * as core from '@actions/core'
import * as github from '@actions/github'
import {inspect} from 'util'

async function run(): Promise<void> {
  const owner = github.context.repo.owner
  const repo = core.getInput('repo') || github.context.repo.repo
  const token = core.getInput('github-token')
  const gitSha = core.getInput('sha')
  //   const owner = 'KittyCAD'
  //   const repo = 'docs'
  //   const token = process.env.GITHUB_TOKEN
  //   const gitSha = '9a84363538d718843698b3966af4be1fe3e14159'
  try {
    const octokit = github.getOctokit(token)
    const {
      data: [deployment]
    } = await octokit.rest.repos.listDeployments({
      owner,
      repo,
      sha: gitSha
    })
    core.debug(`deployment: ${inspect(deployment)}`)
    const id = deployment.id
    const {
      data: [deploymentStatuses]
    } = await octokit.rest.repos.listDeploymentStatuses({
      owner,
      repo,
      deployment_id: id
    })
    core.debug(`deploymentStatuses: ${inspect(deploymentStatuses)}`)
    core.setOutput('targeturl', deploymentStatuses.target_url)
  } catch (e) {
    core.debug(`error: ${inspect(e)}`)
    throw e
  }
}

run()
