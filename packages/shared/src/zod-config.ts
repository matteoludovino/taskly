import { z } from "zod";

// Zod decides, when each object schema is created, whether to compile a fast parser with
// `new Function`, probing for eval first. Browsers run the web app under a CSP without 'unsafe-eval',
// where the probe shows up as a violation: parse without compiling there. The server keeps the fast
// parsers. This module is imported first by the package index, before any schema exists.
if ("window" in globalThis) z.config({ jitless: true });
