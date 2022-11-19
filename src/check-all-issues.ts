import * as core from '@actions/core'
import * as github from '@actions/github'
import fsp from 'fs/promises'

main()

async function main() {
  const [token, backLogProjectNumberStr, org] = await Promise.all(
    ['GH_TOKEN', 'PROJECT_NUMBER', 'GH_ORG'].map(getValueFromDotEnvOrGithub)
  )
  const backLogProjectNumber = JSON.parse(backLogProjectNumberStr)
  const octoGraph = github.getOctokit(token).graphql

  const [
    {projectId, fieldId, singleSelectOptionIdTodo, singleSelectOptionIdDone},
    repos
  ] = await Promise.all([
    getProjectV2ItemStatusInfo(octoGraph, org, backLogProjectNumber),
    getRepos(octoGraph)
  ])

  console.log(JSON.stringify(repos, null, 2))

  repos.forEach(async issue => {
    const issues = await getIssues(octoGraph, issue)
    await Promise.all(
      issues.map(async ({id, title, projectsV2, state, url}) => {
        if (projectsV2?.nodes?.length) {
          // already has a project, do nothing
          console.log(`Skipping "${title}":\n .... ${url}`)
          return
        }
        const singleSelectOptionId =
          state === 'OPEN' ? singleSelectOptionIdTodo : singleSelectOptionIdDone
        console.log(`Adding "${title}" to backlog:\n .... ${url}`)
        return addProjectToIssue(octoGraph, {
          projectId,
          issueId: id,
          fieldId,
          singleSelectOptionId
        })
      })
    )
  })
}

async function getRepos(
  octoGraph: any,
  pageInfo: {
    hasNextPage: boolean
    endCursor: string
  } = {hasNextPage: true, endCursor: ''},
  previousRepos: string[] = []
): Promise<string[]> {
  if (!pageInfo.hasNextPage) {
    return previousRepos
  }
  const cursorParam = pageInfo.endCursor ? `after: "${pageInfo.endCursor}"` : ''
  const response: {
    nodes: {name: string}[]
    pageInfo: {
      hasNextPage: boolean
      endCursor: string
    }
  } = (
    await octoGraph(`query {
        organization(login: "test-org-irevdev") {
          name
          repositories(first: 1 ${cursorParam}) {
            nodes {
              name
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }`)
  ).organization.repositories
  const repos = response.nodes
    .filter(({name}) => !name.startsWith('_'))
    .map(({name}) => name)
  return getRepos(octoGraph, response.pageInfo, [...previousRepos, ...repos])
}

interface IssueResponse {
  url: string
  state: string
  id: string
  title: string
  projectsV2: {
    nodes: {
      id: string
      number: number
      title: string
    }[]
  }
}

async function getIssues(
  octoGraph: any,
  repoName: string,
  pageInfo: {
    hasNextPage: boolean
    endCursor: string
  } = {hasNextPage: true, endCursor: ''},
  previousIssues: IssueResponse[] = []
): Promise<IssueResponse[]> {
  if (!pageInfo.hasNextPage) {
    return previousIssues
  }
  const cursorParam = pageInfo.endCursor ? `after: "${pageInfo.endCursor}"` : ''
  const response: {
    nodes: IssueResponse[]
    pageInfo: {
      hasNextPage: boolean
      endCursor: string
    }
  } = (
    await octoGraph(`query {
    repository(name: "${repoName}" owner: "test-org-irevdev") {
      issues(first: 1 ${cursorParam}) {
        nodes {
          url
          state
          id
          title
          projectsV2(first: 50) {
            nodes {
              id
              number
              title
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`)
  ).repository.issues

  return getIssues(octoGraph, repoName, response.pageInfo, [
    ...previousIssues,
    ...response.nodes
  ])
}

async function addProjectToIssue(
  octoGraph: any,
  {
    projectId,
    issueId,
    fieldId,
    singleSelectOptionId
  }: {
    projectId: string
    issueId: string
    fieldId: string
    singleSelectOptionId: string
  }
): Promise<{
  addProjectV2ItemById: {
    item: {id: string}
  }
}> {
  const projectItemAddedToIssue: {
    addProjectV2ItemById: {
      item: {id: string}
    }
  } = await octoGraph(`
  mutation {
    addProjectV2ItemById(input: {projectId: "${projectId}" contentId: "${issueId}"}) {
      item {
        id
      }
    }
  }
  `)
  // console.log(JSON.stringify(projectItemAddedToIssue, null, 2))
  await octoGraph(`
  mutation { 
    updateProjectV2ItemFieldValue(input: {
      projectId: "${projectId}"
      itemId: "${projectItemAddedToIssue?.addProjectV2ItemById?.item?.id}"
      fieldId: "${fieldId}"
      value: {singleSelectOptionId: "${singleSelectOptionId}"}
    }) {
      clientMutationId
      projectV2Item {
        id
      }
    }
  }`)
  // console.log(JSON.stringify(updatedProjectStatus, null, 2));
  return projectItemAddedToIssue
}

async function getValueFromDotEnvOrGithub(name: string): Promise<string> {
  try {
    const lines = (await fsp.readFile('./.env', 'utf-8')).split('\n')
    const line = lines.find((_line: string) => _line.startsWith(name)) || ''
    const value = line
      .split('=')[1]
      .trim()
      .replaceAll("'", '')
      .replaceAll('"', '')
    return value
  } catch (error) {
    const value = core.getInput(name)
    // read failed assume we're running in an action
    return value
  }
}

async function getProjectV2ItemStatusInfo(
  octoGraph: any,
  org: string,
  backLogProjectNumber: number
): Promise<{
  projectId: string
  fieldId: string
  singleSelectOptionIdTodo: string
  singleSelectOptionIdDone: string
}> {
  const {
    organization
  }: {
    organization: {
      projectV2: {
        id: string
        field: {
          id: string
          dataType: string
          options: {
            id: string
            name: string
          }[]
        }
      }
    }
  } = await octoGraph(`query {
    organization(login: "${org}") {
      projectV2(number: ${backLogProjectNumber}) {
        id
        field(name: "Status") {
          ...on ProjectV2SingleSelectField {
            id
            dataType
            options {
              id
              name
            }
          }
        }
      }
    }
  }`)
  const projectId = organization?.projectV2?.id
  const fieldId = organization?.projectV2?.field?.id
  const singleSelectOptionIdTodo =
    organization?.projectV2?.field?.options?.find(
      ({name}) => name.toLocaleLowerCase() === 'todo'
    )?.id || ''
  const singleSelectOptionIdDone =
    organization?.projectV2?.field?.options?.find(
      ({name}) => name.toLocaleLowerCase() === 'done'
    )?.id || ''
  return {
    projectId,
    fieldId,
    singleSelectOptionIdTodo,
    singleSelectOptionIdDone
  }
}
