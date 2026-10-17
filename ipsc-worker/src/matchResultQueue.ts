import { fetchMatchResult } from './fetchLatestMatchResult';
import { fetchPortalMatchResult } from './fetchPortalMatchResult';

export type MatchResultJob = {
    matchId: string;
    href: string;
};

export const enqueueLatestMatchResult = async (
    DB: D1Database,
    queue: Queue<MatchResultJob>,
): Promise<boolean> => {
    const latestMatch = await DB.prepare(`
        SELECT match_id, href, name
        FROM matches
        ORDER BY match_date DESC
        LIMIT 1
    `).first<{ match_id: number | string; href: string; name: string }>();

    if (!latestMatch) {
        console.log('No matches found in D1');
        return false;
    }

    const job = {
        matchId: String(latestMatch.match_id),
        href: latestMatch.href,
    };
    await queue.send(job);
    console.log('Enqueued latest match result fetch', { ...job, name: latestMatch.name });
    return true;
};

export const enqueueMatchResult = async (
    matchId: string,
    href: string,
    queue: Queue<MatchResultJob>,
): Promise<void> => {
    await queue.send({ matchId, href });
};

export const processMatchResultJob = async (
    job: MatchResultJob,
    BROWSER: BrowserRun,
    DB: D1Database,
    queue: Queue<MatchResultJob>,
): Promise<void> => {
    if (!job || typeof job.matchId !== 'string' || typeof job.href !== 'string') {
        throw new Error('Invalid match result queue message');
    }

    if (job.href.startsWith('https://portal.ipscess.org/portal/match/')) {
        const hasMore = await fetchPortalMatchResult(job.matchId, job.href, BROWSER, DB);
        if (hasMore) {
            await queue.send(job, { delaySeconds: 5 });
        }
        return;
    }

    const matchId = Number(job.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
        throw new Error(`Invalid legacy match ID: ${job.matchId}`);
    }
    await fetchMatchResult(matchId, job.href, BROWSER, DB);
};