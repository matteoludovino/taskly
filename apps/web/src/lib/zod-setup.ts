import { z } from "zod";

// Zod probes `new Function("")` to decide whether to compile fast parsers; under our CSP (no 'unsafe-eval')
// the probe shows up as a violation. In the browser the interpreted parsers are fast enough. Import this
// module before parsing anything with Zod in the web app.
z.config({ jitless: true });
