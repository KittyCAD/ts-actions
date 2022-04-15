import * as core from '@actions/core'
import * as github from '@actions/github'
import {inspect} from 'util'

const ORG = 'KittyCAD'
const PROJECT_NAME = 'All Tasks'

// Github string inputs seem to have a trailing ", breaking the graphQL queries
const sanitise = (str: string): string => str.replace('"', '')

async function run(): Promise<void> {
  try {
    const token = core.getInput('token')
    const issueNodeId = sanitise(core.getInput('issue-node'))

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

    const project_id = projects.find(({title}) => title === PROJECT_NAME)?.id

    if (!project_id)
      throw new Error(`Couldn't get the '${PROJECT_NAME}' project`)

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
