import puppeteer from '@cloudflare/puppeteer';
import * as cheerio from 'cheerio';

type PortalShooter = {
    shooterId: number;
    name: string;
    division: string;
    className: string;
    category: string;
};

const MAX_SHOOTERS_PER_RUN = 5;

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
        SELECT shooter_id, MAX(last_updated_at) AS last_updated_at
        FROM "${resultTableName}"
        WHERE shooter_id IS NOT NULL
        GROUP BY shooter_id
    `).all<{ shooter_id: number; last_updated_at: number | null }>();
    const lastUpdatedAtByShooter = new Map(
        recentShooters.results.map((row) => [row.shooter_id, row.last_updated_at]),
    );
    const recentShooterIds = new Set(
        recentShooters.results
            .filter((row) => row.last_updated_at !== null && row.last_updated_at >= now - 15 * 60)
            .map((row) => row.shooter_id),
    );
    let hasMore = false;
    const browser = await puppeteer.launch(BROWSER);
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(25000);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        if (['stylesheet', 'font', 'image'].includes(request.resourceType())) {
            request.abort();
        } else {
            request.continue();
        }
    });

    let phase = 'open match page';
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
            phase = `open division results ${divisionPath}`;
            await page.goto(matchUrl, { waitUntil: 'domcontentloaded' });
            const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
            await page.$eval(`main a[onclick*="${divisionPath}"]`, (element) => {
                (element as { click: () => void }).click();
            });
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

        phase = 'open verify form';
        await page.goto(matchUrl, { waitUntil: 'domcontentloaded' });
        const eligibleShooters = [...shooters.values()]
            .filter((shooter) => !recentShooterIds.has(shooter.shooterId))
            .sort((a, b) => {
                const aUpdatedAt = lastUpdatedAtByShooter.get(a.shooterId);
                const bUpdatedAt = lastUpdatedAtByShooter.get(b.shooterId);
                if (aUpdatedAt === undefined || aUpdatedAt === null) return -1;
                if (bUpdatedAt === undefined || bUpdatedAt === null) return 1;
                return aUpdatedAt - bUpdatedAt;
            });
        const shootersToFetch = eligibleShooters.slice(0, MAX_SHOOTERS_PER_RUN);
        hasMore = eligibleShooters.length > shootersToFetch.length;
        let processedShooters = 0;

        for (const shooter of shootersToFetch) {

            phase = `prepare verification for shooter ${shooter.shooterId}`;
            await page.$eval('#shooter', (element) => {
                (element as unknown as { value: string }).value = '';
            });
            await page.type('#shooter', String(shooter.shooterId));
            const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
            phase = `submit reCAPTCHA verification for shooter ${shooter.shooterId}`;
            await page.$eval('#verify-form button[type="button"]', (element) => {
                (element as { click: () => void }).click();
            });
            await navigation;
            if (!page.url().endsWith('/verify')) {
                throw new Error(`Failed to verify portal shooter ${shooter.shooterId}`);
            }

            const $ = cheerio.load(await page.content());
            const rawName = $('main h3.display-5').first().text().trim();
            const name = rawName.replace(/^#\d+\s*/, '').trim();
            const returnedShooterId = Number(/^#(\d+)/.exec(rawName)?.[1]);
            if (!name || returnedShooterId !== shooter.shooterId) {
                throw new Error(`Portal verification did not return shooter ${shooter.shooterId} (received: ${rawName || 'no result'})`);
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

            phase = `save scores for shooter ${shooter.shooterId}`;
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
            processedShooters++;
        }
        console.log('Portal match scraper batch completed', {
            matchId,
            totalShooters: shooters.size,
            processedShooters,
            deferredShooters: shooters.size - processedShooters,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Portal match scraper failed', { matchId, phase, message });
        throw new Error(`Portal match scraper failed during ${phase}: ${message}`);
    } finally {
        await browser.close();
    }

    return hasMore;
};