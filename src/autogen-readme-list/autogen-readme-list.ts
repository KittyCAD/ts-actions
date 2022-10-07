import * as core from '@actions/core'
import * as github from '@actions/github'
import fsp from 'node:fs/promises'
import {inspect} from 'util'

async function reWriteMarkdown(token: string, path: string) {
  const octokit = github.getOctokit(token)
  const markdown = await fsp.readFile(path, 'ascii')
  console.log(markdown)
  const lines = markdown.split('\n')
  const tagsMap: {[tag: string]: {repo: string; url: string}[]} = {}

  lines.forEach(line => {
    if (line.includes('start-autogen-list')) {
      const tag = (line.match(/tag=(.+)\s-->/) || [])[1]
      tagsMap[tag] = []
    }
  })

  const repoTopicResponse: {
    organization: {
      repositories: {
        nodes: {
          name: string
          url: string
          repositoryTopics: {
            nodes: {
              topic: {
                name: string
              }
            }[]
          }
        }[]
      }
    }
  } = await octokit.graphql(
    `
        query {
            organization(login: "KittyCAD") {
            repositories(first: 50){ 
              nodes {
                name
                url
                repositoryTopics(first: 10) {
					        nodes {
                    topic {
                      name
                    }
                  }
                }
              }
            }
          }
        }
          `
  )

  // loop over repositories
  repoTopicResponse.organization.repositories.nodes.forEach(repo => {
    // loop over topics
    repo.repositoryTopics.nodes.forEach(({topic}) => {
      // check if topic is in tagsMap
      if (topic.name in tagsMap) {
        // add repo to tagsMap
        tagsMap[topic.name].push({
          repo: repo.name,
          url: repo.url
        })
      }
    })
  })

  let newMarkdown = markdown
  for (const [tag, repos] of Object.entries(tagsMap)) {
    const regExTemplate = `<!--\\sstart-autogen-list\\stag=(${tag})\\s-->([\\S\\s])*?<!--\\send-autoGen-list\\s-->`
    const regEx = RegExp(regExTemplate, 'gim')
    const newLines = repos
      .sort((a, b) => (a.repo > b.repo ? 1 : -1))
      .map(({url, repo}) => `- [${repo}](${url})`)
    newLines.unshift(`<!-- start-autogen-list tag=${tag} -->`)
    newLines.push('<!-- end-autogen-list -->')

    newMarkdown = newMarkdown.replace(regEx, newLines.join('\n'))
  }
  core.debug(`tagsMap: ${inspect(tagsMap)}`)
  core.debug(`markdown: ${inspect(newMarkdown)}`)

  fsp.writeFile('./src/process-readme/demo-readme.md', newMarkdown)
}

function main() {
  const token = core.getInput('github-token')
  const path = core.getInput('path')
  reWriteMarkdown(token, path)
}

main()
