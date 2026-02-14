"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config.ts
var import_sdk, configSchematics;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    import_sdk = require("@lmstudio/sdk");
    configSchematics = (0, import_sdk.createConfigSchematics)().field(
      "pageSize",
      "numeric",
      {
        displayName: "Search Results Per Page",
        subtitle: "Between 1 and 10, 0 = auto",
        min: 0,
        max: 10,
        int: true,
        slider: {
          step: 1,
          min: 1,
          max: 10
        }
      },
      0
    ).field(
      "safeSearch",
      "select",
      {
        options: [
          { value: "strict", displayName: "Strict" },
          { value: "moderate", displayName: "Moderate" },
          { value: "off", displayName: "Off" },
          { value: "auto", displayName: "Auto" }
        ],
        displayName: "Safe Search"
      },
      "auto"
    ).build();
  }
});

// src/toolsProvider.ts
async function toolsProvider(ctl) {
  const tools = [];
  const waitIfNeeded = createRateLimiter(TIME_BETWEEN_REQUESTS);
  const duckDuckGoWebSearchTool = (0, import_sdk2.tool)({
    name: "Web Search",
    description: "Search the web using DuckDuckGo. Returns a list of relevant URLs and titles. Use this tool to find information, news, or websites. \n\nIMPORTANT: This tool only searches. To read the content of a website, use the 'Visit Website' tool with a URL from the search results.",
    parameters: {
      query: import_zod.z.string().describe("The search keywords. Example: 'Nintendo Switch 2 news'"),
      pageSize: import_zod.z.number().int().min(1).max(MAX_PAGE_SIZE).optional().describe("Number of web results per page"),
      safeSearch: import_zod.z.enum(["strict", "moderate", "off"]).optional().describe("Safe Search"),
      page: import_zod.z.number().int().min(1).max(100).optional().default(1).describe("Page number for pagination")
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
        pageSize = undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("pageSize"), 0) ?? pageSize ?? DEFAULT_PAGE_SIZE;
        const configSafeSearch = undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("safeSearch"), "auto");
        safeSearch = configSafeSearch ?? safeSearch ?? "moderate";
        const headers = getSpoofedHeaders();
        const url = new URL("https://duckduckgo.com/html/");
        url.searchParams.append("q", searchQuery);
        if (safeSearch === "strict") url.searchParams.append("kp", "1");
        else if (safeSearch === "off") url.searchParams.append("kp", "-2");
        else url.searchParams.append("kp", "-1");
        if (page > 1)
          url.searchParams.append("s", (pageSize * (page - 1) || 0).toString());
        const response = await fetch(url.toString(), {
          method: "GET",
          signal,
          headers
        });
        if (!response.ok) {
          warn(`Failed to fetch search results: ${response.statusText}`);
          return `Error: Failed to fetch search results: ${response.statusText}`;
        }
        const html = await response.text();
        const links = [];
        const regex = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
        let match;
        while (links.length < pageSize && (match = regex.exec(html))) {
          let url2 = match[1];
          let label = match[2];
          label = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
          const uddgMatch = url2.match(/[?&]uddg=([^&]+)/);
          if (uddgMatch) {
            url2 = decodeURIComponent(uddgMatch[1]);
          }
          if (!label || url2.startsWith("/") || url2.startsWith("javascript:") || url2.includes("duckduckgo.com")) continue;
          if (["here", "more", "privacy", "terms", "settings", "feedback", "help"].includes(label.toLowerCase())) continue;
          try {
            url2 = decodeURIComponent(url2);
          } catch (e) {
          }
          if (!links.some(([, existingUrl]) => existingUrl === url2))
            links.push([label, url2]);
        }
        if (links.length === 0) {
          return "No web pages found for the query.";
        }
        status(`Found ${links.length} web pages.`);
        return {
          links,
          count: links.length
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "Search aborted by user.";
        }
        console.error(error);
        warn(`Error during search: ${error.message}`);
        return `Error: ${error.message}`;
      }
    }
  });
  const duckDuckGoImageSearchTool = (0, import_sdk2.tool)({
    name: "Image Search",
    description: "Search for images on DuckDuckGo. Returns a list of image URLs. Use this to find images matching a specific topic or description.",
    parameters: {
      query: import_zod.z.string().describe("The search keywords."),
      pageSize: import_zod.z.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(10).describe("Number of image results per page"),
      safeSearch: import_zod.z.enum(["strict", "moderate", "off"]).optional().default("moderate").describe("Safe Search"),
      page: import_zod.z.number().int().min(1).max(100).optional().default(1).describe("Page number for pagination")
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
        pageSize = undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("pageSize"), 0) ?? pageSize ?? DEFAULT_PAGE_SIZE;
        const configSafeSearch = undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("safeSearch"), "auto");
        safeSearch = configSafeSearch ?? safeSearch ?? "moderate";
        const headers = getSpoofedHeaders();
        const initialUrl = new URL("https://duckduckgo.com/");
        initialUrl.searchParams.append("q", searchQuery);
        initialUrl.searchParams.append("iax", "images");
        initialUrl.searchParams.append("ia", "images");
        const initialResponse = await fetch(initialUrl.toString(), {
          method: "GET",
          signal,
          headers
        });
        if (!initialResponse.ok) {
          warn(`Failed to fetch initial response: ${initialResponse.statusText}`);
          return `Error: Failed to fetch initial response: ${initialResponse.statusText}`;
        }
        const initialHtml = await initialResponse.text();
        const vqd = initialHtml.match(/vqd="([^"]+)"/)?.[1];
        if (!vqd) {
          warn("Failed to extract vqd token.");
          return "Error: Unable to extract vqd token.";
        }
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        const searchUrl = new URL("https://duckduckgo.com/i.js");
        searchUrl.searchParams.append("q", searchQuery);
        searchUrl.searchParams.append("o", "json");
        searchUrl.searchParams.append("l", "us-en");
        searchUrl.searchParams.append("vqd", vqd);
        searchUrl.searchParams.append("f", ",,,,,");
        if (safeSearch === "strict") searchUrl.searchParams.append("kp", "1");
        else if (safeSearch === "off") searchUrl.searchParams.append("kp", "-2");
        else searchUrl.searchParams.append("kp", "-1");
        if (page > 1)
          searchUrl.searchParams.append("s", (pageSize * (page - 1) || 0).toString());
        const searchResponse = await fetch(searchUrl.toString(), {
          method: "GET",
          signal,
          headers
        });
        if (!searchResponse.ok) {
          warn(`Failed to fetch image results: ${searchResponse.statusText}`);
          return `Error: Failed to fetch image results: ${searchResponse.statusText}`;
        }
        const data = await searchResponse.json();
        const imageResults = data.results || [];
        const imageURLs = imageResults.slice(0, pageSize).map((result) => result.image).filter((url) => url && url.match(/\.(jpg|png|gif|jpeg)$/i));
        if (imageURLs.length === 0)
          return "No images found for the query.";
        status(`Found ${imageURLs.length} images. Fetching...`);
        const workingDirectory = ctl.getWorkingDirectory();
        const timestamp = Date.now();
        const downloadPromises = imageURLs.map(async (url, i) => {
          const index = i + 1;
          try {
            const imageResponse = await fetch(url, {
              method: "GET",
              signal
            });
            if (!imageResponse.ok) {
              return null;
            }
            const bytes = await imageResponse.bytes();
            if (bytes.length === 0) {
              return null;
            }
            const fileExtension = /image\/([\w]+)/.exec(imageResponse.headers.get("content-type") || "")?.[1] || /\.([\w]+)(?:\?.*)$/.exec(url)?.[1] || "jpg";
            const fileName = `${timestamp}-${index}.${fileExtension}`;
            const filePath = (0, import_path.join)(workingDirectory, fileName);
            const localPath = filePath.replace(/\\/g, "/").replace(/^C:/, "");
            await (0, import_promises.writeFile)(filePath, bytes, "binary");
            return localPath;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
              return null;
            warn(`Error fetching image ${index}: ${error.message}`);
            return null;
          }
        });
        const downloadedImageURLs = (await Promise.all(downloadPromises)).map((x) => x || "Error downloading image");
        if (downloadedImageURLs.length === 0) {
          warn("Error fetching images");
          return imageURLs;
        }
        status(`Downloaded ${downloadedImageURLs.length} images successfully.`);
        return downloadedImageURLs;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "Search aborted by user.";
        }
        console.error(error);
        warn(`Error during search: ${error.message}`);
        return `Error: ${error.message}`;
      }
    }
  });
  const visitWebsiteTool = (0, import_sdk2.tool)({
    name: "Visit Website",
    description: "Visit a website and extract its text content. Use this tool when you have a URL and need to read the page.",
    parameters: {
      url: import_zod.z.string().describe("The URL of the website to visit.")
    },
    implementation: async ({ url }, { status, warn, signal }) => {
      status(`Visiting ${url}...`);
      await waitIfNeeded();
      try {
        const headers = getSpoofedHeaders();
        const response = await fetch(url, {
          method: "GET",
          signal,
          headers
        });
        if (!response.ok) {
          warn(`Failed to visit website: ${response.statusText}`);
          return `Error: Failed to visit website: ${response.statusText}`;
        }
        const html = await response.text();
        let text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, "").replace(/<!--[\s\S]*?-->/gim, "").replace(/<(br|p|div|li|h[1-6]|tr)\s*\/?>/gim, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
        if (text.length === 0) return "The website content is empty.";
        if (text.length > 2e4) {
          text = text.substring(0, 2e4) + "... (truncated)";
        }
        return text;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "Visit aborted by user.";
        }
        console.error(error);
        warn(`Error visiting website: ${error.message}`);
        return `Error: ${error.message}`;
      }
    }
  });
  tools.push(duckDuckGoWebSearchTool);
  tools.push(duckDuckGoImageSearchTool);
  tools.push(visitWebsiteTool);
  return tools;
}
var import_sdk2, import_zod, import_path, import_promises, TIME_BETWEEN_REQUESTS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SPOOFED_USER_AGENTS, undefinedIfAuto, getSpoofedHeaders, createRateLimiter;
var init_toolsProvider = __esm({
  "src/toolsProvider.ts"() {
    "use strict";
    import_sdk2 = require("@lmstudio/sdk");
    import_zod = require("zod");
    import_path = require("path");
    import_promises = require("fs/promises");
    init_config();
    TIME_BETWEEN_REQUESTS = 2e3;
    DEFAULT_PAGE_SIZE = 5;
    MAX_PAGE_SIZE = 10;
    SPOOFED_USER_AGENTS = [
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
      "Opera/9.80 (Android 7.0; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16"
    ];
    undefinedIfAuto = (value, autoValue) => value === autoValue ? void 0 : value;
    getSpoofedHeaders = () => ({
      "User-Agent": SPOOFED_USER_AGENTS[Math.floor(Math.random() * SPOOFED_USER_AGENTS.length)],
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Referer": "https://duckduckgo.com/",
      "Origin": "https://duckduckgo.com",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0"
    });
    createRateLimiter = (interval) => {
      let lastRequestTimestamp = 0;
      return async () => {
        const now = Date.now();
        const difference = now - lastRequestTimestamp;
        if (difference < interval) {
          await new Promise((resolve) => setTimeout(resolve, interval - difference));
        }
        lastRequestTimestamp = Date.now();
      };
    };
  }
});

