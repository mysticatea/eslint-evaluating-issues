/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const addDays = require("date-fns/add_days")
const isAfter = require("date-fns/is_after")
const logger = require("fancy-log")
const fs = require("fs-extra")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * @typedef {Object} Issue
 * @property {number} id The issue number.
 * @property {string} url The URL to the issue.
 * @property {string} title The title of the issue.
 * @property {string[]} labels The label names.
 * @property {string|null} champion The username of the champion.
 * @property {string[]} supporters The username of the team members which gave +1.
 * @property {string[]} against The username of the team members which gave -1.
 * @property {number} numUpvotes The number of +1 which came from out of the team.
 * @property {number} numDownvotes The number of -1 which came from out of the team.
 * @property {number} numComments The number of comments
 * @property {string} createdTime The ISO 8601 string of the created time.
 */

/**
 * Render the avatar of a given user.
 * @param {string} username The username to render.
 * @returns {string} The text of the avatar.
 */
function renderAvatar(username) {
    return username
        ? `<img alt="@${username}" src="https://github.com/${username}.png" width="32px" height="32px">`
        : ""
}

/**
 * Render the border time.
 * @param {Date} createdTime The created time.
 * @returns {string} The text of the border time.
 */
function renderDateTime(createdTime) {
    const borderTime = addDays(createdTime, 21.5)
    const icon = isAfter(new Date(), borderTime) ? "⌛ " : ""
    const borderTimeText = borderTime.toISOString().slice(0, 10)
    return `${icon}${borderTimeText}`
}

/**
 * Render the table row to show issues.
 * @param {Issue} issue The issues to render.
 * @returns {string} The table row text.
 */
function renderTableRow({
    id,
    url,
    title,
    champion,
    supporters,
    against,
    numUpvotes,
    numDownvotes,
    numComments,
    createdTime,
}) {
    const championAvatar = renderAvatar(champion)
    const supporterAvatars = supporters.map(renderAvatar).join(" ")
    const againstAvatars = against.map(renderAvatar).join(" ")
    const time = renderDateTime(createdTime)
    return `| [#${id}](${url}) | ${title} | ${championAvatar} | ${supporterAvatars} | ${againstAvatars} | ${numUpvotes} | ${numDownvotes} | ${numComments} | ${time} |`
}

/**
 * Render the table to show issues.
 * @param {Issue[]} issues The issues to render.
 * @returns {string} The table text.
 */
function renderTable(issues) {
    if (issues.length === 0) {
        return "Nothing."
    }
    return `| # | Title | Champ. | Supporters | Against | 👍 | 👎 | 📣 | 🕙 |
|--:|:------|:------:|:-----------|:--------|---:|---:|---:|:--:|
${issues
        .sort(compare)
        .map(renderTableRow)
        .join("\n")}

Total: ${issues.length}`
}

/**
 * Compare two issues to sort.
 * @param {Issue} a The issue to compare.
 * @param {Issue} b Another issue to compare.
 * @returns {number} The value to sort.
 */
function compare(a, b) {
    return (
        (b.champion ? 1 : 0) - (a.champion ? 1 : 0) ||
        b.supporters.length - a.supporters.length ||
        b.numUpvotes - a.numUpvotes ||
        b.id - a.id
    )
}

/**
 * Check whether a given issue is older than 21 days.
 * @param {Issue} issue The issue to check.
 * @returns {boolean} `true` if the issue is old.
 */
function isOld(issue) {
    const created = Date.parse(issue.createdTime)
    const days = (Date.now() - created) / (24 * 60 * 60 * 1000)
    return days > 21.5
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

;(async () => {
    const issues = await fs.readJson("issues.json")
    const zeroIssues = issues.filter(
        i => !i.champion && i.supporters.length === 0 && i.against.length === 0,
    )
    const coreIssues = issues.filter(
        i =>
            (i.labels.includes("core") || i.labels.includes("cli")) &&
            !zeroIssues.includes(i),
    )
    const champIssues = issues.filter(
        i =>
            i.champion &&
            i.against.length === 0 &&
            !zeroIssues.includes(i) &&
            !coreIssues.includes(i),
    )
    const niceIssues = issues.filter(
        i =>
            !i.champion &&
            i.against.length === 0 &&
            !zeroIssues.includes(i) &&
            !coreIssues.includes(i),
    )
    const toughIssues = issues.filter(
        i =>
            i.against.length > 0 &&
            !zeroIssues.includes(i) &&
            !coreIssues.includes(i),
    )
    const content = `# ESLint Features in Evaluating [![Build Status](https://travis-ci.com/mysticatea/eslint-evaluating-issues.svg?branch=master)](https://travis-ci.com/mysticatea/eslint-evaluating-issues)

ESLint needs a champion and three supporters from [the team](https://github.com/eslint/eslint#team) in order to accept new features.
This page is a summary of feature issues.

**Legend:**

- The 👍 column is the number of upvotes which came from outside of the team. Each table is sorted by this column.
- The 📣 column is the number of comments in the issue.
- The 🕙 column is the time to close the issue based on the [When to Close an Issue](https://eslint.org/docs/maintainer-guide/issues#when-to-close-an-issue) section.

## Accepted (needs to update labels)

${renderTable(champIssues.filter(i => i.supporters.length >= 3))}

## Needs one more supporter

${renderTable(champIssues.filter(i => i.supporters.length === 2))}

## Needs two more supporters

${renderTable(champIssues.filter(i => i.supporters.length === 1))}

## Needs three supporters

${renderTable(champIssues.filter(i => i.supporters.length === 0))}

## Needs a champion

${renderTable(niceIssues.filter(i => i.supporters.length >= 3))}

## Needs a champion and one more supporter

${renderTable(niceIssues.filter(i => i.supporters.length === 2))}

## Needs a champion and two more supporters

${renderTable(niceIssues.filter(i => i.supporters.length === 1))}

## Needs interest

${renderTable(zeroIssues.filter(i => !isOld(i)))}

## Needs consensus

${renderTable(toughIssues.filter(i => i.champion || i.supporters.length >= 1))}

## Needs approval in a TSC meeting

${renderTable(coreIssues)}

## Looks opposed

${renderTable(
        toughIssues.filter(i => !i.champion && i.supporters.length === 0),
    )}

## Looks inactive

${renderTable(zeroIssues.filter(isOld))}

`

    await fs.writeFile("README.md", content)
})().catch(error => {
    logger.error(error.stack)
    process.exitCode = 1
})
