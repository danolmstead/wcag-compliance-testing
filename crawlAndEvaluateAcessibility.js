const puppeteer = require('puppeteer');
const axe = require('axe-core');
const fs = require('fs');
const path = require('path');
const URL = require('url').URL;

function sanitizeDirectoryName(url) {
  return url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

async function runAccessibilityTest(url) {
  console.log(`Running accessibility test on: ${url}`);
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  await page.addScriptTag({ path: require.resolve('axe-core') });

  const results = await page.evaluate(async () => {
    return await axe.run();
  });

  await browser.close();
  console.log(`Violations found on ${url}:`, results.violations.length);
  return results.violations;
}

function generateMarkdownReportForPage(violations, url) {
  console.log(`Generating report for: ${url}`);
  let markdown = `## ${url}\n\n`;
  markdown += `- **Total Violations**: ${violations.length}\n\n`;

  if (violations.length === 0) {
    markdown += `- **No violations found.**\n\n`;
  } else {
    violations.forEach((violation, index) => {
      markdown += `### ${index + 1}. ${violation.description}\n`;
      markdown += `- **WCAG Reference**: ${violation.helpUrl}\n`;
      markdown += `- **Impact**: ${violation.impact}\n`;
      markdown += `- **Elements**:\n`;
      violation.nodes.forEach((node) => {
        markdown += `  - \`\`\`html\n    ${node.html}\n    \`\`\`\n`;
      });
      markdown += '\n';
    });
  }

  console.log(`Report for ${url} generated`);
  return markdown;
}

async function collectLinks(page) {
  console.log(`Collecting links from page: ${page.url()}`);
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'));
    return anchors
      .map(anchor => anchor.href)
      .filter(href => href.startsWith(window.location.origin) && !href.includes('#')); // Filter out internal anchors
  });
  console.log(`Collected links: ${links.length}`);
  return [...new Set(links)]; // Remove duplicates
}

async function crawlAndEvaluate(rootUrl) {
  console.log(`Starting crawl and evaluation for: ${rootUrl}`);
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(rootUrl, { waitUntil: 'networkidle2' });

  const rootViolations = await runAccessibilityTest(rootUrl);
  let overallReport = `# Accessibility Evaluation Report\n\n`;
  overallReport += generateMarkdownReportForPage(rootViolations, rootUrl);

  const links = await collectLinks(page);
  await browser.close();

  if (links.length === 0) {
    overallReport += `<h3 style="background-color:yellow;">No child pages found.</h3>\n\n`;
  } else {
    for (const link of links) {
      const violations = await runAccessibilityTest(link);
      const pageReport = generateMarkdownReportForPage(violations, link);
      overallReport += pageReport;
    }
  }

  const rootDirName = sanitizeDirectoryName(rootUrl);
  if (!fs.existsSync(rootDirName)) {
    fs.mkdirSync(rootDirName);
  }

  const reportFilePath = path.join(rootDirName, 'accessibility-evaluation-report.md');
  fs.writeFileSync(reportFilePath, overallReport);
  console.log(`Overall report saved to ${reportFilePath}`);
}

const rootUrl = process.argv[2];

crawlAndEvaluate(rootUrl).catch((error) => {
  console.error("Error during crawling and evaluation:", error);
});
