import { tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { configSchematics } from "../config";
import {
	MAX_PAGE_SIZE,
	DEFAULT_PAGE_SIZE,
	undefinedIfAuto,
	getSpoofedHeaders,
	applySafeSearchParam
} from "../utils";

export const createWebSearchTool = (ctl: ToolsProviderController, waitIfNeeded: () => Promise<void>) => tool({
	name: "web_search",
	description: "Step 1: Find relevant URLs. Returns a list of links but NO content. If results are relevant, you MUST use 'visit_website' to read the page. If not, refine the query and search again.",
	parameters: {
		query: z.string().describe("The search keywords. Example: 'Nintendo Switch 2 news'"),
		pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional().describe("Number of web results per page"),
		safeSearch: z.enum(["strict", "moderate", "off"]).optional().describe("Safe Search"),
		page: z.number().int().min(1).max(100).optional().default(1).describe("Page number for pagination"),
	},
	implementation: async ({ query, pageSize, safeSearch, page }, { status, warn, signal }) => {
		const searchQuery = query;
		if (!searchQuery) return "Error: No query provided.";

		if (/^https?:\/\//i.test(searchQuery.trim())) {
			return "Error: You provided a URL. This tool is for searching keywords only. Please use the 'visit_website' tool to read the content of this URL.";
		}

		status("Initiating DuckDuckGo web search...");
		await waitIfNeeded();
		try {
			pageSize = undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("pageSize"), 0)
				?? pageSize
				?? DEFAULT_PAGE_SIZE;

			const configSafeSearch = undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("safeSearch"), "auto");
			safeSearch = (configSafeSearch as "strict" | "moderate" | "off" | undefined)
				?? safeSearch
				?? "moderate";

			const headers = getSpoofedHeaders();
			const url = new URL("https://duckduckgo.com/html/");
			url.searchParams.append("q", searchQuery);

			applySafeSearchParam(url, safeSearch);

			if (page > 1)
				url.searchParams.append("s", ((pageSize * (page - 1)) || 0).toString());

			const response = await fetch(url.toString(), {
				method: "GET",
				signal,
				headers,
			});
			if (!response.ok) {
				warn(`Failed to fetch search results: ${response.statusText}`);
				return `Error: Failed to fetch search results: ${response.statusText}`;
			}
			const html = await response.text();

			const links: [string, string][] = [];
			const regex = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
			let match;

			while (links.length < pageSize && (match = regex.exec(html))) {
				let url = match[1];
				let label = match[2];

				label = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

				const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
				if (uddgMatch) {
					url = decodeURIComponent(uddgMatch[1]);
				}

				if (!label || url.startsWith("/") || url.startsWith("javascript:") || url.includes("duckduckgo.com")) continue;
				if (["here", "more", "privacy", "terms", "settings", "feedback", "help"].includes(label.toLowerCase())) continue;

				try { url = decodeURIComponent(url); } catch (e) { }

				if (!links.some(([, existingUrl]) => existingUrl === url))
					links.push([label, url]);
			}
			if (links.length === 0) {
				return "No web pages found for the query.";
			}

			const currentDate = new Date().toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

			status(`Found ${links.length} web pages.`);
			return {
				candidates: links,
				current_date: currentDate,
				status: "incomplete",
				system_instruction: `Current Date: ${currentDate}. You have found potential links. To provide a verified and comprehensive answer, you should visit multiple relevant URLs. If the links are not relevant, call 'web_search' again with a different query. Do NOT answer based on titles alone. You MUST cite the source URLs in your final answer.`,
			};
		} catch (error: any) {
			if (error instanceof DOMException && error.name === "AbortError") {
				return "Search aborted by user.";
			}
			console.error(error);
			warn(`Error during search: ${error.message}`);
			return `Error: ${error.message}`;
		}
	},
});