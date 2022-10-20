import * as core from '@actions/core'
import * as github from '@actions/github'
import {inspect} from 'util'

async function main(): Promise<void> {
  const token = core.getInput('github-token')
  const ignoreRepos = JSON.parse(core.getInput('ignore-repos') || '[]')
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

  interface Info {
    showMessage: boolean
    overallMessage: string
    fixedMessage: string
    fixedList: string[]
    errorHeaderMessage: string
    errorList: string[]
  }

  const mergeRuleInfo: Info = {
    showMessage: false,
    overallMessage: [
      '### Bad merge rules',
      'Merge rules for the repo should be:',
      'mergeCommitAllowed: `false`, rebaseMergeAllowed: `false`, squashMergeAllowed: `true`'
    ].join('\n'),
    fixedMessage: 'The following were fixed',
    fixedList: [],
    errorHeaderMessage: 'Unable to fix to following:',
    errorList: []
  }

  const protectedBranchInfo: Info = {
    showMessage: false,
    overallMessage: [
      '### Bad protected branch rules',
      'The `main` branch should be protected, requiring pull requests'
    ].join('\n'),
    fixedMessage: 'The following were fixed',
    fixedList: [],
    errorHeaderMessage: 'Unable to fix to following:',
    errorList: []
  }
  const repos: string[] = []
  await Promise.all(
    repoRulesQuery.organization.repositories.nodes.map(async repo => {
      const hasCorrectMergeRules =
        !repo.mergeCommitAllowed &&
        !repo.rebaseMergeAllowed &&
        repo.squashMergeAllowed
      if (!hasCorrectMergeRules && !ignoreRepos.includes(repo.name)) {
        mergeRuleInfo.showMessage = true
        try {
          await octokit.rest.repos.update({
            owner: 'KittyCAD',
            repo: repo.name,
            allow_merge_commit: false,
            allow_rebase_merge: false,
            allow_squash_merge: true,
            use_squash_pr_title_as_default: true,
            squash_merge_commit_title: 'PR_TITLE'
          })
          mergeRuleInfo.fixedList.push(
            `- [${repo.name}](https://github.com/KittyCAD/${repo.name})`
          )
        } catch (error) {
          mergeRuleInfo.errorList.push(
            `- [${repo.name}](https://github.com/KittyCAD/${repo.name})`
          )
        }
      } else {
        console.log(`${repo.name} good merge rules`)
      }
      let isMainBranchProtected = false
      let canFetchSettings = false
      let settingsData: any = {}
      try {
        const {data} = await octokit.rest.repos.getBranchProtection({
          repo: repo.name,
          owner: 'KittyCAD',
          branch: 'main'
        })
        isMainBranchProtected =
          !!data.required_pull_request_reviews &&
          !!data.required_pull_request_reviews
            .required_approving_review_count &&
          data.required_pull_request_reviews.required_approving_review_count >=
            0
        canFetchSettings = true
        settingsData = data
        const userRestrictions = data.restrictions?.users
          .map(user => user.login || '')
          .filter(Boolean)
        const teamsRestrictions = data.restrictions?.teams
          .map(team => team.slug || '')
          .filter(Boolean)
        const appsRestrictions = data.restrictions?.apps
          .map(app => app.slug || '')
          .filter(Boolean)
        settingsData.restrictions =
          userRestrictions || teamsRestrictions || appsRestrictions
            ? {
                users: userRestrictions,
                teams: teamsRestrictions,
                apps: appsRestrictions
              }
            : null
        const statusChecksStrict = data.required_status_checks?.strict
        const statusChecksContexts = data.required_status_checks?.contexts
        const statusChecks = data.required_status_checks?.checks.map(check => ({
          context: check.context,
          app_id: check.app_id
        }))
        const requiredStatusChecks = data.required_status_checks
          ? {
              strict: statusChecksStrict,
              contexts: statusChecksContexts,
              checks: statusChecks
            }
          : null
        settingsData.required_status_checks = requiredStatusChecks
      } catch (error) {
        isMainBranchProtected = false
      }
      if (!canFetchSettings) {
        protectedBranchInfo.showMessage = true
        protectedBranchInfo.errorList.push(
          `- [${repo.name}](https://github.com/KittyCAD/${repo.name})`
        )
      } else if (!isMainBranchProtected && !ignoreRepos.includes(repo.name)) {
        protectedBranchInfo.showMessage = true
        try {
          await octokit.rest.repos.updateBranchProtection({
            owner: 'KittyCAD',
            repo: repo.name,
            branch: 'main',
            required_pull_request_reviews: {
              required_approving_review_count: 0
            },
            enforce_admins: settingsData?.enforce_admins?.enabled,
            required_status_checks: settingsData?.required_status_checks,
            restrictions: settingsData?.restrictions
          })
          protectedBranchInfo.fixedList.push(
            `- [${repo.name}](https://github.com/KittyCAD/${repo.name})`
          )
        } catch (error) {
          protectedBranchInfo.errorList.push(
            `- [${repo.name}](https://github.com/KittyCAD/${repo.name})`
          )
        }
      } else {
        console.log(`${repo.name} has main protected`)
      }
    })
  )

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

  const mergeRuleMessageSection = mergeRuleInfo.showMessage
    ? [
        mergeRuleInfo.overallMessage,
        mergeRuleInfo.fixedList.length
          ? [mergeRuleInfo.fixedMessage, ...mergeRuleInfo.fixedList].join('\n')
          : '',
        mergeRuleInfo.errorList.length
          ? [mergeRuleInfo.errorHeaderMessage, ...mergeRuleInfo.errorList].join(
              '\n'
            )
          : ''
      ].join('\n')
    : ''

  const protectedBranchMessageSection = protectedBranchInfo.showMessage
    ? [
        protectedBranchInfo.overallMessage,
        protectedBranchInfo.fixedList.length
          ? [
              protectedBranchInfo.fixedMessage,
              ...protectedBranchInfo.fixedList
            ].join('\n')
          : '',
        protectedBranchInfo.errorList.length
          ? [
              protectedBranchInfo.errorHeaderMessage,
              ...protectedBranchInfo.errorList
            ].join('\n')
          : ''
      ].join('\n')
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

  core.setOutput('isproblems', !!isProblems)
  core.setOutput('body', issueBody)
}

main()
