---
name: hands-on-test
description: Performs manual hands-on testing of a web application using playwright-cli. Spawns the dev server if needed, navigates to pages, performs browser actions, captures screenshots, checks outcomes, and produces a structured test report. Use when the user wants to visually verify a web feature, perform exploratory testing, or validate UI behavior.
allowed-tools: Bash(playwright-cli:*), Bash(docker compose:*), Bash(lsof:*), Bash(curl:*), Bash(mkdir:*), Bash(date:*), Read, Write
---

# Hands-On Testing with playwright-cli

Perform manual browser-based testing of a web application and produce a structured test report with screenshots and console output.

## Workflow

### Phase 1: Environment Setup

#### 1.1 Create the test output directory

Generate a timestamp-based output directory for this test run:

```bash
TEST_OUTPUT_DIR="$CLAUDE_PROJECT_DIR/test-output/$(date +%Y%m%d%H%M)"
mkdir -p "$TEST_OUTPUT_DIR"
```

All screenshots and the report for this run will be saved under this directory.

#### 1.2 Check if the dev server is running

```bash
# Check if something is listening on the expected port
lsof -i :3000 -sTCP:LISTEN
# or
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

#### 1.3 Start the dev server if not running

Detect the project's dev server command from project files (`compose.yml`, `package.json`, `Makefile`, etc.) and start it in the background.

```bash
# Example: Docker Compose project
docker compose up -d

# Example: Node.js project
# npm run dev &
```

Wait for the server to become ready:

```bash
# Poll until the server responds
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200" && break
  sleep 1
done
```

### Phase 2: Browser Session

#### 2.1 Open the browser and navigate

```bash
playwright-cli open http://localhost:3000
```

Or navigate to a specific page to test:

```bash
playwright-cli open http://localhost:3000/path/to/test
```

#### 2.2 Take a snapshot to understand the page structure

```bash
playwright-cli snapshot
```

Use the snapshot output to identify element refs (e.g., `e1`, `e5`, `e12`) for subsequent interactions.

#### 2.3 Perform test actions

Interact with the page based on the test scenario. Common actions:

```bash
# Click elements
playwright-cli click e3

# Fill form fields
playwright-cli fill e5 "test input"

# Type text (simulates keystrokes)
playwright-cli type "search query"

# Press keys
playwright-cli press Enter

# Select dropdown options
playwright-cli select e9 "option-value"

# Check/uncheck checkboxes
playwright-cli check e12
playwright-cli uncheck e12

# Hover
playwright-cli hover e4

# Navigate
playwright-cli goto http://localhost:3000/other-page
```

After each significant action, take a snapshot to verify the page state:

```bash
playwright-cli snapshot
```

#### 2.4 Capture screenshots

Save screenshots to `$TEST_OUTPUT_DIR/` with descriptive filenames:

```bash
# Full page screenshot
playwright-cli screenshot --filename=$TEST_OUTPUT_DIR/<test-name>-<step>.png

# Screenshot of a specific element
playwright-cli screenshot e5 --filename=$TEST_OUTPUT_DIR/<test-name>-<element>.png
```

**Naming convention**: `<test-name>-<step-number>-<description>.png`

Examples:
- `login-01-initial.png`
- `login-02-filled-form.png`
- `login-03-after-submit.png`
- `dashboard-01-loaded.png`

#### 2.5 Collect console messages

```bash
playwright-cli console
```

Check for errors, warnings, or relevant log output.

#### 2.6 Collect network activity (if relevant)

```bash
playwright-cli network
```

### Phase 3: Outcome Verification

After performing actions and capturing state:

1. **Read the screenshot** using the Read tool to visually inspect the result
2. **Review the snapshot** to verify DOM state matches expectations
3. **Check console output** for errors or unexpected warnings
4. **Compare** the actual outcome against the intended behavior described in the test scenario

### Phase 4: Cleanup

```bash
playwright-cli close
```

### Phase 5: Report Generation

Write a structured test report to `$TEST_OUTPUT_DIR/REPORT.md`:

```markdown
# Hands-On Test Report

**Date**: YYYY-MM-DD HH:MM
**Tester**: <agent-name>
**Target**: <URL tested>

## Test Scenario

<Brief description of what was being tested>

## Steps Performed

| # | Action | Target | Details |
|---|--------|--------|---------|
| 1 | Navigate | http://localhost:3000/page | Initial page load |
| 2 | Fill | e5 (Email field) | Entered "user@example.com" |
| 3 | Click | e8 (Submit button) | Submitted form |

## Screenshots

| Step | Screenshot | Description |
|------|-----------|-------------|
| 1 | ![Step 1](test-name-01-initial.png) | Page after initial load |
| 2 | ![Step 2](test-name-02-filled.png) | Form with data entered |
| 3 | ![Step 3](test-name-03-submitted.png) | Result after submission |

## Console Output

```
<relevant console messages, warnings, or errors>
```

## Result

**Status**: PASS / FAIL

<Explanation of whether the outcome matched expectations.
If FAIL, describe the discrepancy between expected and actual behavior.>
```

## Example: Full Test Session

```bash
# Phase 1: Setup
TEST_OUTPUT_DIR="$CLAUDE_PROJECT_DIR/test-output/$(date +%Y%m%d%H%M)"
mkdir -p "$TEST_OUTPUT_DIR"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# If not running:
docker compose up -d
# Wait for ready
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200" && break
  sleep 1
done

# Phase 2: Test
playwright-cli open http://localhost:3000/login
playwright-cli snapshot
playwright-cli screenshot --filename=$TEST_OUTPUT_DIR/login-01-initial.png

playwright-cli fill e5 "user@example.com"
playwright-cli fill e8 "password123"
playwright-cli screenshot --filename=$TEST_OUTPUT_DIR/login-02-filled.png

playwright-cli click e10
playwright-cli snapshot
playwright-cli screenshot --filename=$TEST_OUTPUT_DIR/login-03-result.png

playwright-cli console

# Phase 3: Verify
# Read screenshots to visually verify
# Check snapshot for expected DOM state
# Review console for errors

# Phase 4: Cleanup
playwright-cli close

# Phase 5: Write report to $TEST_OUTPUT_DIR/REPORT.md
```

## Tips

- Always take a snapshot before interacting to identify correct element refs
- Capture screenshots at meaningful checkpoints, not after every micro-action
- Include both "before" and "after" screenshots for state-changing actions
- Check console output after actions that trigger API calls or state changes
- Use `playwright-cli resize 1280 720` for consistent screenshot dimensions
- If a page takes time to load, use `playwright-cli run-code "async page => { await page.waitForLoadState('networkidle'); }"` before capturing
