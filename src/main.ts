import * as core from '@actions/core'
import * as github from '@actions/github'
import {inspect} from 'util'

const ORG = 'KittyCAD'

async function run(): Promise<void> {
  try {
    const token = core.getInput('token')
    const issueNodeId = core.getInput('issue-node')
    const repo = core.getInput('repository')

    core.debug(`issue: ${issueNodeId}, repo: ${repo}`)

    const octokit = github.getOctokit(token)

    const projectsReponse: {
      organization: {projectsNext: {nodes: {id: string; title: string}[]}}
    } = await octokit.graphql(
      `
    query{
      organization(login: "${ORG}"){
        projectsNext(first: 20) {
          nodes {
            id
            title
          }
        }
      }
    }
    `
    )
    core.debug(`Project: ${inspect(projectsReponse)}`)

    const projects = projectsReponse?.organization?.projectsNext?.nodes
    if (!projects) throw new Error("Couldn't find any projects")

    const project_id = projects.find(({title}) => title === 'All Tasks')?.id

    if (!project_id) throw new Error("Couldn't get the 'All Tasks' project")

    core.debug(`Project: ${inspect(project_id)}`)

    const mutationResponse: {
      addProjectNextItem: {projectNextItem: {id: string}}
    } = await octokit.graphql(
      `
      mutation {
        addProjectNextItem(input: {projectId: "${project_id}" contentId: "${issueNodeId}"}) {
          projectNextItem {
            id
          }
        }
      }
    `
    )

    core.debug(inspect(mutationResponse))

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
