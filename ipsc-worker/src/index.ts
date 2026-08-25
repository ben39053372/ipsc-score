import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchAllMatch } from "./fetchAllMatch";
import { fetchLatestMatchResult, fetchMatchResult } from "./fetchLatestMatchResult";
import { calScore } from "./calculateScore";

type MatchListItem = {
	matchId: number;
	href: string;
	name: string;
	date: string;
	club: string;
	level: string;
	updated_at: string;
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

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "OPTIONS"],
		allowHeaders: ["Content-Type"],
		maxAge: 86400,
	}),
);

app.use("*", async (c, next) => {
	if (c.req.method !== "GET" && c.req.method !== "OPTIONS") {
		return c.json({ error: "Method not allowed" }, 405);
	}
	await next();
});

app.get("/matches", async (c) => {
	const result = await c.env.DB.prepare(`
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
		return c.json({ error: "Failed to fetch matches" }, 500);
	}

	return c.json(result.results ?? []);
});

app.get("/matches/:matchId/score", async (c) => {
	const matchId = Number(c.req.param("matchId"));
	if (!Number.isInteger(matchId) || matchId <= 0) {
		return c.json({ error: "Invalid match id" }, 400);
	}

	try {
		const score = await calScore(c.env.DB, matchId);
		if (score === null) {
			return c.json({ error: "Match score not found" }, 404);
		}
		return c.json(score);
	} catch (error) {
		console.error("Failed to fetch match score", { matchId, error });
		return c.json({ error: "Failed to fetch match score" }, 500);
	}
});

app.get("/matches/fetch-all", async (c) => {
	try {
		await fetchAllMatch(c.env.BROWSER, c.env.DB);
		return c.json({ message: "All matches fetched successfully" });
	} catch (error) {
		console.error("Failed to fetch all matches", { error });
		return c.json({ error: "Failed to fetch all matches" }, 500);
	}
});

app.get("/matches/latest/result", async (c) => {
	try {
		const success = await fetchLatestMatchResult(c.env.DB, c.env.BROWSER);
		if (success) {
			return c.json({ message: "Latest match result fetched successfully" });
		}
		return c.json({ error: "No matches found to fetch result" }, 404);
	} catch (error) {
		console.error("Failed to fetch latest match result", { error });
		return c.json({ error: "Failed to fetch latest match result" }, 500);
	}
});

app.get("/matches/:matchId/result", async (c) => {
	const matchId = Number(c.req.param("matchId"));
	if (!Number.isInteger(matchId) || matchId <= 0) {
		return c.json({ error: "Invalid match id" }, 400);
	}

	try {
		const match = await c.env.DB.prepare(`
					SELECT match_id, href, name, date, club, level, updated_at
					FROM matches
					WHERE match_id = ?
				`).bind(matchId).first<MatchListItem>();
		if (match) {
			await fetchMatchResult(matchId, match.href, c.env.BROWSER, c.env.DB);
			return c.json({ message: "Match result fetched successfully" });
		}
		return c.json({ error: "Match not found" }, 404);
	} catch (error) {
		console.error(error);
		return c.json({ error: "Failed to fetch match result" }, 500);
	}
});

app.notFound((c) => c.json({ error: "Route not found" }, 404));

export default {
	fetch(req: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
		return app.fetch(req, env, ctx);
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
