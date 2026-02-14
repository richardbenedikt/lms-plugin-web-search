import { Tool, ToolsProviderController } from "@lmstudio/sdk";
import { createRateLimiter, TIME_BETWEEN_REQUESTS } from "./utils";
import { createWebSearchTool } from "./tools/webSearch";
import { createImageSearchTool } from "./tools/imageSearch";
import { createVisitWebsiteTool } from "./tools/visitWebsite";

export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
	const waitIfNeeded = createRateLimiter(TIME_BETWEEN_REQUESTS);

	const tools: Tool[] = [
		createWebSearchTool(ctl, waitIfNeeded),
		createImageSearchTool(ctl, waitIfNeeded),
		createVisitWebsiteTool(waitIfNeeded)
	];

	return tools;
}