import * as cheerio from 'cheerio';
import puppeteer from '@cloudflare/puppeteer';

export const fetchLatestMatchResult = async (DB: D1Database, BROWSER: BrowserRun): Promise<boolean> => {
    const latestMatch = await DB.prepare(`
        SELECT match_id, href, name, date, club, level, updated_at
        FROM matches
        ORDER BY match_id DESC
        LIMIT 1
    `).first();

    if (!latestMatch) {
        console.log("No matches found in D1");
        return false;
    }

    console.log("Latest match:", latestMatch);

    const matchId = Number(latestMatch.match_id);
    if (!Number.isInteger(matchId) || matchId <= 0) {
        throw new Error(`Invalid match ID: ${latestMatch.match_id}`);
    }

    const matchTableName = `match-${matchId}`;
    const resultTableName = `match-result-${matchId}`;

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
                PRIMARY KEY (name, stage)
            )
        `),
    ]);

    const browser = await puppeteer.launch(BROWSER);
    const page = await browser.newPage();

    try {
        for (let shooterId = 1; shooterId <= 400; shooterId++) {
            await page.goto(
                `https://hkg.as.ipscess.org/portal/verify/${latestMatch.match_id}?shooter=${shooterId}&verify=Verify`,
                { waitUntil: "domcontentloaded" },
            );
            const html = await page.content();
            if (html.includes("Shooter not found.")) {
                break;
            }

            const $ = cheerio.load(html);

            const name = $($("body > div > form > div.row.mt-6.p-2 > div.col-4").get(0)).text().trim();
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
                        stage: /\d+/.exec($(td[0]).html() || "")?.[0],
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
                .filter((row): row is typeof row & { stage: string } => Boolean(row.stage));
            const div = /DIV:\s+(.*)CLASSE/.exec(info)?.[1].trim() || null;
            const className = /CLASSE:\s+(.*)FATOR/.exec(info)?.[1].trim() || null;
            const cat = /CAT:\s+(.*)/.exec(info)?.[1].trim() || null;

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
                        name, stage, factor, pts, a, c, d, mi, ns, pe, time
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (name, stage) DO UPDATE SET
                        factor = excluded.factor,
                        pts = excluded.pts,
                        a = excluded.a,
                        c = excluded.c,
                        d = excluded.d,
                        mi = excluded.mi,
                        ns = excluded.ns,
                        pe = excluded.pe,
                        time = excluded.time
                `).bind(
                    name,
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
                )),
            ];

            await DB.batch(statements);
        }
    } finally {
        await browser.close();
    }

    return true;
};
