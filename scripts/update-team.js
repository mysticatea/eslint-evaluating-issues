"use strict"

const { promises: fs } = require("fs")
const http = require("https")
const logger = require("fancy-log")

function fetchTeamJson() {
    return new Promise((resolve, reject) => {
        http.request({
            protocol: "https:",
            host: "raw.githubusercontent.com",
            path: "/eslint/website/master/_data/team.json",
            method: "GET",
            headers: {
                Accept: "application/json, text/*",
                "User-Agent": `Node.js v${process.version}`,
            },
        })
            .on("response", res => {
                const chunks = []
                res.on("data", chunk => {
                    chunks.push(chunk)
                })
                    .on("end", () => {
                        try {
                            resolve(
                                JSON.parse(Buffer.concat(chunks).toString()),
                            )
                        } catch (error) {
                            reject(error)
                        }
                    })
                    .on("error", reject)
            })
            .on("error", reject)
            .end()
    })
}

// Main
;(async () => {
    const team = await fetchTeamJson()
    const ids = [
        ...team.tsc.map(info => info.username),
        ...team.reviewers.map(info => info.username),
        ...team.committers.map(info => info.username),
    ]

    await fs.writeFile("team.json", JSON.stringify(ids))
})().catch(error => {
    process.exitCode = 1
    logger.error(error.stack)
})
