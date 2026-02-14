import { tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { join } from "path";
import { writeFile } from "fs/promises";
import { configSchematics } from "../config";
import {
	MAX_PAGE_SIZE,
	DEFAULT_PAGE_SIZE,
	undefinedIfAuto,
	getSpoofedHeaders,
	applySafeSearchParam
} from "../utils";

export const createImageSearchTool = (ctl: ToolsProviderController, waitIfNeeded: () => Promise<void>) => tool({
	name: "image_search",
	description: "Search for images on DuckDuckGo. Returns a list of image URLs. Use this to find images matching a specific topic or description.",
	parameters: {
		query: z.string().describe("The search keywords."),
		pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(10).describe("Number of image results per page"),
		safeSearch: z.enum(["strict", "moderate", "off"]).optional().default("moderate").describe("Safe Search"),
		page: z.number().int().min(1).max(100).optional().default(1).describe("Page number for pagination"),
	},
	implementation: async ({ query, pageSize, safeSearch, page }, { status, warn, signal }) => {
		const searchQuery = query;
		if (!searchQuery) return "Error: No query provided.";

		if (/^https?:\/\//i.test(searchQuery.trim())) {
			return "Error: This tool is for image searching. You passed a URL. Please provide keywords to search for.";
		}

		status("Initiating DuckDuckGo image search...");
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
			const initialUrl = new URL("https://duckduckgo.com/");
			initialUrl.searchParams.append("q", searchQuery);
			initialUrl.searchParams.append("iax", "images");
			initialUrl.searchParams.append("ia", "images");

			const initialResponse = await fetch(initialUrl.toString(), {
				method: "GET",
				signal,
				headers,
			});

			if (!initialResponse.ok) {
				warn(`Failed to fetch initial response: ${initialResponse.statusText}`);
				return `Error: Failed to fetch initial response: ${initialResponse.statusText}`;
			}

			const initialHtml = await initialResponse.text();
			const vqd = initialHtml.match(/vqd="([^"]+)"/)?.[1] as string;
			if (!vqd) {
				warn("Failed to extract vqd token.");
				return "Error: Unable to extract vqd token.";
			}

			await new Promise(resolve => setTimeout(resolve, 1000));

			const searchUrl = new URL("https://duckduckgo.com/i.js");
			searchUrl.searchParams.append("q", searchQuery);
			searchUrl.searchParams.append("o", "json");
			searchUrl.searchParams.append("l", "us-en");
			searchUrl.searchParams.append("vqd", vqd);
			searchUrl.searchParams.append("f", ",,,,,");

			applySafeSearchParam(searchUrl, safeSearch);

			if (page > 1)
				searchUrl.searchParams.append("s", ((pageSize * (page - 1)) || 0).toString());

			const searchResponse = await fetch(searchUrl.toString(), {
				method: "GET",
				signal,
				headers,
			});

			if (!searchResponse.ok) {
				warn(`Failed to fetch image results: ${searchResponse.statusText}`);
				return `Error: Failed to fetch image results: ${searchResponse.statusText}`;
			}

			const data = await searchResponse.json();
			const imageResults = data.results || [];
			const imageURLs = imageResults
				.slice(0, pageSize)
				.map((result: any) => result.image)
				.filter((url: string) => url && url.match(/\.(jpg|png|gif|jpeg)$/i));

			if (imageURLs.length === 0)
				return "No images found for the query.";

			status(`Found ${imageURLs.length} images. Fetching...`);

			const workingDirectory = ctl.getWorkingDirectory();
			const timestamp = Date.now();
			const downloadPromises = imageURLs.map(async (url: string, i: number) => {
				const index = i + 1;
				try {
					const imageResponse = await fetch(url, {
						method: "GET",
						signal,
					});
					if (!imageResponse.ok) {
						return null;
					}
					const bytes = await imageResponse.bytes();
					if (bytes.length === 0) {
						return null;
					}

					const fileExtension = /image\/([\w]+)/.exec(imageResponse.headers.get('content-type') || '')?.[1]
						|| /\.([\w]+)(?:\?.*)$/.exec(url)?.[1]
						|| 'jpg';

					const fileName = `${timestamp}-${index}.${fileExtension}`;
					const filePath = join(workingDirectory, fileName);
					const localPath = filePath.replace(/\\/g, '/').replace(/^C:/, '');
					await writeFile(filePath, bytes, 'binary');
					return localPath;
				} catch (error: any) {
					if (error instanceof DOMException && error.name === "AbortError")
						return null;
					warn(`Error fetching image ${index}: ${error.message}`); // Keep warn for debugging
					return null; // Skip this image on error
				}
			});
			const downloadedImageURLs = (await Promise.all(downloadPromises)).map(x => x || 'Error downloading image');
			if (downloadedImageURLs.length === 0) {
				warn('Error fetching images');
				return imageURLs;
			}

			status(`Downloaded ${downloadedImageURLs.length} images successfully.`);

			return downloadedImageURLs;
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