import { tool } from "@lmstudio/sdk";
import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { getSpoofedHeaders } from "../utils";

export const createVisitWebsiteTool = (waitIfNeeded: () => Promise<void>) => tool({
	name: "visit_website",
	description: "Step 2: Read the content of a specific URL found via 'web_search'. You can call this multiple times to verify information across different sources.",
	parameters: {
		url: z.string().describe("The URL of the website to visit."),
	},
	implementation: async ({ url }, { status, warn, signal }) => {
		status(`Visiting ${url}...`);
		await waitIfNeeded();
		try {
			const headers = getSpoofedHeaders();
			const response = await fetch(url, {
				method: "GET",
				signal,
				headers,
			});
			if (!response.ok) {
				warn(`Failed to visit website: ${response.statusText}`);
				return `Error: Failed to visit website: ${response.statusText}`;
			}
			const html = await response.text();

			const dom = new JSDOM(html, { url });
			const reader = new Readability(dom.window.document);
			const article = reader.parse();

			let text = article ? article.textContent : "";

			// Fallback: If Readability fails to find an article, use the body text
			if (!text || text.length < 50) {
				text = dom.window.document.body.textContent || "";
			}

			// Clean up excessive whitespace
			text = text.replace(/\s+/g, " ").trim();

			if (text.length === 0) return "The website content is empty.";

			if (text.length > 20000) {
				text = text.substring(0, 20000) + "... (truncated)";
			}

			return `Source URL: ${url}\n\n${text}\n\nSYSTEM INSTRUCTION: You have read this source. Consider visiting additional sources to verify facts or gather more perspectives. You MUST cite the Source URL (${url}) at the end of your answer.`;
		} catch (error: any) {
			if (error instanceof DOMException && error.name === "AbortError") {
				return "Visit aborted by user.";
			}
			console.error(error);
			warn(`Error visiting website: ${error.message}`);
			return `Error: ${error.message}`;
		}
	},
});