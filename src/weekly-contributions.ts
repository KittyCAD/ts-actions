import * as core from '@actions/core'
import * as github from '@actions/github'
import {inspect} from 'util'

async function main() {
  const token = core.getInput('github-token')
  const dateStr = core.getInput('date')
  const octokit = github.getOctokit(token)

  const date = dateStr ? new Date(dateStr) : new Date()

  const cutOffDate = new Date(date)
  cutOffDate.setDate(cutOffDate.getDate() - 7)
  const makeInnerPRQuery = (repoName: string) => {
    return `
    ${repoName
      .replaceAll('.', '')
      .replaceAll('-', '')}: repository(name: "${repoName}" owner: "kittycad") {
        pullRequests(first: 50, orderBy: {direction: DESC, field: UPDATED_AT}) {
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
  const makeInnerPRCommentQuery = (repoName: string, PrNumber: number) => {
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
  const makeInnerIssueQuery = (repoName: string) => {
    return `
    ${repoName
      .replaceAll('.', '')
      .replaceAll('-', '')}: repository(name: "${repoName}" owner: "kittycad") {
        issues(first: 50 orderBy: {direction: DESC, field: UPDATED_AT}) {
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
  const makeInnerIssueCommentQuery = (repoName: string, number: number) => {
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
  const innerQueries = getReposNames()
    .map(repoName => makeInnerPRQuery(repoName))
    .join('\n')
  const projectsResponse: {
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
          state: 'OPEN' | 'CLOSED' | 'MERGED'
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
        ${innerQueries}
      }
      `
  )
  const PRGroupedByAuthor: {
    [login: string]: {
      PRs: {
        repo: string
        number: number
        author: string
        url: string
        state: 'OPEN' | 'CLOSED' | 'MERGED'
        title: string
      }[]
      PRComments: any[]
      issuesOpened: any[]
      issuesClosed: any[]
      issuesComments: any[]
    }
  } = {}
  const PRsToGetCommentsFor: {repo: string; PRNum: number}[] = []
  Object.values(projectsResponse).forEach(repo => {
    repo.pullRequests.nodes.forEach(
      ({author, repository, state, url, title, updatedAt, number}) => {
        const login = author.login
        if (login === 'dependabot') return
        if (cutOffDate.valueOf() > new Date(updatedAt).valueOf()) return
        if (!PRGroupedByAuthor[login]) {
          PRGroupedByAuthor[login] = {
            PRs: [],
            PRComments: [],
            issuesOpened: [],
            issuesClosed: [],
            issuesComments: []
          }
        }
        PRGroupedByAuthor[login].PRs.push({
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
        ${PRsToGetCommentsFor.map(({repo, PRNum}) =>
          makeInnerPRCommentQuery(repo, PRNum)
        ).join('\n')}
        }
        `
  )
  const commentGrouping: {
    [key: string]: {
      repo: string
      number: number
      author: string
      url: string
      title: string
    }
  } = {}
  Object.values(commentsResponse).forEach(({pullRequest}) => {
    pullRequest.comments.nodes.forEach(({url, author: commentAuthor}) => {
      if (
        ['codecov', 'dependabot', 'github-actions', 'vercel'].includes(
          commentAuthor.login
        )
      )
        return
      const isCommentingOnOwnPR =
        commentAuthor.login === pullRequest.author.login
      if (isCommentingOnOwnPR) return
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
    if (!PRGroupedByAuthor[comment.author]) {
      PRGroupedByAuthor[comment.author] = {
        PRs: [],
        PRComments: [],
        issuesOpened: [],
        issuesClosed: [],
        issuesComments: []
      }
    }
    PRGroupedByAuthor[comment.author].PRComments.push(comment)
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
          state: 'OPEN' | 'CLOSED'
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
        ${getReposNames().map(makeInnerIssueQuery).join('\n')}
      }
      `
  )
  const IssueTempObject: {
    [key: string]: {
      repo: string
      number: number
      url: string
      title: string
      state: 'OPEN' | 'CLOSED'
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
        if (author.login === 'sync-by-unito') return
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
        state: 'OPEN' | 'CLOSED'
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
            .map(({repo, number}) => makeInnerIssueCommentQuery(repo, number))
            .join('\n')}
        }
        `
  )
  Object.values(issuesCommentsResponse).forEach(({issue}) => {
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

  Object.values(IssueTempObject).forEach(issue => {
    const issueInfo = {
      repo: issue.repo,
      number: issue.number,
      author: issue.creditTo,
      url: issue.url,
      state: issue.state,
      title: issue.title
    }
    if (!PRGroupedByAuthor[issue.creditTo]) {
      PRGroupedByAuthor[issue.creditTo] = {
        PRs: [],
        PRComments: [],
        issuesOpened: [],
        issuesClosed: [],
        issuesComments: []
      }
    }
    if (issue.action === 'commented') {
      PRGroupedByAuthor[issue.creditTo].issuesComments.push(issueInfo)
    } else if (issue.action === 'closed') {
      PRGroupedByAuthor[issue.creditTo].issuesClosed.push(issueInfo)
    } else if (issue.action === 'created') {
      PRGroupedByAuthor[issue.creditTo].issuesOpened.push(issueInfo)
    }
  })

  let markdownOutput = ''
  const rating: {
    [bing in 'MERGED' | 'OPEN' | 'CLOSED']: number
  } = {
    MERGED: 2,
    OPEN: 1,
    CLOSED: 0
  }
  Object.entries(PRGroupedByAuthor).forEach(([login, details]) => {
    markdownOutput += `\n\n### ${loginToName(login)}`
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
        markdownOutput += `\n- ${prEmojiMap[PR.state]} [${PR.repo} / ${
          PR.title
        }](${PR.url})`
      }
    )
    details.PRComments.forEach(PR => {
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
  })
  core.debug(`PRGroupedByAuthor: ${inspect(PRGroupedByAuthor)}`)
  core.setOutput('markdown', markdownOutput)
}

main()

function loginToName(login: string) {
  const loginToNameMap: {[key: string]: string} = {
    brwhale: 'Garrett',
    iterion: 'Adam',
    jessfraz: 'Jess',
    'Irev-Dev': 'Kurt',
    hanbollar: 'Hannah',
    JordanNoone: 'Jordan',
    JBEmbedded: 'JB',
    mansoorsiddiqui: 'Mansoor'
  }
  return loginToNameMap[login] || login
}

function getReposNames() {
  return [
    '.github-private',
    '.github',
    'action-convert-directory',
    'action-install-cli',
    'api-deux',
    'cio',
    'cli',
    'Clowder',
    'community',
    'configs',
    'db',
    'desktop',
    'discord-bots',
    'docs',
    'documentation',
    'Eng',
    'engine-api',
    'engine',
    'executor',
    'Furrture-Planning',
    'graphs',
    'hooks',
    'infra',
    'jordansPersonalLitterbox',
    'kittycad.go',
    'kittycad.py',
    'kittycad.rs',
    'kittycad.ts',
    'litterbox',
    'Media-Brand',
    'mysql-watcher',
    'OldKittyCADApp',
    'payment-tools',
    'PetStore',
    'store',
    'support',
    'third-party-api-clients',
    'ts-actions',
    'website'
  ]
}
