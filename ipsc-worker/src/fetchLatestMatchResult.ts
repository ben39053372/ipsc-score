import puppeteer from '@cloudflare/puppeteer';
import * as cheerio from 'cheerio';

export const fetchLatestMatchResult = async (DB: D1Database, BROWSER: BrowserRun): Promise<boolean> => {

    const latestMatch = await DB.prepare(`
        SELECT match_id, href, name, date, club, level, updated_at
        FROM matches
        ORDER BY match_date DESC
        LIMIT 1
    `).first();
    console.log("Fetched latest match from D1:", latestMatch);

    if (!latestMatch) {
        console.log("No matches found in D1");
        return false;
    }

    await fetchMatchResult(latestMatch.match_id as number, latestMatch.href as string, BROWSER, DB);

    return true;
};

export const fetchMatchResult = async (matchId: number, matchUrl: string, BROWSER: BrowserRun, DB: D1Database): Promise<any> => {

    if (!Number.isInteger(matchId) || matchId <= 0) {
        throw new Error(`Invalid match ID: ${matchId}`);
    }

    const matchTableName = `match-${matchUrl}-${matchId}`;
    const resultTableName = `match-result-${matchUrl}-${matchId}`;

    await DB.batch([
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS "${matchTableName}" (
                name TEXT PRIMARY KEY,
                div TEXT,
                class_name TEXT,
                cat TEXT
            )
        `),
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS "${resultTableName}" (
                name TEXT NOT NULL,
                shooter_id INTEGER,
                stage INTEGER NOT NULL,
                factor TEXT,
                pts TEXT,
                a TEXT,
                c TEXT,
                d TEXT,
                mi TEXT,
                ns TEXT,
                pe TEXT,
                time TEXT,
                last_updated_at INTEGER,
                PRIMARY KEY (name, stage)
            )
        `),
    ]);

    const now = Math.floor(Date.now() / 1000);
    const recentShooters = await DB.prepare(`
        SELECT DISTINCT shooter_id
        FROM "${resultTableName}"
        WHERE shooter_id IS NOT NULL AND last_updated_at >= ?
    `).bind(now - 15 * 60).all<{ shooter_id: number }>();
    const recentShooterIds = new Set(recentShooters.results.map((row) => row.shooter_id));
    const browser = await puppeteer.launch(BROWSER);
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
        if (req.resourceType() === "stylesheet" ||
            req.resourceType() === "font" ||
            req.resourceType() === "image" ||
            req.url().endsWith(".js") ||
            req.url().endsWith(".ico")) {
            req.abort();
        }
        else {
            req.continue();
        }
    });

    try {
        let retryCount = 0;
        for (let shooterId = 1; shooterId <= 400; shooterId++) {
            if (recentShooterIds.has(shooterId)) {
                console.log(`Shooter ${shooterId} was updated less than 15 minutes ago, skipping.`);
                continue;
            }
            const verifyUrl = new URL(String(matchUrl));
            https://hkg.as.ipscess.org/portal/verify/40?shooter=40
            verifyUrl.pathname = verifyUrl.pathname.replace(/\/portal$/, `/portal/verify/${matchId}`);
            verifyUrl.search = new URLSearchParams({
                shooter: String(shooterId)
            }).toString();
            console.log(verifyUrl.href)
            await page.goto(verifyUrl.href, { waitUntil: "domcontentloaded" });
            const html = await page.content();
            if (html.includes("Shooter not found.")) {
                retryCount++;
                if (retryCount >= 3) {
                    console.log(`Shooter ${shooterId} not found, stopping after 5 consecutive not found.`);
                    break;
                }
                console.log(`Shooter ${shooterId} not found, retry count: ${retryCount}`);
                continue;
            }

            const $ = cheerio.load(html);

            const rawName = $($("body > div > form > div.row.mt-6.p-2 > div.col-4").get(0)).text().trim();
            const name = rawName.replace(/^\d+\s+/, "").trim();
            console.log({rawName, name});
            if (!name) {
                console.warn(`Shooter ${shooterId} has no name`);
                continue;
            }

            const info = $($("body > div > form > div.row.mt-6.p-2 > .text-right").get(0)).text();
            const tableRowNodeList = $("body > div > form > table tr").toArray();
            const rows = tableRowNodeList
                .map((row) => {
                    const td = $(row).find("td");
                    return {
                        stage: Number(/\d+/.exec($(td[0]).html() || "")?.[0]),
                        factor: $(td[1]).text().trim(),
                        pts: $(td[2]).text().trim(),
                        a: $(td[3]).text().trim(),
                        c: $(td[4]).text().trim(),
                        d: $(td[5]).text().trim(),
                        mi: $(td[6]).text().trim(),
                        ns: $(td[7]).text().trim(),
                        pe: $(td[8]).text().trim(),
                        time: $(td[10]).text().trim(),
                    };
                })
                .slice(1)
                .filter((row): row is ResultRow => Number.isInteger(row.stage));
            const div = /DIV:\s+(.*)CLASSE/.exec(info)?.[1].trim() || null;
            const className = /CLASSE:\s+(.*)FATOR/.exec(info)?.[1].trim() || null;
            const cat = /CAT:\s+(.*)/.exec(info)?.[1].trim() || null;

            const existingRows = await DB.prepare(`
                SELECT stage, factor, pts, a, c, d, mi, ns, pe, time
                FROM "${resultTableName}"
                WHERE name = ?
                ORDER BY stage
            `).bind(name).all<ResultRow>();
            const resultDataChanged = JSON.stringify(rows) !== JSON.stringify(existingRows.results);
            if (!resultDataChanged) {
                await DB.prepare(`
                    UPDATE "${resultTableName}"
                    SET shooter_id = ?
                    WHERE name = ? AND (shooter_id IS NULL OR shooter_id != ?)
                `).bind(shooterId, name, shooterId).run();
                console.log(`Shooter ${shooterId} (${name}) data has not changed, skipping update.`);
                continue;
            }

            const statements = [
                DB.prepare(`
                    INSERT INTO "${matchTableName}" (name, div, class_name, cat)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT (name) DO UPDATE SET
                        div = excluded.div,
                        class_name = excluded.class_name,
                        cat = excluded.cat
                `).bind(name, div, className, cat),
                DB.prepare(`DELETE FROM "${resultTableName}" WHERE name = ?`).bind(name),
                ...rows.map((row) => DB.prepare(`
                    INSERT INTO "${resultTableName}" (
                        name, shooter_id, stage, factor, pts, a, c, d, mi, ns, pe, time, last_updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (name, stage) DO UPDATE SET
                        shooter_id = excluded.shooter_id,
                        factor = excluded.factor,
                        pts = excluded.pts,
                        a = excluded.a,
                        c = excluded.c,
                        d = excluded.d,
                        mi = excluded.mi,
                        ns = excluded.ns,
                        pe = excluded.pe,
                        time = excluded.time,
                        last_updated_at = excluded.last_updated_at
                `).bind(
                    name,
                    shooterId,
                    Number(row.stage),
                    row.factor,
                    row.pts,
                    row.a,
                    row.c,
                    row.d,
                    row.mi,
                    row.ns,
                    row.pe,
                    row.time,
                    now,
                )),
            ];

            await DB.batch(statements);
            console.log(`Shooter ${shooterId} (${name}) data updated successfully.`);
        }
    } finally {
        await browser.close();
        console.log("Browser closed");
    }
}
