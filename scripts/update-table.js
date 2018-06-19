/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const logger = require("fancy-log")
const fs = require("fs-extra")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

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
 * Render the table row to show issues.
 * @param {{id:number,url:string,title:string,labels:string[],champion:(string|null),supporters:string[],numComments:number,numUpvotes:number}} issue The issues to render.
 * @returns {string} The table row text.
 */
function renderTableRow({
    id,
    url,
    title,
    champion,
    supporters,
    numComments,
    numUpvotes,
}) {
    const championAvatar = renderAvatar(champion)
    const supporterAvatars = supporters.map(renderAvatar).join(" ")
    return `| [#${id}](${url}) | ${title} | ${championAvatar} | ${supporterAvatars} | ${numUpvotes} | ${numComments} |`
}

/**
 * Render the table to show issues.
 * @param {{id:number,url:string,title:string,labels:string[],champion:(string|null),supporters:string[],numComments:number,numUpvotes:number}[]} issues The issues to render.
 * @returns {string} The table text.
 */
function renderTable(issues) {
    if (issues.length === 0) {
        return "Nothing."
    }
    return `| # | Title | Champion | Supporters | 👍 | 📣 |
|--:|:------|:---------|:-----------|---:|---:|
${issues
        .sort(compare)
        .map(renderTableRow)
        .join("\n")}

Total: ${issues.length}`
}

/**
 * Compare two issues to sort.
 * @param {{id:number,url:string,title:string,labels:string[],champion:(string|null),supporters:string[],numComments:number,numUpvotes:number}} a The issue to compare.
 * @param {{id:number,url:string,title:string,labels:string[],champion:(string|null),supporters:string[],numComments:number,numUpvotes:number}} b Another issue to compare.
 * @returns {number} The value to sort.
 */
function compare(a, b) {
    return b.numUpvotes - a.numUpvotes || b.id - a.id
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

;(async () => {
    const issues = await fs.readJson("issues.json")
    const content = `# ESLint Features in Evaluating

ESLint needs a champion and three supporters from [the team](https://github.com/eslint/eslint#team) in order to accept new features.
This page is a summary of feature issues.

This page will be updated every day by [Travis CI](https://travis-ci.com/mysticatea/eslint-evaluating-issues).

**Legend:**

- The 👍 column is the number of upvotes which came from outside of the team. Each table is sorted by this column.
- The 📣 column is the number of comments in the issue.

## Accepted (needs to update labels)

${renderTable(issues.filter(i => i.champion && i.supporters.length >= 3))}

## Needs one more supporter

${renderTable(issues.filter(i => i.champion && i.supporters.length === 2))}

## Needs two more supporters

${renderTable(issues.filter(i => i.champion && i.supporters.length === 1))}

## Needs three supporters

${renderTable(issues.filter(i => i.champion && i.supporters.length === 0))}

## Needs a champion

${renderTable(issues.filter(i => !i.champion && i.supporters.length >= 3))}

## Needs a champion and one more supporter

${renderTable(issues.filter(i => !i.champion && i.supporters.length === 2))}

## Needs a champion and two more supporters

${renderTable(issues.filter(i => !i.champion && i.supporters.length === 1))}

## Looks inactive

${renderTable(issues.filter(i => !i.champion && i.supporters.length === 0))}

`

    await fs.writeFile("README.md", content)
})().catch(error => {
    logger.error(error.stack)
    process.exitCode = 1
})
