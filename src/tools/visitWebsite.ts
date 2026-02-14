import { tool } from "@lmstudio/sdk";
import { z } from "zod";
import { getSpoofedHeaders } from "../utils";

export const createVisitWebsiteTool = (waitIfNeeded: () => Promise<void>) => tool({
	name: "visit_website",
	description: "Step 2: Read the content of a specific URL found via 'web_search'. Required to get the actual information. If the content is insufficient, search again.",
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

			let text = html
				.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, "")
				.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, "")
				.replace(/<!--[\s\S]*?-->/gim, "")
				.replace(/<(br|p|div|li|h[1-6]|tr)\s*\/?>/gim, "\n")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim();

			text = text
				.replace(/&nbsp;/g, " ")
				.replace(/&amp;/g, "&")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/&quot;/g, '"');

			if (text.length === 0) return "The website content is empty.";

			if (text.length > 20000) {
				text = text.substring(0, 20000) + "... (truncated)";
			}

			return text;
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