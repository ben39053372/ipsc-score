import * as cheerio from 'cheerio';
import Cloudflare from 'cloudflare';

const parseMatchDate = (value: string): Date | null => {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
        return null;
    }

    const [, day, month, year] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCFullYear() === Number(year)
        && date.getUTCMonth() === Number(month) - 1
        && date.getUTCDate() === Number(day)
        ? date
        : null;
};

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

    await DB.batch(matches.map((match) => DB.prepare(`
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

    const haveLiveMatch = matches.some((match) => {
        const matchDate = parseMatchDate(match.date);
        if (!matchDate) {
            console.warn(`Match ${match.matchId} (${match.name}) has an invalid date: ${match.date}`);
            return false;
        }

        const timeDiff = Date.now() - matchDate.getTime();
        console.log(`Match ${match.matchId} (${match.name}) date: ${match.date}, timeDiff: ${timeDiff} ms`);
        return timeDiff < 3 * 86400000 && timeDiff > 0; // 48 hours in milliseconds
    });
    const client = new Cloudflare({
        apiToken: process.env['CLOUDFLARE_API_TOKEN'],
    });
    if (haveLiveMatch) {
        const schedule = await client.workers.scripts.schedules.update('ipsc-worker', {
            account_id: '98f216323cb751c81d693ca7dd1a7dca',
            body: [{ cron: "0 8 * * *" }, { cron: "*/10 8-23 * * *" }],
        });
        console.log(schedule.schedules);
    } else {
        const schedule = await client.workers.scripts.schedules.update('ipsc-worker', {
            account_id: '98f216323cb751c81d693ca7dd1a7dca',
            body: [{ cron: "0 8 * * *" }],
        });
        console.log(schedule.schedules);
    }


    return true;
}
