import * as core from '@actions/core'
import * as github from '@actions/github'

async function run(): Promise<void> {
  const owner = github.context.repo.owner
  const repo = core.getInput('repo') || github.context.repo.repo
  const token = core.getInput('github-token')
  const gitSha = core.getInput('sha')
  //   const owner = 'KittyCAD'
  //   const repo = 'docs'
  //   const token = process.env.GITHUB_TOKEN
  //   const gitSha = '9a84363538d718843698b3966af4be1fe3e14159'
  const octokit = github.getOctokit(token)
  const {
    data: [deployment]
  } = await octokit.rest.repos.listDeployments({
    owner,
    repo,
    sha: gitSha
  })
  const id = deployment.id
  const {
    data: [deploymentStatuses]
  } = await octokit.rest.repos.listDeploymentStatuses({
    owner,
    repo,
    deployment_id: id
  })
  core.setOutput('targeturl', deploymentStatuses.target_url)
}

run()
