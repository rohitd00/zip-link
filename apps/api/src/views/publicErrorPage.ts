// These pages are intentionally static: they never interpolate a
// destination URL, owner identity, or any other request-derived value, so
// there is no untrusted content to escape. See Section 11 of
// design-specification.md for the exact required copy and layout intent.

const SHARED_PAGE_STYLES = `
  body {
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background-color: #FBFBFC;
    color: #0F0F13;
    letter-spacing: -0.011em;
    display: flex;
    min-height: 100vh;
    align-items: center;
    justify-content: center;
    margin: 0;
  }
  main {
    max-width: 420px;
    text-align: center;
    padding: 24px;
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }
  p {
    color: #6B6B76;
    line-height: 1.5;
  }
  a {
    display: inline-block;
    margin-top: 20px;
    color: #5B57E0;
    text-decoration: none;
    font-weight: 600;
  }
`;

export function renderLinkUnavailableHtmlPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Link unavailable</title>
    <style>${SHARED_PAGE_STYLES}</style>
  </head>
  <body>
    <main>
      <h1>This link is unavailable</h1>
      <p>It may have been removed, or the address may be incorrect.</p>
      <a href="/">Go to home</a>
    </main>
  </body>
</html>`;
}

export function renderLinkExpiredHtmlPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Link expired</title>
    <style>${SHARED_PAGE_STYLES}</style>
  </head>
  <body>
    <main>
      <h1>This link has expired</h1>
      <p>The person who created it set an end time for this link.</p>
      <a href="/">Go to home</a>
    </main>
  </body>
</html>`;
}
