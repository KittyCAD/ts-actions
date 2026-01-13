import * as core from '@actions/core'
import * as github from '@actions/github'
import { OctokitResponse } from '@octokit/types'
import { inspect } from 'util'
import { setTimeout } from 'timers/promises'

type IssueStates = 'OPEN' | 'CLOSED'
type PRStates = IssueStates | 'MERGED'

let loginToNameMap: { [key: string]: string } = {}
let ignoreSummariesLoginArray: string[] = []
let ignoreReposArray: string[] = []

async function main() {
  const token = core.getInput('github-token')
  const dateStr = core.getInput('date')
  const daysInReportStr = core.getInput('days-in-report') || '14'
  const markdownPrefix = core.getInput('markdown-prefix') || ''
  loginToNameMap = JSON.parse(core.getInput('login-to-name-map')) || {}
  ignoreSummariesLoginArray =
    JSON.parse(core.getInput('ignore-summaries-login-array')) ||
    new Array<string>()
  ignoreReposArray =
    JSON.parse(core.getInput('ignore-repos-array')) ||
    new Array<string>()

  const octokit = github.getOctokit(token)

  const date = dateStr ? new Date(dateStr) : new Date()
  const daysInReport = parseInt(daysInReportStr)

  const cutOffDate = new Date(date)
  cutOffDate.setDate(cutOffDate.getDate() - daysInReport)

  const { data } = await octokit.rest.repos.listForOrg({
    org: 'KittyCAD',
    sort: 'pushed',
    per_page: 100
  })
  await setTimeout(1000)
  const repos = data.map(({ name }) => name).filter(name => !name.startsWith('_') || !ignoreReposArray.includes(name))

  interface PRGroupedByAuthor {
    [login: string]: {
      PRs: {
        repo: string
        number: number
        author: string
        url: string
        state: PRStates
        title: string
      }[]
      PRComments: any[]
      issuesOpened: any[]
      issuesClosed: any[]
      issuesComments: any[]
    }
  }
  const prGroupedByAuthor: PRGroupedByAuthor = {}
  const PRsToGetCommentsFor: { repo: string; PRNum: number }[] = []

  // Some repos will have tons of information compared to others. Sometimes
  // even 1 will have enough to start hitting rate limits. Rather than see the
  // script die, let's lessen the impact of requests.
  const chunkSize = 2
  for (let i = 0; i < repos.length; i += chunkSize) {
    const reposChunk = repos.slice(i, i + chunkSize)
    const prsResponse: {
      [repoName: string]: {
        pullRequests: {
          nodes: {
            author: {
              login: string
            }
            repository: {
              name: string
              id: string
            }
            state: PRStates
            number: number
            title: string
            url: string
            updatedAt: string
          }[]
        }
      }
    } = await octokit.graphql(
      `
        query{
          ${reposChunk.map(makeInnerPRQuery).join('\n')}
        }
        `
    )
    await setTimeout(1000)
    Object.values(prsResponse).forEach(repo => {
      repo.pullRequests.nodes.forEach(
        ({ author, repository, state, url, title, updatedAt, number }) => {
          if (ignoreReposArray.includes(repository.name)) {
            return
          }
          const login = author.login
          if (login === 'dependabot') return
          if (cutOffDate.valueOf() > new Date(updatedAt).valueOf()) return
          if (!prGroupedByAuthor[login]) {
            prGroupedByAuthor[login] = {
              PRs: [],
              PRComments: [],
              issuesOpened: [],
              issuesClosed: [],
              issuesComments: []
            }
          }
          prGroupedByAuthor[login].PRs.push({
            repo: repository.name,
            number,
            author: author.login,
            url,
            state,
            title
          })

          PRsToGetCommentsFor.push({
            repo: repository.name,
            PRNum: number
          })
        }
      )
    })
  }

  const commentsResponse: {
    [repo: string]: {
      pullRequest: {
        author: {
          login: string
        }
        repository: {
          name: string
        }
        title: string
        number: number
        comments: {
          nodes: {
            url: string
            author: {
              login: string
            }
            number: number
          }[]
        }
      }
    }
  } = await octokit.graphql(
    `
        query{
        ${PRsToGetCommentsFor.map(({ repo, PRNum }) =>
      makeInnerPRCommentQuery(repo, PRNum)
    ).join('\n')}
        }
        `
  )
  await setTimeout(1000)
  const commentGrouping: {
    [key: string]: {
      repo: string
      number: number
      author: string
      url: string
      title: string
    }
  } = {}
  Object.values(commentsResponse).forEach(({ pullRequest }) => {
    pullRequest.comments.nodes.forEach(({ url, author: commentAuthor }) => {
      if (
        ['codecov', 'dependabot', 'github-actions', 'vercel'].includes(
          commentAuthor.login
        )
      )
        return
      const isCommentingOnOwnPR =
        commentAuthor.login === pullRequest.author.login
      if (isCommentingOnOwnPR) return

      if (ignoreReposArray.includes(pullRequest.repository.name)) {
        return
      }

      commentGrouping[
        `${commentAuthor.login}-${pullRequest.repository.name}-${pullRequest.number}`
      ] = {
        repo: pullRequest.repository.name,
        number: pullRequest.number,
        author: commentAuthor.login,
        url,
        title: pullRequest.title
      }
    })
  })

  Object.values(commentGrouping).forEach(comment => {
    if (ignoreReposArray.includes(comment.repo)) {
      return
    }
    if (!prGroupedByAuthor[comment.author]) {
      prGroupedByAuthor[comment.author] = {
        PRs: [],
        PRComments: [],
        issuesOpened: [],
        issuesClosed: [],
        issuesComments: []
      }
    }
    prGroupedByAuthor[comment.author].PRComments.push(comment)
  })

  const issuesResponse: {
    [repoName: string]: {
      issues: {
        nodes: {
          number: number
          title: string
          url: string
          author: {
            login: string
          }
          createdAt: string
          updatedAt: string
          assignees: {
            nodes: {
              login: string
            }[]
          }
          state: IssueStates
          closedAt: string
          repository: {
            name: string
          }
        }[]
      }
    }
  } = await octokit.graphql(
    `
      query{
        ${repos.map(makeInnerIssueQuery).join('\n')}
      }
      `
  )
  await setTimeout(1000)
  const IssueTempObject: {
    [key: string]: {
      repo: string
      number: number
      url: string
      title: string
      state: IssueStates
      creditTo: string
      action: 'created' | 'commented' | 'closed'
    }
  } = {}
  const IssueToGetCommentsOn: {
    [key: string]: {
      repo: string
      number: number
    }
  } = {}
  Object.values(issuesResponse).forEach(pullRequest => {
    pullRequest.issues.nodes.forEach(
      ({
        title,
        url,
        author,
        createdAt,
        updatedAt,
        assignees,
        state,
        closedAt,
        repository,
        number
      }) => {
        if (
          author.login === 'sync-by-unito' ||
          author.login === 'github-actions'
        )
          return
        if (ignoreReposArray.includes(repository.name))
          return
        const issueInfo = {
          repo: repository.name,
          url,
          title,
          state,
          number
        }

        const isCreatedThisWeek =
          state === 'OPEN' &&
          cutOffDate.valueOf() < new Date(createdAt).valueOf()
        if (isCreatedThisWeek) {
          IssueTempObject[`${author.login}-${issueInfo.repo}-${number}`] = {
            ...issueInfo,
            creditTo: author.login,
            action: 'created'
          }
        }

        const isClosedThisWeek =
          state === 'CLOSED' &&
          cutOffDate.valueOf() < new Date(closedAt).valueOf()
        if (isClosedThisWeek) {
          // note: if it's created by one of the assignees and it was created the same week it was closed,
          // then the created event is stomped and that's intentional
          assignees.nodes.forEach(node => {
            IssueTempObject[`${node.login}-${issueInfo.repo}-${number}`] = {
              ...issueInfo,
              creditTo: node.login,
              action: 'closed'
            }
          })
        }

        const isUpdatedThisWeek =
          cutOffDate.valueOf() < new Date(updatedAt).valueOf()
        if (isUpdatedThisWeek) {
          IssueToGetCommentsOn[`${issueInfo.repo}-${number}`] = {
            repo: issueInfo.repo,
            number
          }
        }
      }
    )
  })

  const issuesCommentsResponse: {
    [repo: string]: {
      issue: {
        repository: {
          name: string
        }
        number: number
        url: string
        title: string
        state: IssueStates
        comments: {
          nodes: {
            updatedAt: string
            author: {
              login: string
            }
          }[]
        }
      }
    }
  } = await octokit.graphql(
    `
      query{
          ${Object.values(IssueToGetCommentsOn)
      .map(({ repo, number }) => makeInnerIssueCommentQuery(repo, number))
      .join('\n')}
        }
        `
  )
  await setTimeout(1000)
  Object.values(issuesCommentsResponse).forEach(({ issue }) => {
    if (ignoreReposArray.includes(issue.repository.name)) {
      return
    }
    issue.comments.nodes.forEach(comment => {
      if (cutOffDate.valueOf() > new Date(comment.updatedAt).valueOf()) return
      if (
        IssueTempObject[
        `${comment.author.login}-${issue.repository.name}-${issue.number}`
        ]
      ) {
        // closed or created action already exists, don't override with comment
        return
      }
      IssueTempObject[
        `${comment.author.login}-${issue.repository.name}-${issue.number}`
      ] = {
        repo: issue.repository.name,
        url: issue.url,
        title: issue.title,
        state: issue.state,
        number: issue.number,
        creditTo: comment.author.login,
        action: 'commented'
      }
    })
  })
  await setTimeout(1000)

  Object.values(IssueTempObject).forEach(issue => {
    if (ignoreReposArray.includes(issue.repo)) {
      return
    }
    const issueInfo = {
      repo: issue.repo,
      number: issue.number,
      author: issue.creditTo,
      url: issue.url,
      state: issue.state,
      title: issue.title
    }
    if (!prGroupedByAuthor[issue.creditTo]) {
      prGroupedByAuthor[issue.creditTo] = {
        PRs: [],
        PRComments: [],
        issuesOpened: [],
        issuesClosed: [],
        issuesComments: []
      }
    }
    if (issue.action === 'commented') {
      prGroupedByAuthor[issue.creditTo].issuesComments.push(issueInfo)
    } else if (issue.action === 'closed') {
      prGroupedByAuthor[issue.creditTo].issuesClosed.push(issueInfo)
    } else if (issue.action === 'created') {
      prGroupedByAuthor[issue.creditTo].issuesOpened.push(issueInfo)
    }
  })

  let markdownOutput = markdownPrefix

  const rating: {
    [key in PRStates]: number
  } = {
    MERGED: 2,
    OPEN: 1,
    CLOSED: 0
  }
  const processAuthorGroups =
    (shouldPromptSummary = false) =>
      ([login, details]: [string, PRGroupedByAuthor[string]]) => {
        markdownOutput += `\n\n## ${loginToName(login)}`
        if (shouldPromptSummary) {
          markdownOutput += `\n\n#### Human Summary`
          markdownOutput += `\n- _Add your summary here_`
        }
        if (details.PRs.length || details.PRComments.length) {
          markdownOutput += `\n\n#### PR activity`
        }
        details.PRs.sort((a, b) => rating[b.state] - rating[a.state]).forEach(
          PR => {
            const prEmojiMap = {
              MERGED: '💅 Merged .....',
              OPEN: '⏳ Open ........',
              CLOSED: '🛑 Closed ......'
            }
            if (ignoreReposArray.includes(PR.repo)) {
              return
            }
            markdownOutput += `\n- ${prEmojiMap[PR.state]} [${PR.repo} / ${PR.title
              }](${PR.url})`
          }
        )
        details.PRComments.forEach(PR => {
          if (ignoreReposArray.includes(PR.repo)) {
            return
          }
          markdownOutput += `\n- 📝 Comment . [${PR.repo} / ${PR.title}](${PR.url})`
        })

        if (
          details.issuesClosed.length ||
          details.issuesOpened.length ||
          details.issuesComments.length
        ) {
          markdownOutput += `\n\n#### Issue activity`
        }
        details.issuesClosed.forEach(issue => {
          markdownOutput += `\n- ✅ Closed ...... [${issue.repo} / ${issue.title}](${issue.url})`
        })
        details.issuesOpened.forEach(issue => {
          markdownOutput += `\n- ⏳ Open ........ [${issue.repo} / ${issue.title}](${issue.url})`
        })
        details.issuesComments.forEach(issue => {
          markdownOutput += `\n- 📝 Comment . [${issue.repo} / ${issue.title}](${issue.url})`
        })
      }
  const orderedContributors = Object.entries(prGroupedByAuthor).sort(
    ([loginA], [loginB]) => (loginToName(loginA) > loginToName(loginB) ? 1 : -1)
  )

  const noSummariesNeeded = ignoreSummariesLoginArray
  const summaryDevs = Object.keys(loginToNameMap)
  const devContributors = orderedContributors.filter(
    ([login]) =>
      summaryDevs.includes(login) && !noSummariesNeeded.includes(login)
  )
  const nonDevContributors = orderedContributors.filter(
    ([login]) =>
      noSummariesNeeded.includes(login) ||
      (!summaryDevs.includes(login) && login !== 'org-projects-app')
  )

  devContributors.forEach(processAuthorGroups(true))
  markdownOutput += `\n\n<br/>\n\n -- **Other Contributors** --`
  nonDevContributors.forEach(processAuthorGroups())

  core.debug(`PRGroupedByAuthor: ${inspect(prGroupedByAuthor)}`)
  core.setOutput('markdown', markdownOutput)
}

