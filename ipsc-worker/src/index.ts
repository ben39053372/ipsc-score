import { fetchAllMatch } from "./fetchAllMatch";
import { fetchLatestMatchResult, fetchMatchResult } from "./fetchLatestMatchResult";
import { calScore } from "./calculateScore"

type MatchListItem = {
	matchId: number;
	href: string;
	name: string;
	date: string;
	club: string;
	level: string;
	updated_at: string;
};

const corsHeaders: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Max-Age": "86400",
};

const withCors = (response: Response): Response => {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders)) {
		headers.set(key, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

const jsonError = (status: number, error: string) => {
	return withCors(Response.json({ error }, { status }));
};

/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"` to see your Worker in action
 * - Run `npm run deploy` to publish your Worker
 *
 * Bind resources to your Worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
interface Env {
	BROWSER: BrowserRun;
	DB: D1Database;
}

export default {
	async fetch(req, env) {
		if (req.method === "OPTIONS") {
			return withCors(new Response(null, { status: 204 }));
		}

		if (req.method !== "GET") {
			return jsonError(405, "Method not allowed");
		}

		const url = new URL(req.url);
		const pathname = url.pathname;

		if (pathname === "/matches") {
			const result = await env.DB.prepare(`
				SELECT
					match_id AS matchId,
					href,
					name,
					date,
					club,
					level,
					updated_at
				FROM matches
				ORDER BY updated_at DESC, match_id DESC
			`).all<MatchListItem>();

			if (!result.success) {
				return jsonError(500, "Failed to fetch matches");
			}

			return withCors(Response.json(result.results ?? []));
		}

		const scorePathMatch = pathname.match(/^\/matches\/(\d+)\/score$/);
		if (scorePathMatch) {
			const matchId = Number(scorePathMatch[1]);
			if (!Number.isInteger(matchId) || matchId <= 0) {
				return jsonError(400, "Invalid match id");
			}

			try {
				const score = await calScore(env.DB, matchId);
				if (score === null) {
					return jsonError(404, "Match score not found");
				}
				return withCors(Response.json(score));
			} catch (error) {
				console.error("Failed to fetch match score", { matchId, error });
				return jsonError(500, "Failed to fetch match score");
			}
		}

		const fetchAllMatchPathMatch = pathname.match(/^\/matches\/fetch-all$/);
		if (fetchAllMatchPathMatch) {
			try {
				await fetchAllMatch(env.BROWSER, env.DB);
				return withCors(Response.json({ message: "All matches fetched successfully" }));
			} catch (error) {
				console.error("Failed to fetch all matches", { error });
				return jsonError(500, "Failed to fetch all matches");
			}
		}

		const fetchLastestResultPathMatch = pathname.match(/^\/matches\/latest\/result$/);
		if (fetchLastestResultPathMatch) {
			try {
				const success = await fetchLatestMatchResult(env.DB, env.BROWSER);
				if (success) {
					return withCors(Response.json({ message: "Latest match result fetched successfully" }));
				} else {
					return jsonError(404, "No matches found to fetch result");
				}
			} catch (error) {
				console.error("Failed to fetch latest match result", { error });
				return jsonError(500, "Failed to fetch latest match result");
			}
		}

		const fetchMatchResultPathMatch = pathname.match(/^\/matches\/(\d+)\/result$/);
		if (fetchMatchResultPathMatch) {
			const matchId = Number(fetchMatchResultPathMatch[1]);
			if (!Number.isInteger(matchId) || matchId <= 0) {
				return jsonError(400, "Invalid match id");
			}

			try {
				const match = await env.DB.prepare(`
					SELECT match_id, href, name, date, club, level, updated_at
					FROM matches
					WHERE match_id = ?
				`).bind(matchId).first<MatchListItem>();
				if(match) {
					await fetchMatchResult(matchId, match.href, env.BROWSER, env.DB);
					return withCors(Response.json({ message: "Match result fetched successfully" }));
				} else {
					return jsonError(404, "Match not found");
				}
			} catch(error) {
				console.error(error)
				return jsonError(500, "Failed to fetch match result");
			}
		}
		return jsonError(404, "Route not found");
	},

	// The scheduled handler is invoked at the interval set in our wrangler.jsonc's
	// [[triggers]] configuration.
	async scheduled(event, env, ctx): Promise<void> {
		// Write code for updating your API
		switch (event.cron) {
			case "0 8 * * *":
				// Every day at 8:00 AM
				await fetchAllMatch(env.BROWSER, env.DB);
				break;
			case "*/10 10-23 * * *":
				// Every ten minutes
				await fetchLatestMatchResult(env.DB, env.BROWSER);
				break;
		}
		console.log("cron processed");
	},
} satisfies ExportedHandler<Env>;
