import sharedHandler from './[...path].js';

// Explicit POST login route; invoke the shared handler rather than re-exporting it.
export default function handler(req, res) {
  return sharedHandler(req, res);
}
