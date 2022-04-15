import * as core from '@actions/core'
import * as github from '@actions/github'
import {inspect} from 'util'

const ORG = 'KittyCAD'

async function run(): Promise<void> {
  try {
    const token = core.getInput('token')
    const issueNumber = Number(core.getInput('issue-number'))
    const repo = core.getInput('repository')

    core.debug(`issue: ${issueNumber}, repo: ${repo}`)

    const octokit = github.getOctokit(token)

    const {data: projects} = await octokit.rest.projects.listForOrg({
      org: ORG
    })
    const project = projects.find(({name}) => name === 'All Tasks')

    if (!project) throw new Error("Couldn't get the 'All Tasks' project")

    core.debug(`Project: ${inspect(project)}`)

    const {data: columns} = await octokit.rest.projects.listColumns({
      project_id: project.id
    })
    core.debug(`Columns: ${inspect(columns)}`)

    const column = columns.find(({name}) => name === 'No Status')

    if (!column) throw new Error("The 'No Status' column couldn't be found.")

    const {data: issue} = await octokit.rest.issues.get({
      owner: ORG,
      repo,
      issue_number: issueNumber
    })

    const {data: card} = await octokit.rest.projects.createCard({
      column_id: column.id,
      content_id: issue.id,
      content_type: 'Issue'
    })
    core.debug(`Card: ${inspect(card)}`)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
