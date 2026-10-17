import puppeteer from '@cloudflare/puppeteer';
import * as cheerio from 'cheerio';

type PortalShooter = {
    shooterId: number;
    name: string;
    division: string;
    className: string;
    category: string;
};

export const fetchPortalMatchResult = async (
    matchId: string,
    matchUrl: string,
    BROWSER: BrowserRun,
    DB: D1Database,
): Promise<boolean> => {
    if (!/^[0-9a-f-]{36}$/i.test(matchId) || !matchUrl.startsWith('https://portal.ipscess.org/portal/match/')) {
        throw new Error(`Invalid portal match: ${matchId}`);
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
    page.on('request', (request) => {
        if (['stylesheet', 'font', 'image'].includes(request.resourceType())) {
            request.abort();
        } else {
            request.continue();
        }
    });

    try {
        await page.goto(matchUrl, { waitUntil: 'domcontentloaded' });
        const matchHtml = await page.content();
        const $match = cheerio.load(matchHtml);
        const divisionPaths = $match('main a[onclick*="/result/"]').toArray()
            .map((link) => {
                const onclick = $match(link).attr('onclick') ?? '';
                return onclick.match(/submitRecaptcha\(['"]([^'"]+\/result\/[^'"]+)['"]/)?.[1] ?? '';
            })
            .filter(Boolean);
        const shooters = new Map<number, PortalShooter>();

        for (const divisionPath of divisionPaths) {
            await page.goto(matchUrl, { waitUntil: 'domcontentloaded' });
            const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
            await page.click(`main a[onclick*="${divisionPath}"]`);
            await navigation;
            if (!page.url().includes('/result/')) {
                throw new Error(`Failed to open portal division results: ${divisionPath}`);
            }

            const $ = cheerio.load(await page.content());
            const division = $('main h3').first().text().trim();
            $('main table tbody tr').each((_, row) => {
                const cells = $(row).find('td');
                const shooterId = Number($(cells[1]).text().trim());
                const name = $(cells[2]).text().trim();
                if (!Number.isInteger(shooterId) || shooterId <= 0 || !name) {
                    return;
                }
                shooters.set(shooterId, {
                    shooterId,
                    name,
                    division,
                    className: $(cells[4]).text().trim(),
                    category: $(cells[3]).text().trim(),
                });
            });
        }

        for (const shooter of shooters.values()) {
            if (recentShooterIds.has(shooter.shooterId)) {
                continue;
            }

            await page.goto(matchUrl, { waitUntil: 'domcontentloaded' });
            await page.type('#shooter', String(shooter.shooterId));
            const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
            await page.click('#verify-form button[type="button"]');
            await navigation;
            if (!page.url().endsWith('/verify')) {
                throw new Error(`Failed to verify portal shooter ${shooter.shooterId}`);
            }

            const $ = cheerio.load(await page.content());
            const rawName = $('main h3.display-5').first().text().trim();
            const name = rawName.replace(/^#\d+\s*/, '').trim();
            if (!name || rawName === 'Verify') {
                throw new Error(`Portal verification returned no score for shooter ${shooter.shooterId}`);
            }

            const info = $('main h3.display-5').first().parent().text().replace(/\s+/g, ' ').trim();
            const division = /Division:\s*(.*?)\s*Class:/i.exec(info)?.[1]?.trim() ?? shooter.division;
            const className = /Class:\s*(.*?)\s*Factor:/i.exec(info)?.[1]?.trim() ?? shooter.className;
            const category = /Category:\s*(.*)$/i.exec(info)?.[1]?.trim() ?? shooter.category;
            const rows = $('main table tbody tr').toArray().map((row) => {
                const cells = $(row).find('td');
                return {
                    stage: Number(/\d+/.exec($(cells[0]).text())?.[0]),
                    factor: $(cells[1]).text().trim(),
                    pts: $(cells[2]).text().trim(),
                    a: $(cells[3]).text().trim(),
                    c: $(cells[4]).text().trim(),
                    d: $(cells[5]).text().trim(),
                    mi: $(cells[6]).text().trim(),
                    ns: $(cells[7]).text().trim(),
                    pe: $(cells[8]).text().trim(),
                    time: $(cells[10]).text().trim(),
                };
            }).filter((row): row is ResultRow => Number.isInteger(row.stage));

            await DB.batch([
                DB.prepare(`
                    INSERT INTO "${matchTableName}" (name, div, class_name, cat)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT (name) DO UPDATE SET
                        div = excluded.div,
                        class_name = excluded.class_name,
                        cat = excluded.cat
                `).bind(name, division, className, category),
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
                    shooter.shooterId,
                    row.stage,
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
            ]);
        }
    } finally {
        await browser.close();
    }

    return true;
};