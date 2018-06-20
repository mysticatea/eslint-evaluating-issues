/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const Octokit = require("@octokit/rest")
const logger = require("fancy-log")
const fs = require("fs-extra")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const octokit = new Octokit({
    headers: {
        accept:
            "application/vnd.github.v3+json,application/vnd.github.squirrel-girl-preview+json",
    },
})

const theTeam = new Set([
    // TSC
    "nzakas",
    "ilyavolodin",
    "btmills",
    "gyandeeps",
    "mysticatea",
    "alberto",
    "kaicataldo",
    "not-an-aardvark",
    "platinumazure",

    // Committers
    "lo1tuma",
    "xjamundx",
    "ianvs",
    "michaelficarra",
    "pedrottimark",
    "markelog",
    "mikesherov",
    "hzoo",
    "mdevils",
    "zxqfox",
    "vitorbal",
    "JamesHenry",
    "soda0289",
    "Aladdin-ADD",
    "VictorHom",
])

/**
 * Get items from a given data object.
 * @param {any} responseData The data object to get items.
 * @returns {any[]} Items.
 */
function getItems(responseData) {
    if (Array.isArray(responseData)) {
        return responseData
    }
    if (Array.isArray(responseData.items)) {
        return responseData.items
    }
    throw new Error(`Couldn't get items from ${JSON.stringify(responseData)}`)
}

/**
 * Get all data with pagination.
 * @param {Promise<Octokit.AnyResponse>} responsePromise The response to get all data.
 * @returns {any[]} The all data.
 */
async function pagenate(responsePromise) {
    let response = await responsePromise
    const data = [...getItems(response.data)]

    while (octokit.hasNextPage(response)) {
        response = await octokit.getNextPage(response)
        data.push(...getItems(response.data))
    }

    return data
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

;(async () => {
    logger.info("Setup access token...")
    const ACCESS_TOKEN =
        process.env.ATOKEN ||
        (await fs.readFile(".access-token", "utf8")).trim()

    octokit.authenticate({ type: "token", token: ACCESS_TOKEN })

    logger.info("Getting issues...")
    const issues = []

    for (const issue of await pagenate(
        octokit.search.issues({
            q: "repo:eslint/eslint type:issue is:open label:evaluating",
            per_page: 100,
        }),
    )) {
        const id = issue.number
        const url = issue.html_url
        const title = issue.title
        const labels = issue.labels.map(label => label.name)
        const champion = issue.assignee && issue.assignee.login
        const numComments = issue.comments

        if (!labels.includes("feature") && !labels.includes("enhancement")) {
            continue
        }

        logger.info(`Processing issue ${id}...`)
        const reactions = await pagenate(
            octokit.reactions.getForIssue({
                owner: "eslint",
                repo: "eslint",
                number: id,
                per_page: 100,
            }),
        )
        const upvoters = reactions
            .filter(reaction => reaction.content === "+1")
            .map(reaction => reaction.user.login)
        const downvoters = reactions
            .filter(reaction => reaction.content === "-1")
            .map(reaction => reaction.user.login)

        const supporters = upvoters.filter(
            username => username !== champion && theTeam.has(username),
        )
        const against = downvoters.filter(
            username => username !== champion && theTeam.has(username),
        )
        const numUpvotes = upvoters.filter(
            username => username !== champion && !theTeam.has(username),
        ).length
        const numDownvotes = downvoters.filter(
            username => username !== champion && !theTeam.has(username),
        ).length

        issues.push({
            id,
            url,
            title,
            labels,
            champion,
            supporters,
            against,
            numUpvotes,
            numDownvotes,
            numComments,
        })
    }
    logger.info(`${issues.length} issues were found.`)

    logger.info("Saving issues...")
    await fs.writeJson("issues.json", issues)
})().catch(error => {
    logger.error(error.stack)
    process.exitCode = 1
})
