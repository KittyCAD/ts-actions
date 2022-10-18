import * as core from '@actions/core'
import * as github from '@actions/github'
import {inspect} from 'util'

const ignoreRepos = ['jordansPersonalLitterbox']

async function main(): Promise<void> {
  const token = core.getInput('github-token')
  //   const token = process.env.GITHUB_TOKEN
  const octokit = github.getOctokit(token)

  const repoRulesQuery: {
    organization: {
      repositories: {
        nodes: {
          id: string
          name: string
          branchProtectionRules: {
            nodes: {
              requiresApprovingReviews: boolean
              dismissesStaleReviews: boolean
              allowsForcePushes: boolean
              pattern: string
            }[]
          }
          mergeCommitAllowed: boolean
          rebaseMergeAllowed: boolean
          squashMergeAllowed: boolean
        }[]
      }
    }
  } = await octokit.graphql(
    `
    query {
        organization(login: "KittyCAD") {
        repositories(first: 100){ 
          nodes {
              id
              name
              branchProtectionRules(first: 50) {
                nodes {
                  requiresApprovingReviews
                  # requiredApprovingReviewCount
                  dismissesStaleReviews
                  allowsForcePushes
                  pattern
                }
              }
              mergeCommitAllowed
              rebaseMergeAllowed
              squashMergeAllowed
          }
        }
      }
    }
      `
  )
  const mergeRuleMessage = [
    '### Bad merge rules',
    'Merge rules for the repo should be:',
    'mergeCommitAllowed: `false`, rebaseMergeAllowed: `false`, squashMergeAllowed: `true`',
    'The following repos have different merge rule settings:',
    ''
  ]
  const initialMergeRuleMessageLength = mergeRuleMessage.length

  const protectedBranchMessage = [
    '### Bad protected branch rules',
    'The `main` branch should be protected, requiring pull requests',
    "The following repos don't have the correct settings for `main`:",
    ''
  ]
  const initialProtectedBranchMessageLength = protectedBranchMessage.length
  const repos: string[] = []
  repoRulesQuery.organization.repositories.nodes.forEach(repo => {
    const isPrivatePrivateRepo = repo.name.startsWith('_')
    if (isPrivatePrivateRepo) {
      repos.push(repo.name)
    }
    const hasCorrectMergeRules =
      !repo.mergeCommitAllowed &&
      !repo.rebaseMergeAllowed &&
      repo.squashMergeAllowed
    if (
      !hasCorrectMergeRules &&
      !ignoreRepos.includes(repo.name) &&
      isPrivatePrivateRepo
    ) {
      mergeRuleMessage.push(
        `- [ ] [${repo.name}](https://github.com/KittyCAD/${repo.name}/settings)`
      )
    } else {
      console.log(`${repo.name} good merge rules`)
    }

    const isMainBranchProtected = repo.branchProtectionRules.nodes.some(
      ({allowsForcePushes, pattern, requiresApprovingReviews}) => {
        return (
          pattern === 'main' && !allowsForcePushes && !requiresApprovingReviews
        )
      }
    )
    if (
      !isMainBranchProtected &&
      !ignoreRepos.includes(repo.name) &&
      isPrivatePrivateRepo
    ) {
      protectedBranchMessage.push(
        `- [ ] [${repo.name}](https://github.com/KittyCAD/${repo.name}/settings/branches)`
      )
    } else {
      console.log(`${repo.name} has main protected`)
    }
  })

  const dependabotYmlFetches = await Promise.all(
    repos.map(async repo => {
      try {
        await octokit.rest.repos.getContent({
          owner: 'KittyCAD',
          repo,
          path: '.github/dependabot.yml'
        })
        //   const content = Buffer(response.data.content, 'base64').toString('ascii')
        return {repo, fileMissing: false}
      } catch {
        return {repo, fileMissing: true}
      }
    })
  )
  const dependabotBulletMessage = [
    '### Missing dependabot setup',
    'All repos should have `.github/dependabot.yml` files',
    'They are missing in the following:',
    ''
  ]
  const initialDependabotBulletMessageLength = dependabotBulletMessage.length

  dependabotYmlFetches.forEach(value => {
    if (value.fileMissing && !ignoreRepos.includes(value.repo)) {
      dependabotBulletMessage.push(
        `- [ ] [${value.repo}](https://github.com/KittyCAD/${value.repo}/new/main/.github)`
      )
    }
  })

  const mergeRuleMessageSection =
    initialMergeRuleMessageLength < mergeRuleMessage.length
      ? mergeRuleMessage.join('\n')
      : ''
  const protectedBranchMessageSection =
    initialProtectedBranchMessageLength < protectedBranchMessage.length
      ? protectedBranchMessage.join('\n')
      : ''
  const dependabotBulletMessageSection =
    initialDependabotBulletMessageLength < dependabotBulletMessage.length
      ? dependabotBulletMessage.join('\n')
      : ''
  const issueBody = [
    mergeRuleMessageSection,
    protectedBranchMessageSection,
    dependabotBulletMessageSection
  ].join('\n\n')
  const isProblems =
    mergeRuleMessageSection ||
    protectedBranchMessageSection ||
    dependabotBulletMessageSection
  core.setOutput('isproblems', isProblems)
  core.setOutput('body', issueBody)
}

main()
