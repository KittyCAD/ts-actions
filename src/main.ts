import * as core from '@actions/core'
import * as github from '@actions/github'
import {inspect} from 'util'

const ORG = 'KittyCAD'
// project number is the int that appears in the project url
// i.e. https://github.com/orgs/KittyCAD/projects/{PROJECT_NUMBER}
const PROJECT_NUMBER = 2

// Github string inputs seem to have a trailing ", breaking the graphQL queries
const sanitise = (str: string): string => str.replace('"', '')

async function run(): Promise<void> {
  try {
    const token = core.getInput('token')
    const issueNodeId = sanitise(core.getInput('issue-node'))
    const projectNumber =
      Number(sanitise(core.getInput('project-number'))) || PROJECT_NUMBER

    const octokit = github.getOctokit(token)

    const projectsResponse: {
      organization: {projectsNext: {nodes: {id: string; number: number}[]}}
    } = await octokit.graphql(
      `
    query{
      organization(login: "${ORG}"){
        projectsNext(first: 20) {
          nodes {
            id
            number
          }
        }
      }
    }
    `
    )
    core.debug(`Project: ${inspect(projectsResponse)}`)

    const projects = projectsResponse?.organization?.projectsNext?.nodes
    if (!projects) throw new Error("Couldn't find any projects")

    const project_id = projects.find(({number}) => number === projectNumber)?.id

    if (!project_id)
      throw new Error(`Couldn't get the #'${projectNumber}' project`)

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
