/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const { promises: fs } = require("fs")
const toArray = require("@async-generators/to-array").default
const Octokit = require("@octokit/rest")
const { version } = require("@octokit/rest/package.json")
const logger = require("fancy-log")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

async function* paginate(octokit, endpoint) {
    for await (const response of octokit.paginate.iterator(endpoint)) {
        if (Array.isArray(response.data)) {
            yield* response.data
        } else if (Array.isArray(response.data.items)) {
            yield* response.data.items
        } else {
            logger.warn(response)
        }
    }
}

function search(octokit, query) {
    return paginate(
        octokit,
        octokit.search.issuesAndPullRequests.endpoint.merge({
            q: query,
            per_page: 100,
        }),
    )
}

function getReactions(octokit, issue) {
    return toArray(
        paginate(
            octokit,
            octokit.reactions.listForIssue.endpoint.merge({
                owner: "eslint",
                repo: "eslint",
                issue_number: issue.number,
                per_page: 100,
            }),
        ),
    )
}

async function normalizeIssueOrPullRequest(octokit, team, issue) {
    const id = issue.number
    const url = issue.html_url
    const title = issue.title.replace(
        /#(\d+)/gu,
        "[#$1](https://github.com/eslint/eslint/issues/$1)",
    )
    const labels = issue.labels.map(label => label.name)
    const championCandidate = issue.assignee && issue.assignee.login
    const champion = team.has(championCandidate) ? championCandidate : null
    const numComments = issue.comments
    const createdTime = issue.created_at
    const reactions = await getReactions(octokit, issue)
    const upvoters = reactions
        .filter(reaction => reaction.content === "+1")
        .map(reaction => reaction.user.login)
    const downvoters = reactions
        .filter(reaction => reaction.content === "-1")
        .map(reaction => reaction.user.login)
    const supporters = upvoters.filter(
        username => username !== champion && team.has(username),
    )
    const against = downvoters.filter(
        username => username !== champion && team.has(username),
    )
    const numUpvotes = upvoters.filter(
        username => username !== champion && !team.has(username),
    ).length
    const numDownvotes = downvoters.filter(
        username => username !== champion && !team.has(username),
    ).length

    return {
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
    }
}

async function normalizeIssue(octokit, team, issueData) {
    const issue = await normalizeIssueOrPullRequest(octokit, team, issueData)
    issue.kind = "issue"
    issue.prs = []

    return issue
}

async function normalizePullRequest(octokit, team, prData, closed) {
    const pr = await normalizeIssueOrPullRequest(octokit, team, prData)
    pr.kind = "pr"
    pr.issueClosed = closed

    return pr
}

async function processIssue(octokit, team, issueData, issues) {
    const issue = await normalizeIssue(octokit, team, issueData)
    issues.set(issue.id, issue)
}

async function processPullRequest(octokit, team, prData, prs, issues) {
    const fixIssueIds = Array.from(
        prData.title.matchAll(/(?:fixe|ref)s\s+#(\d+)/gu),
    ).map(m => Number(m[1]))
    const fixIssues = fixIssueIds.map(id => issues.get(id)).filter(Boolean)

    // Lint to issues.
    if (fixIssues.length > 0) {
        logger.info(
            `\tskipped as lined to issue ${fixIssues.map(
                issue => `#${issue.id}`,
            )}.`,
        )
        for (const issue of fixIssues) {
            issue.prs.push(prData.number)
        }
        return
    }

    // Check issues if closed or not.
    const actualIssueRess = await Promise.all(
        fixIssueIds.map(number =>
            octokit.issues.get({
                issue_number: number,
                owner: "eslint",
                repo: "eslint",
            }),
        ),
    )
    const issueStates = actualIssueRess.map(res => {
        logger.info(
            `\tlinked issue state #${res.data.number} "${res.data.state}"`,
        )
        return res.data.state
    })
    const closed =
        issueStates.length > 0 && issueStates.every(state => state !== "open")
    const pr = await normalizePullRequest(octokit, team, prData, closed)

    prs.set(pr.id, pr)
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

;(async () => {
    logger.info("Reading access token...")
    const GITHUB_TOKEN =
        process.env.GITHUB_TOKEN ||
        (await fs.readFile(".access-token", "utf8")).trim()

    logger.info("Reading the team...")
    const team = new Set(JSON.parse(await fs.readFile("team.json", "utf8")))

    logger.info("Setting up Octokit...")
    const octokit = new Octokit({
        auth: `token ${GITHUB_TOKEN}`,
        previews: ["symmetra", "squirrel-girl"],
        userAgent: `octokit/rest.js v${version}`,
    })
    const issues = new Map()
    const prs = new Map()

    //--------------------------------------------------------------------------
    logger.info("Getting issues...")
    for await (const issue of search(
        octokit,
        "repo:eslint/eslint type:issue is:open label:evaluating label:feature",
    )) {
        logger.info(
            `Processing feature issue #${issue.number} "${issue.title}"`,
        )
        await processIssue(octokit, team, issue, issues)
    }
    for await (const issue of search(
        octokit,
        "repo:eslint/eslint type:issue is:open label:evaluating label:enhancement",
    )) {
        logger.info(
            `Processing enhance issue #${issue.number} "${issue.title}"`,
        )
        await processIssue(octokit, team, issue, issues)
    }
    logger.info(`${issues.size} issues were found.`)

    //--------------------------------------------------------------------------
    logger.info("Getting pull requests...")
    for await (const pr of search(
        octokit,
        "repo:eslint/eslint type:pr is:open label:evaluating label:feature",
    )) {
        logger.info(
            `Processing feature pull request #${pr.number} "${pr.title}"`,
        )
        await processPullRequest(octokit, team, pr, prs, issues)
    }
    for await (const pr of search(
        octokit,
        "repo:eslint/eslint type:pr is:open label:evaluating label:enhancement",
    )) {
        logger.info(
            `Processing enhance pull request #${pr.number} "${pr.title}"`,
        )
        await processPullRequest(octokit, team, pr, prs, issues)
    }
    logger.info(`${prs.size} pull requests were found.`)

    // Add the linked PRs to title.
    for (const issue of issues.values()) {
        if (issue.prs.length > 0) {
            const prLinks = issue.prs
                .map(
                    pr =>
                        `(PR [#${pr}](https://github.com/eslint/eslint/pull/${pr}))`,
                )
                .join("")
            issue.title += ` ${prLinks}`
        }
        delete issue.prs
    }

    logger.info("Saving issues and pull requests...")
    await fs.writeFile(
        "issues.json",
        JSON.stringify(
            [...issues.values(), ...prs.values()].sort((a, b) => a.id - b.id),
        ),
    )

    logger.info("All process completed.")
})().catch(error => {
    process.exitCode = 1
    logger.error(error.stack)
})
