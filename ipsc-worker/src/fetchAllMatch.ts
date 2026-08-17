import * as cheerio from 'cheerio';

export const fetchAllMatch = async (BROWSER: BrowserRun, DB: D1Database): Promise<boolean> => {
    const allMatchResultResponse = await BROWSER.quickAction("content", {
        url: "https://hkg.as.ipscess.org/portal",
    });
    const html: { result: string } = await allMatchResultResponse.json();
    const $ = cheerio.load(html.result);
    const matches = $('body > div > main a.list-group-item.list-group-item-action').toArray().map((el) => {
        const $el = $(el);
        return {
            href: $el.attr('href') ?? '',
            matchId: Number(($el.attr('href') ?? '').match(/match=(\d+)/)?.[1] ?? 0),
            name: $el.find('h5.mb-1').text().trim(),
            date: $el.find('div small').first().text().trim(),
            club: $el.find('p.mb-1').text().trim(),
            level: $el.find('small').last().text().trim(),
        };
    });
    await DB.prepare(`
        CREATE TABLE IF NOT EXISTS matches (
            match_id INTEGER PRIMARY KEY,
            href TEXT NOT NULL,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            club TEXT NOT NULL,
            level TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    const validMatches = matches.filter((match) => match.matchId > 0);
    if (validMatches.length > 0) {
        await DB.batch(validMatches.map((match) => DB.prepare(`
            INSERT INTO matches (match_id, href, name, date, club, level)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (match_id) DO UPDATE SET
                href = excluded.href,
                name = excluded.name,
                date = excluded.date,
                club = excluded.club,
                level = excluded.level,
                updated_at = CURRENT_TIMESTAMP
        `).bind(
            match.matchId,
            match.href,
            match.name,
            match.date,
            match.club,
            match.level,
        )));
    }


    return true;
}
