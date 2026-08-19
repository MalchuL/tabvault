# Mozilla Readability Integration Notes

TabVault uses the official `@mozilla/readability` package to parse an acquired page into an article object. The parser receives a cloned `Document`, because Mozilla documents that `parse()` modifies its input DOM. The preview then renders only the parser’s cleaned article content after sanitizing it with DOMPurify; Mozilla explicitly recommends a sanitizer for untrusted input.

The static web app first tries a direct browser fetch, but a website’s CORS policy can refuse that request. In the Chrome extension, TabVault asks the MV3 background worker to fetch the page under the extension’s declared HTTP(S) host permissions, then parses the returned HTML in the React interface. When neither path yields readable HTML, the preview intentionally presents the saved note and a clear **Open original** fallback rather than pretending that a reader view is available.

Source: [Mozilla Readability README](https://github.com/mozilla/readability) and its [raw official documentation](https://raw.githubusercontent.com/mozilla/readability/main/README.md).
