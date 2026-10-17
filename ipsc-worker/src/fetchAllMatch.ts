import puppeteer from '@cloudflare/puppeteer';
import * as cheerio from 'cheerio';
import Cloudflare from 'cloudflare';

const matchUrls = [
    'https://hkg.as.ipscess.org/portal',
    "https://hkg02.as.ipscess.org/portal",
    'https://portal.ipscess.org/portal?level=all&region=HKG',
];

const parseMatchDate = (value: string): Date | null => {
    const legacyDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const isoDate = value.match(/(\d{4})-(\d{2})-(\d{2})/);
    const year = Number(legacyDate?.[3] ?? isoDate?.[1]);
    const month = Number(legacyDate?.[2] ?? isoDate?.[2]);
    const day = Number(legacyDate?.[1] ?? isoDate?.[3]);
    if (!year || !month || !day) {
        return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        ? date
        : null;
};

export const fetchAllMatch = async (BROWSER: BrowserRun, DB: D1Database): Promise<boolean> => {
    const browser = await puppeteer.launch(BROWSER);
    const page = await browser.newPage();
    const matches = [];

    try {
        for (const url of matchUrls) {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            const $ = cheerio.load(await page.content());
            if (url.startsWith('https://portal.ipscess.org/')) {
                matches.push(...$('a.match-card').toArray().map((el) => {
                    const $el = $(el);
                    const href = $el.attr('href') ?? '';
                    const metadata = $el.find('.match-card__meta').text().replace(/\s+/g, ' ').trim();
                    const date = metadata.match(/\d{4}-\d{2}-\d{2}(?:\s*[–-]\s*\d{4}-\d{2}-\d{2})?/)?.[0] ?? '';
                    const rawMatchId = href.match(/\/match\/([^/?#]+)/)?.[1] ?? '';
                    return {
                        href: href ? new URL(href, url).href : '',
                        matchId: rawMatchId,
                        name: $el.find('.match-card__title').text().trim(),
                        date,
                        club: metadata.replace(date, '').trim(),
                        level: $el.find('.badge').last().text().trim(),
                    };
                }).filter((match) => match.href && match.matchId));
                continue;
            }
            matches.push(...$('body > div > main a.list-group-item.list-group-item-action').toArray().map((el) => {
                const $el = $(el);
                const href = $el.attr('href') ?? '';
                return {
                    href: href ? new URL(href, url).href : '',
                    matchId: Number(href.match(/match=(\d+)/)?.[1] ?? 0),
                    name: $el.find('h5.mb-1').text().trim(),
                    date: $el.find('div small').first().text().trim(),
                    club: $el.find('p.mb-1').text().trim(),
                    level: $el.find('small').last().text().trim(),
                };
            }));
        }
    } finally {
        await browser.close();
    }

    await DB.prepare(`
        CREATE TABLE IF NOT EXISTS matches (
            match_id INTEGER NOT NULL,
            href TEXT NOT NULL,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            club TEXT NOT NULL,
            level TEXT NOT NULL,
            match_date TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (match_id, href)
        )
    `).run();

    await DB.batch(matches.map((match) => DB.prepare(`
        INSERT INTO matches (match_id, href, name, date, club, level, match_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (match_id, href) DO UPDATE SET
            href = excluded.href,
            name = excluded.name,
            date = excluded.date,
            club = excluded.club,
            level = excluded.level,
            match_date = excluded.match_date,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
        match.matchId,
        match.href,
        match.name,
        match.date,
        match.club,
        match.level,
        parseMatchDate(match.date)?.toISOString() ?? null
    )));

    const haveLiveMatch = matches.some((match) => {
        const matchDate = parseMatchDate(match.date);
        if (!matchDate) {
            console.warn(`Match ${match.matchId} (${match.name}) has an invalid date: ${match.date}`);
            return false;
        }
        console.log(matchDate.getTime(), Date.now());
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
            body: [{ cron: "0 0 * * *" }, { cron: "*/10 0-15 * * *" }],
        });
        console.log("Live match found, updating schedule to run every 10 minutes from 8 AM to 11 PM");
        console.log(schedule.schedules);
    } else {
        const schedule = await client.workers.scripts.schedules.update('ipsc-worker', {
            account_id: '98f216323cb751c81d693ca7dd1a7dca',
            body: [{ cron: "0 0 * * *" }],
        });
        console.log("No live match found, updating schedule to run once a day at 8 AM");
        console.log(schedule.schedules);
    }


    return true;
}
