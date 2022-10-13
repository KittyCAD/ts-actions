import * as core from '@actions/core'
import * as github from '@actions/github'
import fetch, {Headers} from 'node-fetch';
import fsp from 'node:fs/promises'
import {inspect} from 'util'

const re = /tskey-(?:auth-)?(?<keyID>.+)-.*/

async function run(): Promise<void> {
  const token = core.getInput('token')
  const tsAPIKey = core.getInput('ts-api-key')
  const tailnet = core.getInput('tailnet')
  const filePath = core.getInput('tfvars-path')
  const jsonKey = core.getInput('tfvars-key')
  const maximumKeyAgeInDays = core.getInput('maximum-key-age-in-days')

  const maximumKeyAgeInMillis = parseInt(maximumKeyAgeInDays) * 24 * 3600 * 1000
  const newKeyURL = `https://api.tailscale.com/api/v2/tailnet/${tailnet}/keys`
  const headers = new Headers({
    'Authorization': 'Basic ' + Buffer.from(tsAPIKey + ":").toString('base64'),
  })

  core.info(`Attempting to rotate any key older than ${maximumKeyAgeInDays} days`)

  try {
    const tfvarsContents = await fsp.readFile(filePath, 'utf8')
    var tfvarsJSON = JSON.parse(tfvarsContents)
    const currentMachineKey = tfvarsJSON[jsonKey]

    const matches = currentMachineKey.match(re)
    if (matches === null) {
      core.setFailed(`Current machine key is not in a valid format`)
      return
    }
    const currentKeyID = matches[1]
    const currentKeyURL = `${newKeyURL}/${currentKeyID}`

    const currentKeyResponse = await fetch(currentKeyURL, {headers: headers})
    if (!currentKeyResponse.ok) {
      core.setFailed(`Unable to fetch info about key ${currentKeyID}`)
      return
    }
    const currentKeyData = (await currentKeyResponse.json()) as any
    const keyCreatedAt = currentKeyData.created
    const keyAgeInMillis = Date.now() - Date.parse(keyCreatedAt)
    // If we're not about to expire, log and continue
    if (keyAgeInMillis < maximumKeyAgeInMillis) {
      core.info(`Key is not about to expire (last updated ${keyCreatedAt})`)
      return
    }

    core.info(`Key is about to expire (last updated ${keyCreatedAt}), creating and uploading a new key.`)

    // Reuse the existing keys capabilities
    const newKeyCapabilities = { capabilities: currentKeyData.capabilities }
    const newKeyResponse = await fetch(newKeyURL, {headers: headers, method: 'POST', body: JSON.stringify(newKeyCapabilities)})
    if (!newKeyResponse.ok) {
      core.setFailed(`Unable to create a new Tailscale machine key`)
      return
    }
    const newKeyData = (await newKeyResponse.json()) as any
    core.info(`Generated a new key, ID: ${newKeyData.id}`)

    tfvarsJSON[jsonKey] = newKeyData.key
    fsp.writeFile(filePath, JSON.stringify(tfvarsJSON))
    core.info(`Stored new key in ${filePath}: ${jsonKey}`)
  } catch (e) {
    core.debug(`error: ${inspect(e)}`)
    throw e
  }
}

run()
