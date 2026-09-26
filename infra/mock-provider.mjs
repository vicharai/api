// Vichar stage-1 failover-test upstream: serves canned OpenAI-compatible
// completions so provider switching/fallback can be exercised without a second
// paid provider. Managed by supervisord program [program:mock-openai].
import { startMockServer } from "/app/apps/gateway/dist/test-utils/mock-openai-server.js";

const port = Number(process.env.MOCK_PROVIDER_PORT ?? 4499);
const url = await startMockServer(port);
console.log(`mock provider listening at ${url}`);
