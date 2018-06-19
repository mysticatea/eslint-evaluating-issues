/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const cp = require("child_process")
const logger = require("fancy-log")
const pEvent = require("p-event")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Execute a given command.
 * @param {string} command The command to execute.
 * @param {string[]} args The arguments.
 * @returns {Promise<void>} The promise which will be fulfilled after done.
 */
async function exec(command, ...args) {
    const exitCode = await pEvent(
        cp.spawn(command, args, { shell: true, stdio: "inherit" }),
        "close",
    )
    if (exitCode) {
        throw new Error(`Failed to run: ${command} ${args.join(" ")}`)
    }
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

;(async () => {
    const TOKEN = process.env.ATOKEN

    logger.info("Check if updates exist.")
    try {
        await exec("git", "diff", "--exit-code", "--quiet")
        logger.info("Up to date.")
        return
    } catch (_) {
        logger.info("Updates exist.")
    }

    logger.info("Make a commit.")
    await exec("git", "add", ".")
    await exec("git", "commit", "-m", "update issues")

    logger.info("Push the commit.")
    await exec(
        "git",
        "push",
        `https://mysticatea:${TOKEN}@github.com/mysticatea/eslint-evaluating-issues.git`,
        "HEAD:master",
    )

    logger.info("Completed!")
})().catch(error => {
    logger.error(error.stack)
    process.exitCode = 1
})