main()

function loginToName(login: string): string {
  return loginToNameMap[login] || login
}

function makeInnerPRQuery(repoName: string) {
  return `
  ${repoName
      .replaceAll('.', '')
      .replaceAll('-', '')}: repository(name: "${repoName}" owner: "kittycad") {
      pullRequests(first: 100, orderBy: {direction: DESC, field: UPDATED_AT}) {
        nodes {
          repository {
            name
            id
          }
          number
          url
          title
          id
          updatedAt
          state
          author {
            login
          }
        }
      }
  }
  `
}
function makeInnerPRCommentQuery(repoName: string, PrNumber: number) {
  return `
  ${repoName
      .replaceAll('.', '')
      .replaceAll(
        '-',
        ''
      )}${PrNumber}: repository(name: "${repoName}" owner: "kittycad") {
  pullRequest(number: ${PrNumber}) {
        repository {
          name
        }
        number
        title
        author {
          login
        }
        comments(first: 20 orderBy: {direction: DESC, field: UPDATED_AT}) {
          nodes {
            url
            author {
              login
            }
          }
        }
      }
  }
  `
}
function makeInnerIssueQuery(repoName: string) {
  return `
  ${repoName
      .replaceAll('.', '')
      .replaceAll('-', '')}: repository(name: "${repoName}" owner: "kittycad") {
      issues(first: 100 orderBy: {direction: DESC, field: UPDATED_AT}) {
        nodes {
          number
          title
          url
          author {
            login
          }
          createdAt
          updatedAt
          assignees(first: 5) {
            nodes {
              login
            }
          }
          state
          closedAt
          repository {
              name
          }
        }
      }
  }
  `
}
function makeInnerIssueCommentQuery(repoName: string, number: number) {
  return `
  ${repoName
      .replaceAll('.', '')
      .replaceAll(
        '-',
        ''
      )}${number}: repository(name: "${repoName}" owner: "kittycad") {
      issue(number: ${number}) {
        title
        number
        repository {
          name
        }
        state
        url
        comments(first: 20 orderBy: {direction: DESC, field: UPDATED_AT}) {
          nodes {
            updatedAt
            author {
              login
            }
          }
        }
      }
  }
  `
}
