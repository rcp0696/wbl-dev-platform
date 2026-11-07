const fs = require('fs');
const path = require('path');

async function check(requirement) {
  const requestedPath = requirement.expected_value;
  const exists = fs.existsSync(path.resolve(requestedPath));
  return {
    status: exists ? 'PASS' : 'FAIL',
    detected_value: exists ? requestedPath : null,
    message: exists ? `Required file exists: ${requestedPath}` : `Required file was not found: ${requestedPath}`
  };
}
module.exports = { check };
