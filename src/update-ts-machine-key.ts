import * as core from '@actions/core'
import * as github from '@actions/github'
import fetch, {Headers} from 'node-fetch';
import libsodium from 'libsodium-wrappers'
import {inspect} from 'util'

const re = /tskey-(?:auth-)?(?<keyID>.+)-.*/
const org = 'KittyCAD'

async function run(): Promise<void> {
  const token = core.getInput('token')
  const currentTSMachineKey = core.getInput('current-ts-machine-key')
  const tsAPIKey = core.getInput('ts-api-key')
  const tailnet = core.getInput('tailnet')
  const secretName = core.getInput('org-secret-name')
  const rotationLeadTimeInDays = core.getInput('rotation-lead-time')
  const rotationLeadTimeInMillis = parseInt(rotationLeadTimeInDays) * 24 * 3600 * 1000
  const matches = currentTSMachineKey.match(re)
  if (matches === null) {
    core.info(`Current machine key is not in a valid format`)
    return
  }
  const currentKeyID = matches[1]
  const newKeyURL = `https://api.tailscale.com/api/v2/tailnet/${tailnet}/keys`
  const currentKeyURL = `${newKeyURL}/${currentKeyID}`

  core.info(`Attempting to rotate any key due to expire in the next ${rotationLeadTimeInDays} days`)

  try {
    const octokit = github.getOctokit(token || '')
    const headers = new Headers({
      'Authorization': 'Basic ' + Buffer.from(tsAPIKey + ":").toString('base64'),
    })

    // Check current key expiry
    var response = await fetch(currentKeyURL, {headers: headers})
    if (!response.ok) {
      core.info(`Unable to fetch info about key ${currentKeyID}`)
      return
    }
    var data = (await response.json()) as any
    const keyExpiry = Date.parse(data.expires)
    const dateDiff = keyExpiry - Date.now()
    // If we're not about to expire, log and continue
    if (dateDiff > rotationLeadTimeInMillis) {
      core.info(`Key is not about to expire, expiry: ${data.expires}`)
      return
    }

    core.info(`Key is about to expire (${keyExpiry}), creating and uploading a new key.`)

    // Reuse capabilities of the existing key
    // const newKeyCapabilities = { capabilities: data.capabilities }
    // response = await fetch(newKeyURL, {headers: headers, method: 'POST', body: JSON.stringify(newKeyCapabilities)})
    // if (!response.ok) {
    //   core.info(`Unable to create a new Tailscale machine key`)
    //   return
    // }
    // data = (await response.json()) as any
    // // Convert the message and key to Uint8Array's (Buffer implements that interface)
    // const machineKeyBytes = Buffer.from(data.key)
    const machineKeyBytes = Buffer.from("fake-bytes")

    // Just for debugging for now
    // Don't log the key, but do dump everything else
    // delete data.key
    // core.info(inspect(data, { depth: 10 }))

    const pubKeyResponse = await octokit.rest.actions.getOrgPublicKey({ org, })
    const pubKey = Buffer.from(pubKeyResponse.data.key, 'base64')

    // Encrypt using LibSodium
    // You must await ready before using libsodium
    await libsodium.ready
    const encryptedBytes = libsodium.crypto_box_seal(machineKeyBytes, pubKey)

    // Base64 the encrypted secret
    const encrypted = Buffer.from(encryptedBytes).toString('base64')

    core.info("Updating Org secret to new key")
    // octokit.rest.actions.createOrUpdateOrgSecret({
    //   org: org,
    //   secret_name: secretName,
    //   encrypted_value: encrypted,
    //   visibility: 'private',
    // })
  } catch (e) {
    core.debug(`error: ${inspect(e)}`)
    throw e
  }
}

run()
