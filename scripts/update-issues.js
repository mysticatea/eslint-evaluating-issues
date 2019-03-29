/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const toArray = require("@async-generators/to-array").default
const Octokit = require("@octokit/rest")
const { version } = require("@octokit/rest/package.json")
const logger = require("fancy-log")
const fs = require("fs-extra")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const theTeam = new Set(
    [
        // From https://github.com/eslint/eslint.github.io/blob/master/_data/team.json
        "nzakas",
        "platinumazure",
        "ilyavolodin",
        "btmills",
        "mysticatea",
        "gyandeeps",
        "kaicataldo",
        "not-an-aardvark",
        "alberto",
        "BYK",
        "lo1tuma",
        "michaelficarra",
        "xjamundx",
        "mikesherov",
        "hzoo",
        "vitorbal",
        "zxqfox",
        "JamesHenry",
        "markelog",
        "faceleg",
        "soda0289",
        "VictorHom",
        "IanVS",
        "pedrottimark",
        "aladdin-add",
        "g-plane",
    ].map(username => username.toLowerCase()),
)

/**
 * Get items.
 * @param {Octokit} octokit The octokit to get items.
 * @param {Endpoint} endpoint The endpoint to get items.
 * @returns {any[]} Items.
 */
async function* paginate(octokit, endpoint) {
    for (const response of await octokit.paginate(endpoint)) {
        if (Array.isArray(response.items)) {
            yield* response.items
        } else if (Array.isArray(response)) {
            yield* response
        } else {
            yield response
        }
    }
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

;(async () => {
    logger.info("Setup access token...")
    const ACCESS_TOKEN =
        process.env.ATOKEN ||
        (await fs.readFile(".access-token", "utf8")).trim()

    logger.info("Setup Octokit...")
    const octokit = new Octokit({
        auth: `token ${ACCESS_TOKEN}`,
        previews: ["squirrel-girl"],
        userAgent: `octokit/rest.js v${version}`,
    })

    logger.info("Getting issues...")
    const issues = []

    for await (const issue of paginate(
        octokit,
        octokit.search.issuesAndPullRequests.endpoint.merge({
            q: "repo:eslint/eslint type:issue is:open label:evaluating",
            per_page: 100,
        }),
    )) {
        const id = issue.number
        const url = issue.html_url
        const title = issue.title
        const labels = issue.labels.map(label => label.name)
        const champion = issue.assignee && issue.assignee.login.toLowerCase()
        const numComments = issue.comments
        const createdTime = issue.created_at

        if (!labels.includes("feature") && !labels.includes("enhancement")) {
            continue
        }

        logger.info(`Processing issue ${id}...`)
        const reactions = await toArray(
            paginate(
                octokit,
                octokit.reactions.listForIssue.endpoint.merge({
                    owner: "eslint",
                    repo: "eslint",
                    number: id,
                    per_page: 100,
                }),
            ),
        )
        const upvoters = reactions
            .filter(reaction => reaction.content === "+1")
            .map(reaction => reaction.user.login.toLowerCase())
        const downvoters = reactions
            .filter(reaction => reaction.content === "-1")
            .map(reaction => reaction.user.login.toLowerCase())

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
            createdTime,
        })
    }
    logger.info(`${issues.length} issues were found.`)

    logger.info("Saving issues...")
    await fs.writeJson("issues.json", issues)
})().catch(error => {
    logger.error(error.stack)
    process.exitCode = 1
})