// src/index.ts
var src_exports = {};
__export(src_exports, {
  main: () => main
});
async function main(context) {
  context.withConfigSchematics(configSchematics);
  context.withToolsProvider(toolsProvider);
}
var init_src = __esm({
  "src/index.ts"() {
    "use strict";
    init_toolsProvider();
    init_config();
  }
});

// .lmstudio/entry.ts
var import_sdk3 = require("@lmstudio/sdk");
var clientIdentifier = process.env.LMS_PLUGIN_CLIENT_IDENTIFIER;
var clientPasskey = process.env.LMS_PLUGIN_CLIENT_PASSKEY;
var baseUrl = process.env.LMS_PLUGIN_BASE_URL;
var client = new import_sdk3.LMStudioClient({
  clientIdentifier,
  clientPasskey,
  baseUrl
});
globalThis.__LMS_PLUGIN_CONTEXT = true;
var predictionLoopHandlerSet = false;
var promptPreprocessorSet = false;
var configSchematicsSet = false;
var globalConfigSchematicsSet = false;
var toolsProviderSet = false;
var generatorSet = false;
var selfRegistrationHost = client.plugins.getSelfRegistrationHost();
var pluginContext = {
  withPredictionLoopHandler: (generate) => {
    if (predictionLoopHandlerSet) {
      throw new Error("PredictionLoopHandler already registered");
    }
    if (toolsProviderSet) {
      throw new Error("PredictionLoopHandler cannot be used with a tools provider");
    }
    predictionLoopHandlerSet = true;
    selfRegistrationHost.setPredictionLoopHandler(generate);
    return pluginContext;
  },
  withPromptPreprocessor: (preprocess) => {
    if (promptPreprocessorSet) {
      throw new Error("PromptPreprocessor already registered");
    }
    promptPreprocessorSet = true;
    selfRegistrationHost.setPromptPreprocessor(preprocess);
    return pluginContext;
  },
  withConfigSchematics: (configSchematics2) => {
    if (configSchematicsSet) {
      throw new Error("Config schematics already registered");
    }
    configSchematicsSet = true;
    selfRegistrationHost.setConfigSchematics(configSchematics2);
    return pluginContext;
  },
  withGlobalConfigSchematics: (globalConfigSchematics) => {
    if (globalConfigSchematicsSet) {
      throw new Error("Global config schematics already registered");
    }
    globalConfigSchematicsSet = true;
    selfRegistrationHost.setGlobalConfigSchematics(globalConfigSchematics);
    return pluginContext;
  },
  withToolsProvider: (toolsProvider2) => {
    if (toolsProviderSet) {
      throw new Error("Tools provider already registered");
    }
    if (predictionLoopHandlerSet) {
      throw new Error("Tools provider cannot be used with a predictionLoopHandler");
    }
    toolsProviderSet = true;
    selfRegistrationHost.setToolsProvider(toolsProvider2);
    return pluginContext;
  },
  withGenerator: (generator) => {
    if (generatorSet) {
      throw new Error("Generator already registered");
    }
    generatorSet = true;
    selfRegistrationHost.setGenerator(generator);
    return pluginContext;
  }
};
Promise.resolve().then(() => (init_src(), src_exports)).then(async (module2) => {
  return await module2.main(pluginContext);
}).then(() => {
  selfRegistrationHost.initCompleted();
}).catch((error) => {
  console.error("Failed to execute the main function of the plugin.");
  console.error(error);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2NvbmZpZy50cyIsICIuLi9zcmMvdG9vbHNQcm92aWRlci50cyIsICIuLi9zcmMvaW5kZXgudHMiLCAiZW50cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUNvbmZpZ1NjaGVtYXRpY3MgfSBmcm9tIFwiQGxtc3R1ZGlvL3Nka1wiO1xuXG5leHBvcnQgY29uc3QgY29uZmlnU2NoZW1hdGljcyA9IGNyZWF0ZUNvbmZpZ1NjaGVtYXRpY3MoKVxuXHQuZmllbGQoXG5cdFx0XCJwYWdlU2l6ZVwiLFxuXHRcdFwibnVtZXJpY1wiLFxuXHRcdHtcblx0XHRcdGRpc3BsYXlOYW1lOiBcIlNlYXJjaCBSZXN1bHRzIFBlciBQYWdlXCIsXG5cdFx0XHRzdWJ0aXRsZTogXCJCZXR3ZWVuIDEgYW5kIDEwLCAwID0gYXV0b1wiLFxuXHRcdFx0bWluOiAwLFxuXHRcdFx0bWF4OiAxMCxcblx0XHRcdGludDogdHJ1ZSxcblx0XHRcdHNsaWRlcjoge1xuXHRcdFx0XHRzdGVwOiAxLFxuXHRcdFx0XHRtaW46IDEsXG5cdFx0XHRcdG1heDogMTAsXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0MFxuXHQpXG5cdC5maWVsZChcblx0XHRcInNhZmVTZWFyY2hcIixcblx0XHRcInNlbGVjdFwiLFxuXHRcdHtcblx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0eyB2YWx1ZTogXCJzdHJpY3RcIiwgZGlzcGxheU5hbWU6IFwiU3RyaWN0XCIgfSxcblx0XHRcdFx0eyB2YWx1ZTogXCJtb2RlcmF0ZVwiLCBkaXNwbGF5TmFtZTogXCJNb2RlcmF0ZVwiIH0sXG5cdFx0XHRcdHsgdmFsdWU6IFwib2ZmXCIsIGRpc3BsYXlOYW1lOiBcIk9mZlwiIH0sXG5cdFx0XHRcdHsgdmFsdWU6IFwiYXV0b1wiLCBkaXNwbGF5TmFtZTogXCJBdXRvXCIgfSxcblx0XHRcdF0sXG5cdFx0XHRkaXNwbGF5TmFtZTogXCJTYWZlIFNlYXJjaFwiLFxuXHRcdH0sXG5cdFx0XCJhdXRvXCJcblx0KVxuXHQuYnVpbGQoKTsiLCAiaW1wb3J0IHsgdG9vbCwgVG9vbCwgVG9vbHNQcm92aWRlckNvbnRyb2xsZXIgfSBmcm9tIFwiQGxtc3R1ZGlvL3Nka1wiO1xuaW1wb3J0IHsgeiB9IGZyb20gXCJ6b2RcIjtcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgd3JpdGVGaWxlIH0gZnJvbSBcImZzL3Byb21pc2VzXCI7XG5pbXBvcnQgeyBjb25maWdTY2hlbWF0aWNzIH0gZnJvbSBcIi4vY29uZmlnXCI7XG5cbmNvbnN0IFRJTUVfQkVUV0VFTl9SRVFVRVNUUyA9IDIwMDA7XG5jb25zdCBERUZBVUxUX1BBR0VfU0laRSA9IDU7XG5jb25zdCBNQVhfUEFHRV9TSVpFID0gMTA7XG5cbmNvbnN0IFNQT09GRURfVVNFUl9BR0VOVFMgPSBbXG5cdFwiTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDEwOyBTTS1NNTE1RikgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzg3LjAuNDI4MC4xNDEgTW9iaWxlIFNhZmFyaS81MzcuMzZcIixcblx0XCJNb3ppbGxhLzUuMCAoTGludXg7IEFuZHJvaWQgNi4wOyBFNTUzMykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzgzLjAuNDEwMy4xMDEgTW9iaWxlIFNhZmFyaS81MzcuMzZcIixcblx0XCJNb3ppbGxhLzUuMCAoTGludXg7IEFuZHJvaWQgOC4xLjA7IEFYMTA4MikgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzgzLjAuNDEwMy44MyBNb2JpbGUgU2FmYXJpLzUzNy4zNlwiLFxuXHRcIk1vemlsbGEvNS4wIChMaW51eDsgQW5kcm9pZCA4LjEuMDsgVE0tTUlEMTAyMEEpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS84My4wLjQxMDMuOTYgU2FmYXJpLzUzNy4zNlwiLFxuXHRcIk1vemlsbGEvNS4wIChMaW51eDsgQW5kcm9pZCA5OyBQT1QtTFgxKSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvOTYuMC40NjY0LjQ1IE1vYmlsZSBTYWZhcmkvNTM3LjM2XCIsXG5cdFwiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzk3LjAuNDY5Mi43MSBTYWZhcmkvNTM3LjM2XCIsXG5cdFwiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzk4LjAuNDc1OC44MCBTYWZhcmkvNTM3LjM2XCIsXG5cdFwiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE0LjAuMyBTYWZhcmkvNjA1LjEuMTVcIixcblx0XCJNb3ppbGxhLzUuMCAoTWFjaW50b3NoOyBJbnRlbCBNYWMgT1MgWCAxMF8xNV83KSBBcHBsZVdlYktpdC82MDUuMS4xNSAoS0hUTUwsIGxpa2UgR2Vja28pIFZlcnNpb24vMTguMy4xIFNhZmFyaS82MDUuMS4xNVwiLFxuXHRcIk1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2Ojk3LjApIEdlY2tvLzIwMTAwMTAxIEZpcmVmb3gvOTcuMFwiLFxuXHRcIk1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMzQuMC4wLjAgU2FmYXJpLzUzNy4zNiBFZGcvMTM0LjAuMC4wXCIsXG5cdFwiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzk3LjAuNDY5Mi43MSBTYWZhcmkvNTM3LjM2IEVkZy85Ny4wLjEwNzIuNzFcIixcblx0XCJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvOTcuMC40NjkyLjcxIFNhZmFyaS81MzcuMzZcIixcblx0XCJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvOTguMC40NzU4LjgwIFNhZmFyaS81MzcuMzYgRWRnLzk4LjAuMTEwOC42MlwiLFxuXHRcIk1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS85OC4wLjQ3NTguODAgU2FmYXJpLzUzNy4zNlwiLFxuXHRcIk1vemlsbGEvNS4wIChYMTE7IENyT1MgeDg2XzY0IDE0NTQxLjAuMCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEzNC4wLjAuMCBTYWZhcmkvNTM3LjM2XCIsXG5cdFwiTW96aWxsYS81LjAgKFgxMTsgTGludXggeDg2XzY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvOTcuMC40NjkyLjcxIFNhZmFyaS81MzcuMzZcIixcblx0XCJNb3ppbGxhLzUuMCAoWDExOyBVYnVudHU7IExpbnV4IHg4Nl82NDsgcnY6OTcuMCkgR2Vja28vMjAxMDAxMDEgRmlyZWZveC85Ny4wXCIsXG5cdFwiT3BlcmEvOS44MCAoQW5kcm9pZCA3LjA7IE9wZXJhIE1pbmkvMzYuMi4yMjU0LzExOS4xMzI7IFU7IGlkKSBQcmVzdG8vMi4xMi40MjMgVmVyc2lvbi8xMi4xNlwiLFxuXTtcblxuY29uc3QgdW5kZWZpbmVkSWZBdXRvID0gPFQ+KHZhbHVlOiBULCBhdXRvVmFsdWU6IFQpID0+XG5cdHZhbHVlID09PSBhdXRvVmFsdWUgPyB1bmRlZmluZWQgOiB2YWx1ZTtcblxuY29uc3QgZ2V0U3Bvb2ZlZEhlYWRlcnMgPSAoKSA9PiAoe1xuXHQnVXNlci1BZ2VudCc6IFNQT09GRURfVVNFUl9BR0VOVFNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogU1BPT0ZFRF9VU0VSX0FHRU5UUy5sZW5ndGgpXSxcblx0J0FjY2VwdCc6ICd0ZXh0L2h0bWwsYXBwbGljYXRpb24veGh0bWwreG1sLGFwcGxpY2F0aW9uL3htbDtxPTAuOSxpbWFnZS93ZWJwLGltYWdlL2FwbmcsKi8qO3E9MC44Jyxcblx0J0FjY2VwdC1MYW5ndWFnZSc6ICdlbi1VUyxlbjtxPTAuOScsXG5cdCdBY2NlcHQtRW5jb2RpbmcnOiAnZ3ppcCwgZGVmbGF0ZSwgYnInLFxuXHQnQ29ubmVjdGlvbic6ICdrZWVwLWFsaXZlJyxcblx0J1JlZmVyZXInOiAnaHR0cHM6Ly9kdWNrZHVja2dvLmNvbS8nLFxuXHQnT3JpZ2luJzogJ2h0dHBzOi8vZHVja2R1Y2tnby5jb20nLFxuXHQnVXBncmFkZS1JbnNlY3VyZS1SZXF1ZXN0cyc6ICcxJyxcblx0J1NlYy1GZXRjaC1EZXN0JzogJ2RvY3VtZW50Jyxcblx0J1NlYy1GZXRjaC1Nb2RlJzogJ25hdmlnYXRlJyxcblx0J1NlYy1GZXRjaC1TaXRlJzogJ3NhbWUtb3JpZ2luJyxcblx0J1NlYy1GZXRjaC1Vc2VyJzogJz8xJyxcblx0J0NhY2hlLUNvbnRyb2wnOiAnbWF4LWFnZT0wJyxcbn0pO1xuXG5jb25zdCBjcmVhdGVSYXRlTGltaXRlciA9IChpbnRlcnZhbDogbnVtYmVyKSA9PiB7XG5cdGxldCBsYXN0UmVxdWVzdFRpbWVzdGFtcCA9IDA7XG5cdHJldHVybiBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBkaWZmZXJlbmNlID0gbm93IC0gbGFzdFJlcXVlc3RUaW1lc3RhbXA7XG5cdFx0aWYgKGRpZmZlcmVuY2UgPCBpbnRlcnZhbCkge1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGludGVydmFsIC0gZGlmZmVyZW5jZSkpO1xuXHRcdH1cblx0XHRsYXN0UmVxdWVzdFRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cdH07XG59O1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdG9vbHNQcm92aWRlcihjdGw6IFRvb2xzUHJvdmlkZXJDb250cm9sbGVyKTogUHJvbWlzZTxUb29sW10+IHtcblx0Y29uc3QgdG9vbHM6IFRvb2xbXSA9IFtdO1xuXHRjb25zdCB3YWl0SWZOZWVkZWQgPSBjcmVhdGVSYXRlTGltaXRlcihUSU1FX0JFVFdFRU5fUkVRVUVTVFMpO1xuXG5cdGNvbnN0IGR1Y2tEdWNrR29XZWJTZWFyY2hUb29sID0gdG9vbCh7XG5cdFx0bmFtZTogXCJXZWIgU2VhcmNoXCIsXG5cdFx0ZGVzY3JpcHRpb246IFwiU2VhcmNoIHRoZSB3ZWIgdXNpbmcgRHVja0R1Y2tHby4gUmV0dXJucyBhIGxpc3Qgb2YgcmVsZXZhbnQgVVJMcyBhbmQgdGl0bGVzLiBVc2UgdGhpcyB0b29sIHRvIGZpbmQgaW5mb3JtYXRpb24sIG5ld3MsIG9yIHdlYnNpdGVzLiBcXG5cXG5JTVBPUlRBTlQ6IFRoaXMgdG9vbCBvbmx5IHNlYXJjaGVzLiBUbyByZWFkIHRoZSBjb250ZW50IG9mIGEgd2Vic2l0ZSwgdXNlIHRoZSAnVmlzaXQgV2Vic2l0ZScgdG9vbCB3aXRoIGEgVVJMIGZyb20gdGhlIHNlYXJjaCByZXN1bHRzLlwiLFxuXHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdHF1ZXJ5OiB6LnN0cmluZygpLmRlc2NyaWJlKFwiVGhlIHNlYXJjaCBrZXl3b3Jkcy4gRXhhbXBsZTogJ05pbnRlbmRvIFN3aXRjaCAyIG5ld3MnXCIpLFxuXHRcdFx0cGFnZVNpemU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLm1heChNQVhfUEFHRV9TSVpFKS5vcHRpb25hbCgpLmRlc2NyaWJlKFwiTnVtYmVyIG9mIHdlYiByZXN1bHRzIHBlciBwYWdlXCIpLFxuXHRcdFx0c2FmZVNlYXJjaDogei5lbnVtKFtcInN0cmljdFwiLCBcIm1vZGVyYXRlXCIsIFwib2ZmXCJdKS5vcHRpb25hbCgpLmRlc2NyaWJlKFwiU2FmZSBTZWFyY2hcIiksXG5cdFx0XHRwYWdlOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5tYXgoMTAwKS5vcHRpb25hbCgpLmRlZmF1bHQoMSkuZGVzY3JpYmUoXCJQYWdlIG51bWJlciBmb3IgcGFnaW5hdGlvblwiKSxcblx0XHR9LFxuXHRcdGltcGxlbWVudGF0aW9uOiBhc3luYyAoeyBxdWVyeSwgcGFnZVNpemUsIHNhZmVTZWFyY2gsIHBhZ2UgfSwgeyBzdGF0dXMsIHdhcm4sIHNpZ25hbCB9KSA9PiB7XG5cdFx0XHRjb25zdCBzZWFyY2hRdWVyeSA9IHF1ZXJ5O1xuXHRcdFx0aWYgKCFzZWFyY2hRdWVyeSkgcmV0dXJuIFwiRXJyb3I6IE5vIHF1ZXJ5IHByb3ZpZGVkLlwiO1xuXG5cdFx0XHRpZiAoL15odHRwcz86XFwvXFwvL2kudGVzdChzZWFyY2hRdWVyeS50cmltKCkpKSB7XG5cdFx0XHRcdHJldHVybiBcIkVycm9yOiBZb3UgcHJvdmlkZWQgYSBVUkwuIFRoaXMgdG9vbCBpcyBmb3Igc2VhcmNoaW5nIGtleXdvcmRzIG9ubHkuIFBsZWFzZSB1c2UgdGhlICdWaXNpdCBXZWJzaXRlJyB0b29sIHRvIHJlYWQgdGhlIGNvbnRlbnQgb2YgdGhpcyBVUkwuXCI7XG5cdFx0XHR9XG5cblx0XHRcdHN0YXR1cyhcIkluaXRpYXRpbmcgRHVja0R1Y2tHbyB3ZWIgc2VhcmNoLi4uXCIpO1xuXHRcdFx0YXdhaXQgd2FpdElmTmVlZGVkKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwYWdlU2l6ZSA9IHVuZGVmaW5lZElmQXV0byhjdGwuZ2V0UGx1Z2luQ29uZmlnKGNvbmZpZ1NjaGVtYXRpY3MpLmdldChcInBhZ2VTaXplXCIpLCAwKVxuXHRcdFx0XHRcdD8/IHBhZ2VTaXplXG5cdFx0XHRcdFx0Pz8gREVGQVVMVF9QQUdFX1NJWkU7XG5cblx0XHRcdFx0Y29uc3QgY29uZmlnU2FmZVNlYXJjaCA9IHVuZGVmaW5lZElmQXV0byhjdGwuZ2V0UGx1Z2luQ29uZmlnKGNvbmZpZ1NjaGVtYXRpY3MpLmdldChcInNhZmVTZWFyY2hcIiksIFwiYXV0b1wiKTtcblx0XHRcdFx0c2FmZVNlYXJjaCA9IChjb25maWdTYWZlU2VhcmNoIGFzIFwic3RyaWN0XCIgfCBcIm1vZGVyYXRlXCIgfCBcIm9mZlwiIHwgdW5kZWZpbmVkKVxuXHRcdFx0XHRcdD8/IHNhZmVTZWFyY2hcblx0XHRcdFx0XHQ/PyBcIm1vZGVyYXRlXCI7XG5cblx0XHRcdFx0Y29uc3QgaGVhZGVycyA9IGdldFNwb29mZWRIZWFkZXJzKCk7XG5cdFx0XHRcdGNvbnN0IHVybCA9IG5ldyBVUkwoXCJodHRwczovL2R1Y2tkdWNrZ28uY29tL2h0bWwvXCIpO1xuXHRcdFx0XHR1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZChcInFcIiwgc2VhcmNoUXVlcnkpO1xuXHRcdFx0XHRcblx0XHRcdFx0aWYgKHNhZmVTZWFyY2ggPT09IFwic3RyaWN0XCIpIHVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKFwia3BcIiwgXCIxXCIpO1xuXHRcdFx0XHRlbHNlIGlmIChzYWZlU2VhcmNoID09PSBcIm9mZlwiKSB1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZChcImtwXCIsIFwiLTJcIik7XG5cdFx0XHRcdGVsc2UgdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoXCJrcFwiLCBcIi0xXCIpOyAvLyBNb2RlcmF0ZVxuXG5cdFx0XHRcdGlmIChwYWdlID4gMSlcblx0XHRcdFx0XHR1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZChcInNcIiwgKChwYWdlU2l6ZSAqIChwYWdlIC0gMSkpIHx8IDApLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0XHRcdFx0c2lnbmFsLFxuXHRcdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRcdFx0d2FybihgRmFpbGVkIHRvIGZldGNoIHNlYXJjaCByZXN1bHRzOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIGBFcnJvcjogRmFpbGVkIHRvIGZldGNoIHNlYXJjaCByZXN1bHRzOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBodG1sID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXG5cdFx0XHRcdGNvbnN0IGxpbmtzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgcmVnZXggPSAvPGFbXj5dK2hyZWY9XCIoW15cIl0rKVwiW14+XSo+KC4qPyk8XFwvYT4vZ2lzO1xuXHRcdFx0XHRsZXQgbWF0Y2g7XG5cblx0XHRcdFx0d2hpbGUgKGxpbmtzLmxlbmd0aCA8IHBhZ2VTaXplICYmIChtYXRjaCA9IHJlZ2V4LmV4ZWMoaHRtbCkpKSB7XG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hdGNoWzFdO1xuXHRcdFx0XHRcdGxldCBsYWJlbCA9IG1hdGNoWzJdO1xuXG5cdFx0XHRcdFx0bGFiZWwgPSBsYWJlbC5yZXBsYWNlKC88W14+XSs+L2csIFwiXCIpLnJlcGxhY2UoL1xccysvZywgXCIgXCIpLnRyaW0oKTtcblxuXHRcdFx0XHRcdGNvbnN0IHVkZGdNYXRjaCA9IHVybC5tYXRjaCgvWz8mXXVkZGc9KFteJl0rKS8pO1xuXHRcdFx0XHRcdGlmICh1ZGRnTWF0Y2gpIHtcblx0XHRcdFx0XHRcdHVybCA9IGRlY29kZVVSSUNvbXBvbmVudCh1ZGRnTWF0Y2hbMV0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghbGFiZWwgfHwgdXJsLnN0YXJ0c1dpdGgoXCIvXCIpIHx8IHVybC5zdGFydHNXaXRoKFwiamF2YXNjcmlwdDpcIikgfHwgdXJsLmluY2x1ZGVzKFwiZHVja2R1Y2tnby5jb21cIikpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdGlmIChbXCJoZXJlXCIsIFwibW9yZVwiLCBcInByaXZhY3lcIiwgXCJ0ZXJtc1wiLCBcInNldHRpbmdzXCIsIFwiZmVlZGJhY2tcIiwgXCJoZWxwXCJdLmluY2x1ZGVzKGxhYmVsLnRvTG93ZXJDYXNlKCkpKSBjb250aW51ZTtcblxuXHRcdFx0XHRcdHRyeSB7IHVybCA9IGRlY29kZVVSSUNvbXBvbmVudCh1cmwpOyB9IGNhdGNoIChlKSB7fVxuXG5cdFx0XHRcdFx0aWYgKCFsaW5rcy5zb21lKChbLCBleGlzdGluZ1VybF0pID0+IGV4aXN0aW5nVXJsID09PSB1cmwpKVxuXHRcdFx0XHRcdFx0bGlua3MucHVzaChbbGFiZWwsIHVybF0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsaW5rcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gXCJObyB3ZWIgcGFnZXMgZm91bmQgZm9yIHRoZSBxdWVyeS5cIjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGF0dXMoYEZvdW5kICR7bGlua3MubGVuZ3RofSB3ZWIgcGFnZXMuYCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGlua3MsXG5cdFx0XHRcdFx0Y291bnQ6IGxpbmtzLmxlbmd0aCxcblx0XHRcdFx0fTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcblx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVycm9yLm5hbWUgPT09IFwiQWJvcnRFcnJvclwiKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFwiU2VhcmNoIGFib3J0ZWQgYnkgdXNlci5cIjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0d2FybihgRXJyb3IgZHVyaW5nIHNlYXJjaDogJHtlcnJvci5tZXNzYWdlfWApO1xuXHRcdFx0XHRyZXR1cm4gYEVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YDtcblx0XHRcdH1cblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCBkdWNrRHVja0dvSW1hZ2VTZWFyY2hUb29sID0gdG9vbCh7XG5cdFx0bmFtZTogXCJJbWFnZSBTZWFyY2hcIixcblx0XHRkZXNjcmlwdGlvbjogXCJTZWFyY2ggZm9yIGltYWdlcyBvbiBEdWNrRHVja0dvLiBSZXR1cm5zIGEgbGlzdCBvZiBpbWFnZSBVUkxzLiBVc2UgdGhpcyB0byBmaW5kIGltYWdlcyBtYXRjaGluZyBhIHNwZWNpZmljIHRvcGljIG9yIGRlc2NyaXB0aW9uLlwiLFxuXHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdHF1ZXJ5OiB6LnN0cmluZygpLmRlc2NyaWJlKFwiVGhlIHNlYXJjaCBrZXl3b3Jkcy5cIiksXG5cdFx0XHRwYWdlU2l6ZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkubWF4KE1BWF9QQUdFX1NJWkUpLm9wdGlvbmFsKCkuZGVmYXVsdCgxMCkuZGVzY3JpYmUoXCJOdW1iZXIgb2YgaW1hZ2UgcmVzdWx0cyBwZXIgcGFnZVwiKSxcblx0XHRcdHNhZmVTZWFyY2g6IHouZW51bShbXCJzdHJpY3RcIiwgXCJtb2RlcmF0ZVwiLCBcIm9mZlwiXSkub3B0aW9uYWwoKS5kZWZhdWx0KFwibW9kZXJhdGVcIikuZGVzY3JpYmUoXCJTYWZlIFNlYXJjaFwiKSxcblx0XHRcdHBhZ2U6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLm1heCgxMDApLm9wdGlvbmFsKCkuZGVmYXVsdCgxKS5kZXNjcmliZShcIlBhZ2UgbnVtYmVyIGZvciBwYWdpbmF0aW9uXCIpLFxuXHRcdH0sXG5cdFx0aW1wbGVtZW50YXRpb246IGFzeW5jICh7IHF1ZXJ5LCBwYWdlU2l6ZSwgc2FmZVNlYXJjaCwgcGFnZSB9LCB7IHN0YXR1cywgd2Fybiwgc2lnbmFsIH0pID0+IHtcblx0XHRcdGNvbnN0IHNlYXJjaFF1ZXJ5ID0gcXVlcnk7XG5cdFx0XHRpZiAoIXNlYXJjaFF1ZXJ5KSByZXR1cm4gXCJFcnJvcjogTm8gcXVlcnkgcHJvdmlkZWQuXCI7XG5cblx0XHRcdGlmICgvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHNlYXJjaFF1ZXJ5LnRyaW0oKSkpIHtcblx0XHRcdFx0cmV0dXJuIFwiRXJyb3I6IFRoaXMgdG9vbCBpcyBmb3IgaW1hZ2Ugc2VhcmNoaW5nLiBZb3UgcGFzc2VkIGEgVVJMLiBQbGVhc2UgcHJvdmlkZSBrZXl3b3JkcyB0byBzZWFyY2ggZm9yLlwiO1xuXHRcdFx0fVxuXG5cdFx0XHRzdGF0dXMoXCJJbml0aWF0aW5nIER1Y2tEdWNrR28gaW1hZ2Ugc2VhcmNoLi4uXCIpO1xuXHRcdFx0YXdhaXQgd2FpdElmTmVlZGVkKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwYWdlU2l6ZSA9IHVuZGVmaW5lZElmQXV0byhjdGwuZ2V0UGx1Z2luQ29uZmlnKGNvbmZpZ1NjaGVtYXRpY3MpLmdldChcInBhZ2VTaXplXCIpLCAwKVxuXHRcdFx0XHRcdD8/IHBhZ2VTaXplXG5cdFx0XHRcdFx0Pz8gREVGQVVMVF9QQUdFX1NJWkU7XG5cblx0XHRcdFx0Y29uc3QgY29uZmlnU2FmZVNlYXJjaCA9IHVuZGVmaW5lZElmQXV0byhjdGwuZ2V0UGx1Z2luQ29uZmlnKGNvbmZpZ1NjaGVtYXRpY3MpLmdldChcInNhZmVTZWFyY2hcIiksIFwiYXV0b1wiKTtcblx0XHRcdFx0c2FmZVNlYXJjaCA9IChjb25maWdTYWZlU2VhcmNoIGFzIFwic3RyaWN0XCIgfCBcIm1vZGVyYXRlXCIgfCBcIm9mZlwiIHwgdW5kZWZpbmVkKVxuXHRcdFx0XHRcdD8/IHNhZmVTZWFyY2hcblx0XHRcdFx0XHQ/PyBcIm1vZGVyYXRlXCI7XG5cblx0XHRcdFx0Y29uc3QgaGVhZGVycyA9IGdldFNwb29mZWRIZWFkZXJzKCk7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxVcmwgPSBuZXcgVVJMKFwiaHR0cHM6Ly9kdWNrZHVja2dvLmNvbS9cIik7XG5cdFx0XHRcdGluaXRpYWxVcmwuc2VhcmNoUGFyYW1zLmFwcGVuZChcInFcIiwgc2VhcmNoUXVlcnkpO1xuXHRcdFx0XHRpbml0aWFsVXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoXCJpYXhcIiwgXCJpbWFnZXNcIik7XG5cdFx0XHRcdGluaXRpYWxVcmwuc2VhcmNoUGFyYW1zLmFwcGVuZChcImlhXCIsIFwiaW1hZ2VzXCIpO1xuXG5cdFx0XHRcdGNvbnN0IGluaXRpYWxSZXNwb25zZSA9IGF3YWl0IGZldGNoKGluaXRpYWxVcmwudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRcdG1ldGhvZDogXCJHRVRcIixcblx0XHRcdFx0XHRzaWduYWwsXG5cdFx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCFpbml0aWFsUmVzcG9uc2Uub2spIHtcblx0XHRcdFx0XHR3YXJuKGBGYWlsZWQgdG8gZmV0Y2ggaW5pdGlhbCByZXNwb25zZTogJHtpbml0aWFsUmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcblx0XHRcdFx0XHRyZXR1cm4gYEVycm9yOiBGYWlsZWQgdG8gZmV0Y2ggaW5pdGlhbCByZXNwb25zZTogJHtpbml0aWFsUmVzcG9uc2Uuc3RhdHVzVGV4dH1gO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaW5pdGlhbEh0bWwgPSBhd2FpdCBpbml0aWFsUmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0XHRjb25zdCB2cWQgPSBpbml0aWFsSHRtbC5tYXRjaCgvdnFkPVwiKFteXCJdKylcIi8pPy5bMV0gYXMgc3RyaW5nO1xuXHRcdFx0XHRpZiAoIXZxZCkge1xuXHRcdFx0XHRcdHdhcm4oXCJGYWlsZWQgdG8gZXh0cmFjdCB2cWQgdG9rZW4uXCIpO1xuXHRcdFx0XHRcdHJldHVybiBcIkVycm9yOiBVbmFibGUgdG8gZXh0cmFjdCB2cWQgdG9rZW4uXCI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwMCkpO1xuXG5cdFx0XHRcdGNvbnN0IHNlYXJjaFVybCA9IG5ldyBVUkwoXCJodHRwczovL2R1Y2tkdWNrZ28uY29tL2kuanNcIik7XG5cdFx0XHRcdHNlYXJjaFVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKFwicVwiLCBzZWFyY2hRdWVyeSk7XG5cdFx0XHRcdHNlYXJjaFVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKFwib1wiLCBcImpzb25cIik7XG5cdFx0XHRcdHNlYXJjaFVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKFwibFwiLCBcInVzLWVuXCIpO1xuXHRcdFx0XHRzZWFyY2hVcmwuc2VhcmNoUGFyYW1zLmFwcGVuZChcInZxZFwiLCB2cWQpO1xuXHRcdFx0XHRzZWFyY2hVcmwuc2VhcmNoUGFyYW1zLmFwcGVuZChcImZcIiwgXCIsLCwsLFwiKTtcblx0XHRcdFx0XG5cdFx0XHRcdGlmIChzYWZlU2VhcmNoID09PSBcInN0cmljdFwiKSBzZWFyY2hVcmwuc2VhcmNoUGFyYW1zLmFwcGVuZChcImtwXCIsIFwiMVwiKTtcblx0XHRcdFx0ZWxzZSBpZiAoc2FmZVNlYXJjaCA9PT0gXCJvZmZcIikgc2VhcmNoVXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoXCJrcFwiLCBcIi0yXCIpO1xuXHRcdFx0XHRlbHNlIHNlYXJjaFVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKFwia3BcIiwgXCItMVwiKTsgLy8gTW9kZXJhdGVcblxuXHRcdFx0XHRpZiAocGFnZSA+IDEpXG5cdFx0XHRcdFx0c2VhcmNoVXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoXCJzXCIsICgocGFnZVNpemUgKiAocGFnZSAtIDEpKSB8fCAwKS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRjb25zdCBzZWFyY2hSZXNwb25zZSA9IGF3YWl0IGZldGNoKHNlYXJjaFVybC50b1N0cmluZygpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0XHRcdHNpZ25hbCxcblx0XHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoIXNlYXJjaFJlc3BvbnNlLm9rKSB7XG5cdFx0XHRcdFx0d2FybihgRmFpbGVkIHRvIGZldGNoIGltYWdlIHJlc3VsdHM6ICR7c2VhcmNoUmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcblx0XHRcdFx0XHRyZXR1cm4gYEVycm9yOiBGYWlsZWQgdG8gZmV0Y2ggaW1hZ2UgcmVzdWx0czogJHtzZWFyY2hSZXNwb25zZS5zdGF0dXNUZXh0fWA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgc2VhcmNoUmVzcG9uc2UuanNvbigpO1xuXHRcdFx0XHRjb25zdCBpbWFnZVJlc3VsdHMgPSBkYXRhLnJlc3VsdHMgfHwgW107XG5cdFx0XHRcdGNvbnN0IGltYWdlVVJMcyA9IGltYWdlUmVzdWx0c1xuXHRcdFx0XHRcdC5zbGljZSgwLCBwYWdlU2l6ZSlcblx0XHRcdFx0XHQubWFwKChyZXN1bHQ6IGFueSkgPT4gcmVzdWx0LmltYWdlKVxuXHRcdFx0XHRcdC5maWx0ZXIoKHVybDogc3RyaW5nKSA9PiB1cmwgJiYgdXJsLm1hdGNoKC9cXC4oanBnfHBuZ3xnaWZ8anBlZykkL2kpKTtcblxuXHRcdFx0XHRpZiAoaW1hZ2VVUkxzLmxlbmd0aCA9PT0gMClcblx0XHRcdFx0XHRyZXR1cm4gXCJObyBpbWFnZXMgZm91bmQgZm9yIHRoZSBxdWVyeS5cIjtcblxuXHRcdFx0XHRzdGF0dXMoYEZvdW5kICR7aW1hZ2VVUkxzLmxlbmd0aH0gaW1hZ2VzLiBGZXRjaGluZy4uLmApO1xuXG5cdFx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBjdGwuZ2V0V29ya2luZ0RpcmVjdG9yeSgpO1xuXHRcdFx0XHRjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRjb25zdCBkb3dubG9hZFByb21pc2VzID0gaW1hZ2VVUkxzLm1hcChhc3luYyAodXJsOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gaSArIDE7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGltYWdlUmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcblx0XHRcdFx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0XHRcdFx0XHRzaWduYWwsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmICghaW1hZ2VSZXNwb25zZS5vaykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGJ5dGVzID0gYXdhaXQgaW1hZ2VSZXNwb25zZS5ieXRlcygpO1xuXHRcdFx0XHRcdFx0aWYgKGJ5dGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgZmlsZUV4dGVuc2lvbiA9IC9pbWFnZVxcLyhbXFx3XSspLy5leGVjKGltYWdlUmVzcG9uc2UuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnKT8uWzFdXG5cdFx0XHRcdFx0XHRcdHx8IC9cXC4oW1xcd10rKSg/OlxcPy4qKSQvLmV4ZWModXJsKT8uWzFdXG5cdFx0XHRcdFx0XHRcdHx8ICdqcGcnO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBmaWxlTmFtZSA9IGAke3RpbWVzdGFtcH0tJHtpbmRleH0uJHtmaWxlRXh0ZW5zaW9ufWA7XG5cdFx0XHRcdFx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4od29ya2luZ0RpcmVjdG9yeSwgZmlsZU5hbWUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYWxQYXRoID0gZmlsZVBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpLnJlcGxhY2UoL15DOi8sICcnKTtcblx0XHRcdFx0XHRcdGF3YWl0IHdyaXRlRmlsZShmaWxlUGF0aCwgYnl0ZXMsICdiaW5hcnknKTtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbFBhdGg7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3I6IGFueSkge1xuXHRcdFx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVycm9yLm5hbWUgPT09IFwiQWJvcnRFcnJvclwiKVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdHdhcm4oYEVycm9yIGZldGNoaW5nIGltYWdlICR7aW5kZXh9OiAke2Vycm9yLm1lc3NhZ2V9YCk7IC8vIEtlZXAgd2FybiBmb3IgZGVidWdnaW5nXG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDsgLy8gU2tpcCB0aGlzIGltYWdlIG9uIGVycm9yXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgZG93bmxvYWRlZEltYWdlVVJMcyA9IChhd2FpdCBQcm9taXNlLmFsbChkb3dubG9hZFByb21pc2VzKSkubWFwKHggPT4geCB8fCAnRXJyb3IgZG93bmxvYWRpbmcgaW1hZ2UnKTtcblx0XHRcdFx0aWYgKGRvd25sb2FkZWRJbWFnZVVSTHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0d2FybignRXJyb3IgZmV0Y2hpbmcgaW1hZ2VzJyk7XG5cdFx0XHRcdFx0cmV0dXJuIGltYWdlVVJMcztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN0YXR1cyhgRG93bmxvYWRlZCAke2Rvd25sb2FkZWRJbWFnZVVSTHMubGVuZ3RofSBpbWFnZXMgc3VjY2Vzc2Z1bGx5LmApO1xuXG5cdFx0XHRcdHJldHVybiBkb3dubG9hZGVkSW1hZ2VVUkxzO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3I6IGFueSkge1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBET01FeGNlcHRpb24gJiYgZXJyb3IubmFtZSA9PT0gXCJBYm9ydEVycm9yXCIpIHtcblx0XHRcdFx0XHRyZXR1cm4gXCJTZWFyY2ggYWJvcnRlZCBieSB1c2VyLlwiO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR3YXJuKGBFcnJvciBkdXJpbmcgc2VhcmNoOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdHJldHVybiBgRXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gO1xuXHRcdFx0fVxuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IHZpc2l0V2Vic2l0ZVRvb2wgPSB0b29sKHtcblx0XHRuYW1lOiBcIlZpc2l0IFdlYnNpdGVcIixcblx0XHRkZXNjcmlwdGlvbjogXCJWaXNpdCBhIHdlYnNpdGUgYW5kIGV4dHJhY3QgaXRzIHRleHQgY29udGVudC4gVXNlIHRoaXMgdG9vbCB3aGVuIHlvdSBoYXZlIGEgVVJMIGFuZCBuZWVkIHRvIHJlYWQgdGhlIHBhZ2UuXCIsXG5cdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0dXJsOiB6LnN0cmluZygpLmRlc2NyaWJlKFwiVGhlIFVSTCBvZiB0aGUgd2Vic2l0ZSB0byB2aXNpdC5cIiksXG5cdFx0fSxcblx0XHRpbXBsZW1lbnRhdGlvbjogYXN5bmMgKHsgdXJsIH0sIHsgc3RhdHVzLCB3YXJuLCBzaWduYWwgfSkgPT4ge1xuXHRcdFx0c3RhdHVzKGBWaXNpdGluZyAke3VybH0uLi5gKTtcblx0XHRcdGF3YWl0IHdhaXRJZk5lZWRlZCgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaGVhZGVycyA9IGdldFNwb29mZWRIZWFkZXJzKCk7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0XHRcdHNpZ25hbCxcblx0XHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0XHRcdHdhcm4oYEZhaWxlZCB0byB2aXNpdCB3ZWJzaXRlOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIGBFcnJvcjogRmFpbGVkIHRvIHZpc2l0IHdlYnNpdGU6ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGh0bWwgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdFx0XHRcdFxuXHRcdFx0XHRsZXQgdGV4dCA9IGh0bWxcblx0XHRcdFx0XHQucmVwbGFjZSgvPHNjcmlwdFxcYltePl0qPltcXHNcXFNdKj88XFwvc2NyaXB0Pi9naW0sIFwiXCIpXG5cdFx0XHRcdFx0LnJlcGxhY2UoLzxzdHlsZVxcYltePl0qPltcXHNcXFNdKj88XFwvc3R5bGU+L2dpbSwgXCJcIilcblx0XHRcdFx0XHQucmVwbGFjZSgvPCEtLVtcXHNcXFNdKj8tLT4vZ2ltLCBcIlwiKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC88KGJyfHB8ZGl2fGxpfGhbMS02XXx0cilcXHMqXFwvPz4vZ2ltLCBcIlxcblwiKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC88W14+XSs+L2csIFwiIFwiKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKVxuXHRcdFx0XHRcdC50cmltKCk7XG5cblx0XHRcdFx0dGV4dCA9IHRleHRcblx0XHRcdFx0XHQucmVwbGFjZSgvJm5ic3A7L2csIFwiIFwiKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC8mYW1wOy9nLCBcIiZcIilcblx0XHRcdFx0XHQucmVwbGFjZSgvJmx0Oy9nLCBcIjxcIilcblx0XHRcdFx0XHQucmVwbGFjZSgvJmd0Oy9nLCBcIj5cIilcblx0XHRcdFx0XHQucmVwbGFjZSgvJnF1b3Q7L2csICdcIicpO1xuXG5cdFx0XHRcdGlmICh0ZXh0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiVGhlIHdlYnNpdGUgY29udGVudCBpcyBlbXB0eS5cIjtcblx0XHRcdFx0XG5cdFx0XHRcdGlmICh0ZXh0Lmxlbmd0aCA+IDIwMDAwKSB7XG5cdFx0XHRcdFx0dGV4dCA9IHRleHQuc3Vic3RyaW5nKDAsIDIwMDAwKSArIFwiLi4uICh0cnVuY2F0ZWQpXCI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGV4dDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcblx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVycm9yLm5hbWUgPT09IFwiQWJvcnRFcnJvclwiKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFwiVmlzaXQgYWJvcnRlZCBieSB1c2VyLlwiO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR3YXJuKGBFcnJvciB2aXNpdGluZyB3ZWJzaXRlOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdHJldHVybiBgRXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gO1xuXHRcdFx0fVxuXHRcdH0sXG5cdH0pO1xuXG5cblx0dG9vbHMucHVzaChkdWNrRHVja0dvV2ViU2VhcmNoVG9vbCk7XG5cdHRvb2xzLnB1c2goZHVja0R1Y2tHb0ltYWdlU2VhcmNoVG9vbCk7XG5cdHRvb2xzLnB1c2godmlzaXRXZWJzaXRlVG9vbCk7XG5cdHJldHVybiB0b29scztcbn0iLCAiaW1wb3J0IHsgUGx1Z2luQ29udGV4dCB9IGZyb20gXCJAbG1zdHVkaW8vc2RrXCI7XG5pbXBvcnQgeyB0b29sc1Byb3ZpZGVyIH0gZnJvbSBcIi4vdG9vbHNQcm92aWRlclwiO1xuaW1wb3J0IHsgY29uZmlnU2NoZW1hdGljcyB9IGZyb20gXCIuL2NvbmZpZ1wiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWFpbihjb250ZXh0OlBsdWdpbkNvbnRleHQpIHtcblx0Ly8gUmVnaXN0ZXIgdGhlIHRvb2xzIHByb3ZpZGVyXG5cdGNvbnRleHQud2l0aENvbmZpZ1NjaGVtYXRpY3MoY29uZmlnU2NoZW1hdGljcyk7XG5cdGNvbnRleHQud2l0aFRvb2xzUHJvdmlkZXIodG9vbHNQcm92aWRlcik7XG59IiwgImltcG9ydCB7IExNU3R1ZGlvQ2xpZW50LCB0eXBlIFBsdWdpbkNvbnRleHQgfSBmcm9tIFwiQGxtc3R1ZGlvL3Nka1wiO1xuXG5kZWNsYXJlIHZhciBwcm9jZXNzOiBhbnk7XG5cbi8vIFdlIHJlY2VpdmUgcnVudGltZSBpbmZvcm1hdGlvbiBpbiB0aGUgZW52aXJvbm1lbnQgdmFyaWFibGVzLlxuY29uc3QgY2xpZW50SWRlbnRpZmllciA9IHByb2Nlc3MuZW52LkxNU19QTFVHSU5fQ0xJRU5UX0lERU5USUZJRVI7XG5jb25zdCBjbGllbnRQYXNza2V5ID0gcHJvY2Vzcy5lbnYuTE1TX1BMVUdJTl9DTElFTlRfUEFTU0tFWTtcbmNvbnN0IGJhc2VVcmwgPSBwcm9jZXNzLmVudi5MTVNfUExVR0lOX0JBU0VfVVJMO1xuXG5jb25zdCBjbGllbnQgPSBuZXcgTE1TdHVkaW9DbGllbnQoe1xuICBjbGllbnRJZGVudGlmaWVyLFxuICBjbGllbnRQYXNza2V5LFxuICBiYXNlVXJsLFxufSk7XG5cbihnbG9iYWxUaGlzIGFzIGFueSkuX19MTVNfUExVR0lOX0NPTlRFWFQgPSB0cnVlO1xuXG5sZXQgcHJlZGljdGlvbkxvb3BIYW5kbGVyU2V0ID0gZmFsc2U7XG5sZXQgcHJvbXB0UHJlcHJvY2Vzc29yU2V0ID0gZmFsc2U7XG5sZXQgY29uZmlnU2NoZW1hdGljc1NldCA9IGZhbHNlO1xubGV0IGdsb2JhbENvbmZpZ1NjaGVtYXRpY3NTZXQgPSBmYWxzZTtcbmxldCB0b29sc1Byb3ZpZGVyU2V0ID0gZmFsc2U7XG5sZXQgZ2VuZXJhdG9yU2V0ID0gZmFsc2U7XG5cbmNvbnN0IHNlbGZSZWdpc3RyYXRpb25Ib3N0ID0gY2xpZW50LnBsdWdpbnMuZ2V0U2VsZlJlZ2lzdHJhdGlvbkhvc3QoKTtcblxuY29uc3QgcGx1Z2luQ29udGV4dDogUGx1Z2luQ29udGV4dCA9IHtcbiAgd2l0aFByZWRpY3Rpb25Mb29wSGFuZGxlcjogKGdlbmVyYXRlKSA9PiB7XG4gICAgaWYgKHByZWRpY3Rpb25Mb29wSGFuZGxlclNldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUHJlZGljdGlvbkxvb3BIYW5kbGVyIGFscmVhZHkgcmVnaXN0ZXJlZFwiKTtcbiAgICB9XG4gICAgaWYgKHRvb2xzUHJvdmlkZXJTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlByZWRpY3Rpb25Mb29wSGFuZGxlciBjYW5ub3QgYmUgdXNlZCB3aXRoIGEgdG9vbHMgcHJvdmlkZXJcIik7XG4gICAgfVxuXG4gICAgcHJlZGljdGlvbkxvb3BIYW5kbGVyU2V0ID0gdHJ1ZTtcbiAgICBzZWxmUmVnaXN0cmF0aW9uSG9zdC5zZXRQcmVkaWN0aW9uTG9vcEhhbmRsZXIoZ2VuZXJhdGUpO1xuICAgIHJldHVybiBwbHVnaW5Db250ZXh0O1xuICB9LFxuICB3aXRoUHJvbXB0UHJlcHJvY2Vzc29yOiAocHJlcHJvY2VzcykgPT4ge1xuICAgIGlmIChwcm9tcHRQcmVwcm9jZXNzb3JTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlByb21wdFByZXByb2Nlc3NvciBhbHJlYWR5IHJlZ2lzdGVyZWRcIik7XG4gICAgfVxuICAgIHByb21wdFByZXByb2Nlc3NvclNldCA9IHRydWU7XG4gICAgc2VsZlJlZ2lzdHJhdGlvbkhvc3Quc2V0UHJvbXB0UHJlcHJvY2Vzc29yKHByZXByb2Nlc3MpO1xuICAgIHJldHVybiBwbHVnaW5Db250ZXh0O1xuICB9LFxuICB3aXRoQ29uZmlnU2NoZW1hdGljczogKGNvbmZpZ1NjaGVtYXRpY3MpID0+IHtcbiAgICBpZiAoY29uZmlnU2NoZW1hdGljc1NldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29uZmlnIHNjaGVtYXRpY3MgYWxyZWFkeSByZWdpc3RlcmVkXCIpO1xuICAgIH1cbiAgICBjb25maWdTY2hlbWF0aWNzU2V0ID0gdHJ1ZTtcbiAgICBzZWxmUmVnaXN0cmF0aW9uSG9zdC5zZXRDb25maWdTY2hlbWF0aWNzKGNvbmZpZ1NjaGVtYXRpY3MpO1xuICAgIHJldHVybiBwbHVnaW5Db250ZXh0O1xuICB9LFxuICB3aXRoR2xvYmFsQ29uZmlnU2NoZW1hdGljczogKGdsb2JhbENvbmZpZ1NjaGVtYXRpY3MpID0+IHtcbiAgICBpZiAoZ2xvYmFsQ29uZmlnU2NoZW1hdGljc1NldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiR2xvYmFsIGNvbmZpZyBzY2hlbWF0aWNzIGFscmVhZHkgcmVnaXN0ZXJlZFwiKTtcbiAgICB9XG4gICAgZ2xvYmFsQ29uZmlnU2NoZW1hdGljc1NldCA9IHRydWU7XG4gICAgc2VsZlJlZ2lzdHJhdGlvbkhvc3Quc2V0R2xvYmFsQ29uZmlnU2NoZW1hdGljcyhnbG9iYWxDb25maWdTY2hlbWF0aWNzKTtcbiAgICByZXR1cm4gcGx1Z2luQ29udGV4dDtcbiAgfSxcbiAgd2l0aFRvb2xzUHJvdmlkZXI6ICh0b29sc1Byb3ZpZGVyKSA9PiB7XG4gICAgaWYgKHRvb2xzUHJvdmlkZXJTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRvb2xzIHByb3ZpZGVyIGFscmVhZHkgcmVnaXN0ZXJlZFwiKTtcbiAgICB9XG4gICAgaWYgKHByZWRpY3Rpb25Mb29wSGFuZGxlclNldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVG9vbHMgcHJvdmlkZXIgY2Fubm90IGJlIHVzZWQgd2l0aCBhIHByZWRpY3Rpb25Mb29wSGFuZGxlclwiKTtcbiAgICB9XG5cbiAgICB0b29sc1Byb3ZpZGVyU2V0ID0gdHJ1ZTtcbiAgICBzZWxmUmVnaXN0cmF0aW9uSG9zdC5zZXRUb29sc1Byb3ZpZGVyKHRvb2xzUHJvdmlkZXIpO1xuICAgIHJldHVybiBwbHVnaW5Db250ZXh0O1xuICB9LFxuICB3aXRoR2VuZXJhdG9yOiAoZ2VuZXJhdG9yKSA9PiB7XG4gICAgaWYgKGdlbmVyYXRvclNldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiR2VuZXJhdG9yIGFscmVhZHkgcmVnaXN0ZXJlZFwiKTtcbiAgICB9XG5cbiAgICBnZW5lcmF0b3JTZXQgPSB0cnVlO1xuICAgIHNlbGZSZWdpc3RyYXRpb25Ib3N0LnNldEdlbmVyYXRvcihnZW5lcmF0b3IpO1xuICAgIHJldHVybiBwbHVnaW5Db250ZXh0O1xuICB9LFxufTtcblxuaW1wb3J0KFwiLi8uLi9zcmMvaW5kZXgudHNcIikudGhlbihhc3luYyBtb2R1bGUgPT4ge1xuICByZXR1cm4gYXdhaXQgbW9kdWxlLm1haW4ocGx1Z2luQ29udGV4dCk7XG59KS50aGVuKCgpID0+IHtcbiAgc2VsZlJlZ2lzdHJhdGlvbkhvc3QuaW5pdENvbXBsZXRlZCgpO1xufSkuY2F0Y2goKGVycm9yKSA9PiB7XG4gIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZXhlY3V0ZSB0aGUgbWFpbiBmdW5jdGlvbiBvZiB0aGUgcGx1Z2luLlwiKTtcbiAgY29uc29sZS5lcnJvcihlcnJvcik7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7OztBQUFBLGdCQUVhO0FBRmI7QUFBQTtBQUFBO0FBQUEsaUJBQXVDO0FBRWhDLElBQU0sdUJBQW1CLG1DQUF1QixFQUNyRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsYUFBYTtBQUFBLFFBQ2IsVUFBVTtBQUFBLFFBQ1YsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsUUFBUTtBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sS0FBSztBQUFBLFVBQ0wsS0FBSztBQUFBLFFBQ047QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsU0FBUztBQUFBLFVBQ1IsRUFBRSxPQUFPLFVBQVUsYUFBYSxTQUFTO0FBQUEsVUFDekMsRUFBRSxPQUFPLFlBQVksYUFBYSxXQUFXO0FBQUEsVUFDN0MsRUFBRSxPQUFPLE9BQU8sYUFBYSxNQUFNO0FBQUEsVUFDbkMsRUFBRSxPQUFPLFFBQVEsYUFBYSxPQUFPO0FBQUEsUUFDdEM7QUFBQSxRQUNBLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFDQyxNQUFNO0FBQUE7QUFBQTs7O0FDNkJSLGVBQXNCLGNBQWMsS0FBK0M7QUFDbEYsUUFBTSxRQUFnQixDQUFDO0FBQ3ZCLFFBQU0sZUFBZSxrQkFBa0IscUJBQXFCO0FBRTVELFFBQU0sOEJBQTBCLGtCQUFLO0FBQUEsSUFDcEMsTUFBTTtBQUFBLElBQ04sYUFBYTtBQUFBLElBQ2IsWUFBWTtBQUFB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bUJBQW1CO0FBQ3ZCLElBQUksZUFBZTtBQUVuQixJQUFNLHVCQUF1QixPQUFPLFFBQVEsd0JBQXdCO0FBRXBFLElBQU0sZ0JBQStCO0FBQUEsRUFDbkMsMkJBQTJCLENBQUMsYUFBYTtBQUN2QyxRQUFJLDBCQUEwQjtBQUM1QixZQUFNLElBQUksTUFBTSwwQ0FBMEM7QUFBQSxJQUM1RDtBQUNBLFFBQUksa0JBQWtCO0FBQ3BCLFlBQU0sSUFBSSxNQUFNLDREQUE0RDtBQUFBLElBQzlFO0FBRUEsK0JBQTJCO0FBQzNCLHlCQUFxQix5QkFBeUIsUUFBUTtBQUN0RCxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0Esd0JBQXdCLENBQUMsZUFBZTtBQUN0QyxRQUFJLHVCQUF1QjtBQUN6QixZQUFNLElBQUksTUFBTSx1Q0FBdUM7QUFBQSxJQUN6RDtBQUNBLDRCQUF3QjtBQUN4Qix5QkFBcUIsc0JBQXNCLFVBQVU7QUFDckQsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLHNCQUFzQixDQUFDQyxzQkFBcUI7QUFDMUMsUUFBSSxxQkFBcUI7QUFDdkIsWUFBTSxJQUFJLE1BQU0sc0NBQXNDO0FBQUEsSUFDeEQ7QUFDQSwwQkFBc0I7QUFDdEIseUJBQXFCLG9CQUFvQkEsaUJBQWdCO0FBQ3pELFdBQU87QUFBQSxFQUNUO0FBQUEsRUFDQSw0QkFBNEIsQ0FBQywyQkFBMkI7QUFDdEQsUUFBSSwyQkFBMkI7QUFDN0IsWUFBTSxJQUFJLE1BQU0sNkNBQTZDO0FBQUEsSUFDL0Q7QUFDQSxnQ0FBNEI7QUFDNUIseUJBQXFCLDBCQUEwQixzQkFBc0I7QUFDckUsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLG1CQUFtQixDQUFDQyxtQkFBa0I7QUFDcEMsUUFBSSxrQkFBa0I7QUFDcEIsWUFBTSxJQUFJLE1BQU0sbUNBQW1DO0FBQUEsSUFDckQ7QUFDQSxRQUFJLDBCQUEwQjtBQUM1QixZQUFNLElBQUksTUFBTSw0REFBNEQ7QUFBQSxJQUM5RTtBQUVBLHVCQUFtQjtBQUNuQix5QkFBcUIsaUJBQWlCQSxjQUFhO0FBQ25ELFdBQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxlQUFlLENBQUMsY0FBYztBQUM1QixRQUFJLGNBQWM7QUFDaEIsWUFBTSxJQUFJLE1BQU0sOEJBQThCO0FBQUEsSUFDaEQ7QUFFQSxtQkFBZTtBQUNmLHlCQUFxQixhQUFhLFNBQVM7QUFDM0MsV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUVBLHdEQUE0QixLQUFLLE9BQU1DLFlBQVU7QUFDL0MsU0FBTyxNQUFNQSxRQUFPLEtBQUssYUFBYTtBQUN4QyxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQ1osdUJBQXFCLGNBQWM7QUFDckMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxVQUFVO0FBQ2xCLFVBQVEsTUFBTSxvREFBb0Q7QUFDbEUsVUFBUSxNQUFNLEtBQUs7QUFDckIsQ0FBQzsiLAogICJuYW1lcyI6IFsidXJsIiwgImltcG9ydF9zZGsiLCAiaW1wb3J0X3NkayIsICJjb25maWdTY2hlbWF0aWNzIiwgInRvb2xzUHJvdmlkZXIiLCAibW9kdWxlIl0KfQo=
