# Web Search & Browse Plugin for LM Studio

Equip your local LLM with the ability to search the web, find images, and read website content directly.

> **Note:** This is an enhanced fork of the original [DuckDuckGo Search Tool Plugin](https://github.com/danielsig/lms-plugin-duckduckgo). It introduces a dedicated **"Visit Website"** tool and features optimized tool definitions to help models distinguish between *searching* for a topic and *visiting* a specific link.

## ✨ Features

### 🔍 Web Search (DuckDuckGo)
Performs searches using DuckDuckGo to find current information, news, and references.
- **Temporal Awareness:** Injects the current date into the context, allowing the model to understand relative time (e.g., "yesterday", "last week").
- **Optimized for LLMs:** The tool definition is tuned to prevent "hallucinated calls" where models might try to "search" a URL instead of visiting it.
- **Guardrails:** Built-in logic rejects URL inputs for search queries, guiding the model to use the correct tool immediately.

### 📖 Visit Website (Smart Reader)
Allows the assistant to "read" the actual content of a web page.
> **Privacy Note:** This tool makes direct network requests to the target URLs from your machine. Your IP address will be visible to the websites visited.
- **Smart Extraction:** Uses Mozilla's Readability engine to extract the main article content, ignoring navigation, footers, and cookie banners.
- **Mandatory Citations:** Automatically instructs the model to cite the source URL in its final answer.
- **Safety:** Truncates extremely long pages (max 20,000 characters) to fit within context windows.

### 🖼️ Image Search
Finds and downloads images related to a query.
- **Local Caching:** Images are downloaded to the plugin's working directory, allowing the model to reference local files.

## 🚀 How to Use

Once enabled in LM Studio, you can interact with the tools naturally.

**Example Workflow:**
1.  **User:** "What are the latest specs for the Nintendo Switch 2?"
2.  **Model:** *Uses `web_search` tool for "Nintendo Switch 2 specs"*
3.  **Model:** *Uses `visit_website` tool on the specific URL found*
4.  **Model:** "According to [Source URL], the specs are..."

## ⚙️ Configuration

You can adjust the following settings in the LM Studio plugin sidebar:

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Search Results Per Page** | Number of results to return per search (1-10). Set to `0` for auto. | `5` |
| **Safe Search** | Filter explicit content (`Strict`, `Moderate`, `Off`, or `Auto`). | `Moderate` |

## 🛠️ Installation

There are multiple ways to install this plugin:

### 1. One-Click Install
Visit the plugin page and click **"Run in LM Studio"**:  
[https://lmstudio.ai/richardbenedikt/web-search](https://lmstudio.ai/richardbenedikt/web-search)

### 2. CLI Installation
Use the `lms` CLI to install this plugin directly:
```bash
lms get richardbenedikt/web-search
```

### 3. For Developers
To clone the plugin's metadata for local development:
```bash
lms clone richardbenedikt/web-search
```

## 📄 License

This project is a fork of [lms-plugin-duckduckgo](https://github.com/danielsig/lms-plugin-duckduckgo) and is licensed under the MIT License.
