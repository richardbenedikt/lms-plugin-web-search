import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { join } from "path";
import { writeFile } from "fs/promises";
import { configSchematics } from "./config";

const TIME_BETWEEN_REQUESTS = 2000;
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 10;

const SPOOFED_USER_AGENTS = [
	"Mozilla/5.0 (Linux; Android 10; SM-M515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Mobile Safari/537.36",
	"Mozilla/5.0 (Linux; Android 6.0; E5533) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.101 Mobile Safari/537.36",
	"Mozilla/5.0 (Linux; Android 8.1.0; AX1082) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.83 Mobile Safari/537.36",
	"Mozilla/5.0 (Linux; Android 8.1.0; TM-MID1020A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.96 Safari/537.36",
	"Mozilla/5.0 (Linux; Android 9; POT-LX1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:97.0) Gecko/20100101 Firefox/97.0",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36 Edg/97.0.1072.71",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36 Edg/98.0.1108.62",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36",
	"Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
	"Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:97.0) Gecko/20100101 Firefox/97.0",
	"Opera/9.80 (Android 7.0; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16",
];

const undefinedIfAuto = <T>(value: T, autoValue: T) =>
	value === autoValue ? undefined : value;

const getSpoofedHeaders = () => ({
	'User-Agent': SPOOFED_USER_AGENTS[Math.floor(Math.random() * SPOOFED_USER_AGENTS.length)],
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9',
	'Accept-Encoding': 'gzip, deflate, br',
	'Connection': 'keep-alive',
	'Referer': 'https://duckduckgo.com/',
	'Origin': 'https://duckduckgo.com',
	'Upgrade-Insecure-Requests': '1',
	'Sec-Fetch-Dest': 'document',
	'Sec-Fetch-Mode': 'navigate',
	'Sec-Fetch-Site': 'same-origin',
	'Sec-Fetch-User': '?1',
	'Cache-Control': 'max-age=0',
});

const createRateLimiter = (interval: number) => {
	let lastRequestTimestamp = 0;
	return async () => {
		const now = Date.now();
		const difference = now - lastRequestTimestamp;
		if (difference < interval) {
			await new Promise(resolve => setTimeout(resolve, interval - difference));
		}
		lastRequestTimestamp = Date.now();
	};
};

export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
	const tools: Tool[] = [];
	const waitIfNeeded = createRateLimiter(TIME_BETWEEN_REQUESTS);

	const duckDuckGoWebSearchTool = tool({
		name: "Web Search",
		description: "Search the web using DuckDuckGo. Returns a list of relevant URLs and titles. Use this tool to find information, news, or websites. \n\nIMPORTANT: This tool only searches. To read the content of a website, use the 'Visit Website' tool with a URL from the search results.",
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
				return "Error: You provided a URL. This tool is for searching keywords only. Please use the 'Visit Website' tool to read the content of this URL.";
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
				
				if (safeSearch === "strict") url.searchParams.append("kp", "1");
				else if (safeSearch === "off") url.searchParams.append("kp", "-2");
				else url.searchParams.append("kp", "-1"); // Moderate

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

					try { url = decodeURIComponent(url); } catch (e) {}

					if (!links.some(([, existingUrl]) => existingUrl === url))
						links.push([label, url]);
				}
				if (links.length === 0) {
					return "No web pages found for the query.";
				}
				status(`Found ${links.length} web pages.`);
				return {
					links,
					count: links.length,
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

	const duckDuckGoImageSearchTool = tool({
		name: "Image Search",
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
				
				if (safeSearch === "strict") searchUrl.searchParams.append("kp", "1");
				else if (safeSearch === "off") searchUrl.searchParams.append("kp", "-2");
				else searchUrl.searchParams.append("kp", "-1"); // Moderate

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

	const visitWebsiteTool = tool({
		name: "Visit Website",
		description: "Visit a website and extract its text content. Use this tool when you have a URL and need to read the page.",
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


	tools.push(duckDuckGoWebSearchTool);
	tools.push(duckDuckGoImageSearchTool);
	tools.push(visitWebsiteTool);
	return tools;
}