import { fetchAllMatch } from "./fetchAllMatch";
import { fetchLatestMatchResult } from "./fetchLatestMatchResult";
import { calScore } from "./calculateScore"

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
		const url = new URL(req.url);

		const matchId = url.searchParams.get('matchId');
		if (matchId === null) {
			return new Response(`Please provide a matchId query parameter, e.g. ?matchId=123`);
		}
		const score = await calScore(env.DB, parseInt(matchId));
		return Response.json(score);
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
