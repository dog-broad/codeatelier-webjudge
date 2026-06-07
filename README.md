# codeatelier-webjudge

A small headless-browser grading service for the **CodeAtelier** Moodle question
type. It grades *web (frontend) questions*: it renders a student's HTML/CSS/JS
file set in a real headless Chromium and evaluates a set of declarative DOM
assertions, authoritatively, on the server.

This is the secure counterpart of the in-browser practice tier. In the browser,
the same assertions run in a sandboxed iframe for instant feedback — but that is
forgeable and ships the test data to the student. This service runs the *same*
assertion spec where the student cannot see or tamper with it, and where hidden
assertions never leave the server. It plays the same role for frontend questions
that a code sandbox (e.g. Judge0) plays for program questions.

## How it fits

```
Moodle (qtype_codeatelier)  ──HTTP──>  codeatelier-webjudge
  POST /grade { files, assertions }       headless Chromium
                                            renders the file set
                                            runs each assertion in page context
  { results:[{pass, actual, error}] }  <──  returns per-assertion outcomes
```

The plugin reaches the service over a configurable base URL (the
**Web-judge service URL** admin setting). The service returns each assertion's
pass/fail; the plugin computes the weighted mark and stores the result. The
service is stateless.

## Run it

### Docker (recommended)

```bash
docker build -t codeatelier-webjudge .
docker run -d --name webjudge -p 4400:4400 \
  -e WEBJUDGE_TOKEN=choose-a-long-secret \
  --memory=1g --cpus=1 \
  codeatelier-webjudge
curl http://localhost:4400/health
```

Then in Moodle: *Site administration → Plugins → Question types → CodeAtelier*,
set **Web-judge service URL** to `http://<host>:4400` (and the matching auth
token). A question authored as *Web page* in **Secure mode** will then grade
through this service.

### Bare Node (development)

```bash
npm install
npx playwright install chromium   # only needed outside the Docker image
npm start
```

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `4400` | Port to listen on. |
| `WEBJUDGE_TOKEN` | *(unset)* | If set, `POST /grade` requires a matching `X-Auth-Token` header. Leave unset only on a fully private network. |

## API

### `GET /health`
`200 { "status": "ok", "service": "codeatelier-webjudge", "version": "x.y.z" }`

### `POST /grade`
Request:
```json
{
  "files": [{ "name": "index.html", "content": "..." }],
  "assertions": [
    { "selector": "#title", "property": "text", "matcher": "equals",
      "expected": "Hello", "actions": "click #go" }
  ],
  "timeoutMs": 5000
}
```
- `property`: `text` | `exists` | `count` | `attr:<name>` | `style:<cssProp>`
- `matcher`: `equals` | `contains` | `regex`
- `actions` (optional): one per line, `click <selector>` or `type <selector> <value>`

Response:
```json
{ "results": [ { "pass": true, "actual": "Hello", "error": null } ] }
```
Each assertion is graded in a freshly rendered page (its own actions, then its one
check), so assertions are isolated. The service does not compute the final mark.

## Security & operations

This service **runs untrusted student code in a real browser**. Treat it like any
code sandbox:

- **Network isolation.** Each grade runs in an `offline` browser context, so the
  rendered page cannot fetch or exfiltrate. Still, deploy the service on a private
  network reachable **only** from the Moodle server; do not expose it to the
  public internet. Set `WEBJUDGE_TOKEN`.
- **Resource limits.** Run under a container with CPU/memory caps (`--memory`,
  `--cpus`) and restart-on-failure. A pathological page can spin; the per-assertion
  navigation timeout bounds each check, but OS-level caps are the real guard.
- **`--no-sandbox`.** Chromium runs with `--no-sandbox` (standard in containers).
  Rely on the container/VM boundary for isolation, not Chromium's own sandbox.
- **Scale.** The service grades sequentially within a request and reuses one
  browser. For exam bursts, run several replicas behind a load balancer; the
  plugin grades asynchronously, so latency (not throughput) is what each replica
  bounds.
- **No persistence.** The service stores nothing; inputs live only for the request.

## License

GPL-3.0-or-later.
