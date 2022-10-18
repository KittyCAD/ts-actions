import * as core from '@actions/core'
import * as github from '@actions/github'
import fetch, {Headers} from 'node-fetch'
import libsodium from 'libsodium-wrappers'
import {inspect} from 'util'

async function run(): Promise<void> {
  const org = github.context.repo.owner
  const token = core.getInput('token')
  const tsAPIKey = core.getInput('ts-api-key')
  const tailnet = core.getInput('tailnet')
  const secretName = core.getInput('org-secret-name')
  const maximumKeyAgeInDays = core.getInput('maximum-key-age-in-days')
  const secretType = core.getInput('secret-type')

  const maximumKeyAgeInMillis = parseInt(maximumKeyAgeInDays) * 24 * 3600 * 1000
  const newKeyURL = `https://api.tailscale.com/api/v2/tailnet/${tailnet}/keys`

  core.info(
    `Attempting to rotate any key older than ${maximumKeyAgeInDays} days`
  )

  try {
    const octokit = github.getOctokit(token || '')
    const secretsClient =
      secretType == 'actions' ? octokit.rest.actions : octokit.rest.dependabot

    const headers = new Headers({
      Authorization: 'Basic ' + Buffer.from(tsAPIKey + ':').toString('base64')
    })

    // Check current key expiry
    const orgSecretResponse = await secretsClient.getOrgSecret({
      org: org,
      secret_name: secretName
    })
    const secretUpdatedAt = orgSecretResponse.data.updated_at
    const secretLastUpdated = Date.parse(secretUpdatedAt)
    const keyAgeInMillis = Date.now() - secretLastUpdated
    // If we're not about to expire, log and continue
    if (keyAgeInMillis < maximumKeyAgeInMillis) {
      core.info(`Key is not about to expire (last updated ${secretUpdatedAt})`)
      return
    }

    core.info(
      `Key is about to expire (last updated ${secretUpdatedAt}), creating and uploading a new key.`
    )

    // Actions & Dependabot will always be reusable and ephemeral
    const newKeyCapabilities = {
      capabilities: {
        devices: {
          create: {
            reusable: true,
            ephemeral: true,
            preauthorized: false,
            tags: []
          }
        }
      }
    }
    const response = await fetch(newKeyURL, {
      headers: headers,
      method: 'POST',
      body: JSON.stringify(newKeyCapabilities)
    })
    if (!response.ok) {
      core.setFailed(`Unable to create a new Tailscale machine key`)
      return
    }
    const data = (await response.json()) as any
    // Convert the message and key to Uint8Array's (Buffer implements that interface)
    const machineKeyBytes = Buffer.from(data.key)
    core.info(`Generated a new key, ID: ${data.id}`)

    const pubKeyResponse = await secretsClient.getOrgPublicKey({org})
    const pubKeyID = pubKeyResponse.data.key_id
    const pubKey = Buffer.from(pubKeyResponse.data.key, 'base64')

    // Encrypt using LibSodium
    // You must await ready before using libsodium
    await libsodium.ready
    const encryptedBytes = libsodium.crypto_box_seal(machineKeyBytes, pubKey)

    // Base64 the encrypted secret
    const encrypted = Buffer.from(encryptedBytes).toString('base64')

    core.info(`Updating ${org} ${secretType} secret ${secretName} to new key`)
    secretsClient.createOrUpdateOrgSecret({
      org: org,
      secret_name: secretName,
      key_id: pubKeyID,
      encrypted_value: encrypted,
      visibility: 'private'
    })
  } catch (e) {
    core.debug(`error: ${inspect(e)}`)
    throw e
  }
}

run()
