import { handleRequest } from "./handler.ts";

// Supabase invokes this entrypoint with a Request. Provider keys live only in
// the function environment, not in this file or the browser.
Deno.serve((req) => handleRequest(req));
